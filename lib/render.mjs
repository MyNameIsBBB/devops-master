// Turns stack + answers into files. Returns Map<relativePath, content>.
const L = (...lines) => lines.join('\n') + '\n';
const tick = (s) => '`' + s + '`';
const target = (a) => ({ dokploy: 'Dokploy', vps: 'VPS/VM', static: 'static host', k8s: 'Kubernetes' })[a.target] || a.target;

export function render(stack, a) {
  const files = new Map();
  const port = a.port || stack.port || 3000;
  const health = a.health && a.health !== 'none' ? a.health : null;
  const hasDb = a.db && a.db !== 'none' && a.db !== 'sqlite';
  const usesProxy = a.proxy === 'traefik' || a.proxy === 'caddy';

  if (a.method !== 'git-pull') files.set('Dockerfile', dockerfile(stack, port));
  files.set('.dockerignore', dockerignore(stack));
  files.set('compose.yaml', compose(stack, a, port, health, hasDb, usesProxy));
  files.set('.env.example', envExample(a, port));
  if (a.proxy === 'caddy') {
    const host = a.domain && a.domain !== 'none' ? a.domain : ':80';
    files.set('Caddyfile', L(host + ' {', '  reverse_proxy app:' + port, '}'));
  }
  if (a.ci === 'github') files.set('.github/workflows/deploy.yml', ciWorkflow(a));
  if (a.backup === 'daily-tar') files.set('scripts/backup.sh', backupScript());

  files.set('devops/README.md', readme(stack, a));
  files.set('devops/deploy.md', deployDoc(a, port));
  files.set('devops/docker.md', dockerDoc(stack, port));
  files.set('devops/env.md', envDoc(a, hasDb));
  if (a.ci === 'github') files.set('devops/ci.md', ciDoc());
  if (a.backup === 'daily-tar') files.set('devops/backup.md', backupDoc());
  files.set('devops/rollback.md', rollbackDoc(a));
  files.set('devops/troubleshooting.md', troubleshootDoc());
  return files;
}

function dockerfile(s, port) {
  if (s.language === 'node') {
    const pm = s.pkgManager;
    const install = pm === 'pnpm' ? 'corepack enable && pnpm install --frozen-lockfile'
      : pm === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci';
    const build = s.buildCmd ? 'RUN ' + s.buildCmd : '';
    if (s.framework === 'vite') return L('# syntax=docker/dockerfile:1', 'FROM node:22-alpine AS build', 'WORKDIR /app',
      'COPY . .', 'RUN ' + install, build, '', 'FROM nginx:alpine', 'COPY --from=build /app/dist /usr/share/nginx/html', 'EXPOSE 80');
    return L('# syntax=docker/dockerfile:1', 'FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY . .', 'RUN ' + install, build,
      '', 'FROM node:22-alpine', 'ENV NODE_ENV=production', ...(pm === 'npm' ? [] : ['RUN corepack enable']),
      'WORKDIR /app', 'COPY --from=build /app ./', 'USER node',
      'EXPOSE ' + port, 'CMD ' + JSON.stringify(['sh', '-c', s.startCmd || 'node index.js']));
  }
  if (s.language === 'python') return L('# syntax=docker/dockerfile:1', 'FROM python:3.12-slim',
    'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1', 'WORKDIR /app', 'COPY requirements.txt ./',
    'RUN pip install --no-cache-dir -r requirements.txt', 'COPY . .', 'RUN useradd -m app && chown -R app /app',
    'USER app', 'EXPOSE ' + port, 'CMD ' + JSON.stringify(s.startCmd.split(' ')));
  if (s.language === 'go') return L('# syntax=docker/dockerfile:1', 'FROM golang:1.23-alpine AS build', 'WORKDIR /src',
    'COPY . .', 'RUN CGO_ENABLED=0 go build -o /out/app .', '', 'FROM alpine:3.20', 'RUN adduser -D app', 'USER app',
    'COPY --from=build /out/app /app', 'EXPOSE ' + port, 'CMD ["/app"]');
  return L('# syntax=docker/dockerfile:1', 'FROM nginx:alpine', 'COPY . /usr/share/nginx/html', 'EXPOSE 80');
}

function dockerignore(s) {
  const base = ['.git', '.env', '*.log', 'devops', '.github', 'node_modules'];
  if (s.language === 'python') base.push('__pycache__', '.venv');
  return L(...base);
}

function compose(s, a, port, health, hasDb, usesProxy) {
  const lines = ['name: app', 'services:', '  app:'];
  if (a.method === 'git-pull') lines.push('    image: ' + s.runtime);
  else lines.push('    build: .', '    image: app:${APP_TAG:-latest}');
  lines.push('    restart: unless-stopped', '    env_file: .env');
  if (usesProxy) lines.push('    expose:', '      - "' + port + '"');
  else lines.push('    ports:', '      - "${HOST_PORT:-' + port + '}:' + port + '"');
  if (health) {
    const url = 'http://localhost:' + port + health;
    const test = s.language === 'python'
      ? '["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen(\'' + url + '\')"]'
      : '["CMD", "wget", "-qO-", "' + url + '"]';
    lines.push('    healthcheck:', '      test: ' + test, '      interval: 30s', '      timeout: 5s', '      retries: 3');
  }
  if (a.proxy === 'traefik') {
    const host = a.domain && a.domain !== 'none' ? a.domain : 'app.localhost';
    lines.push('    labels:', '      - "traefik.enable=true"', '      - "traefik.http.routers.app.rule=Host(`' + host + '`)"',
      '      - "traefik.http.routers.app.tls.certresolver=letsencrypt"',
      '      - "traefik.http.services.app.loadbalancer.server.port=' + port + '"');
  }
  if (a.db === 'sqlite') lines.push('    volumes:', '      - app-data:/app/data');
  if (hasDb) lines.push('    depends_on:', '      - db');
  if (hasDb) {
    const img = a.db === 'postgres' ? 'postgres:16-alpine' : 'mysql:8';
    const vol = a.db === 'postgres' ? '/var/lib/postgresql/data' : '/var/lib/mysql';
    lines.push('  db:', '    image: ' + img, '    restart: unless-stopped', '    env_file: .env',
      '    volumes:', '      - db-data:' + vol);
  }
  if (a.proxy === 'caddy') lines.push('  caddy:', '    image: caddy:2-alpine', '    restart: unless-stopped', '    ports:',
    '      - "80:80"', '      - "443:443"', '    volumes:', '      - ./Caddyfile:/etc/caddy/Caddyfile:ro', '      - caddy-data:/data');
  const vols = [];
  if (a.db === 'sqlite') vols.push('app-data');
  if (hasDb) vols.push('db-data');
  if (a.proxy === 'caddy') vols.push('caddy-data');
  if (vols.length) lines.push('volumes:', ...vols.map(v => '  ' + v + ':'));
  return L(...lines);
}

function envExample(a, port) {
  const l = ['# Copy to .env on the target. Never commit .env.', 'APP_ENV=production', 'PORT=' + port];
  if (a.domain && a.domain !== 'none') l.push('PUBLIC_URL=https://' + a.domain);
  if (a.db === 'postgres') l.push('POSTGRES_USER=app', 'POSTGRES_PASSWORD=change-me', 'POSTGRES_DB=app', 'DATABASE_URL=postgres://app:change-me@db:5432/app');
  if (a.db === 'mysql') l.push('MYSQL_ROOT_PASSWORD=change-me', 'MYSQL_DATABASE=app', 'MYSQL_USER=app', 'MYSQL_PASSWORD=change-me');
  if (a.db === 'sqlite') l.push('DATABASE_URL=file:/app/data/app.db');
  return L(...l);
}

function ciWorkflow(a) {
  const deploy = a.target === 'dokploy'
    ? L('      - name: Trigger Dokploy deploy', '        run: curl -fsS -X POST "$DOKPLOY_DEPLOY_HOOK"',
        '        env:', '          DOKPLOY_DEPLOY_HOOK: ${{ secrets.DOKPLOY_DEPLOY_HOOK }}').trimEnd()
    : '      - name: Deploy over SSH\n        run: echo "Replace with your ssh deploy step (see devops/ci.md)"';
  return L('name: deploy', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read',
    'jobs:', '  build-test-deploy:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
    '      - name: Build image', '        run: docker build -t app:${{ github.sha }} .', deploy);
}

function backupScript() {
  return L('#!/usr/bin/env sh', '# Usage: scripts/backup.sh <volume-name> <dest-dir>', 'set -eu',
    'VOL="${1:?volume name}"; DEST="${2:-./backups}"', 'mkdir -p "$DEST"',
    'docker run --rm -v "$VOL":/data:ro -v "$(cd "$DEST" && pwd)":/backup alpine \\',
    '  tar czf "/backup/$VOL-$(date +%F).tgz" -C /data .',
    'find "$DEST" -name "$VOL-*.tgz" -mtime +14 -delete');
}

function readme(s, a) {
  const rows = ['| [deploy.md](deploy.md) | How to deploy, step by step |', '| [docker.md](docker.md) | Image and compose files |',
    '| [env.md](env.md) | Environment variables and secrets |'];
  if (a.ci === 'github') rows.push('| [ci.md](ci.md) | CI pipeline |');
  if (a.backup === 'daily-tar') rows.push('| [backup.md](backup.md) | Volume backups |');
  rows.push('| [rollback.md](rollback.md) | Going back to a previous version |', '| [troubleshooting.md](troubleshooting.md) | Common failures |');
  return L('# DevOps notes', '', 'Generated by devops-master. Stack: **' + s.language + ' / ' + s.framework + '**. Target: **' + target(a) + '**.', '',
    '| File | Topic |', '|---|---|', ...rows, '',
    'Answers used: ' + Object.entries(a).map(([k, v]) => k + '=' + v).join(', ') + '.');
}

function deployDoc(a, port) {
  const steps = a.target === 'dokploy'
    ? ['In Dokploy, create a **Compose** service pointing at this repo (branch `main`).',
       'Set the environment variables from [env.md](env.md) in the Dokploy UI.',
       'Set domain to `' + (a.domain || 'none') + '` and port `' + port + '` if the proxy is Dokploy-managed.',
       'Click **Deploy**.', 'Check the health endpoint and logs.']
    : a.target === 'static' ? ['Build the image: `docker build -t app .`', 'Run: `docker run -d -p 80:80 app`', 'Point the static host or CDN at it.']
    : a.target === 'k8s' ? ['Build and push the image to your registry.',
       'Write Deployment/Service manifests from the compose file (not generated by this tool yet).', 'Apply with `kubectl apply -f`.']
    : ['Copy the repo to the VM (git clone / pull).', 'Create `.env` from `.env.example` and fill in secrets.',
       '`docker compose up -d --build`', 'Check with `docker compose ps` and `docker compose logs -f app`.'];
  const hc = a.health && a.health !== 'none' ? ' (health path `' + a.health + '`)' : '';
  return L('# Deploy', '', 'Target: **' + target(a) + '** · Method: **' + a.method + '** · Port: **' + port + '** · Domain: **' + (a.domain || 'none') + '**', '',
    '## Steps', ...steps.map((x, i) => (i + 1) + '. ' + x), '', '## Check after deploy',
    '- App answers on port ' + port + hc + '.', '- `docker compose ps` shows `healthy` if a healthcheck is set.',
    '- No secrets in git: `git ls-files | grep -E "(^|/)\\.env$"` prints nothing.');
}

function dockerDoc(s, port) {
  return L('# Docker', '', '- Base runtime: `' + (s.runtime || 'see Dockerfile') + '`', '- Exposed port: ' + port,
    '- Build locally: `docker build -t app .`', '- Run locally: `docker compose up --build`',
    '- `.dockerignore` keeps `.git`, `.env` and `devops/` out of the image.');
}

function envDoc(a, hasDb) {
  return L('# Environment', '', 'Keep real values in `.env` on the target (or the platform env settings). Commit only `.env.example`.', '',
    'Secret source: **' + a.secrets + '**.', ...(hasDb ? ['', 'Database credentials are required before the first `compose up`.'] : []), '',
    'Rotate any value that was ever pasted into chat, a ticket or a commit.');
}

function ciDoc() {
  return L('# CI', '', 'Workflow: `.github/workflows/deploy.yml`. Runs on push to `main`.', '1. Checkout',
    '2. Build the image tagged with the commit SHA', '3. Deploy step (Dokploy webhook or SSH; set the secret first)', '',
    'Add `DOKPLOY_DEPLOY_HOOK` (or your SSH key secret) under repo Settings → Secrets. Never print it in logs.');
}

function backupDoc() {
  return L('# Backup', '', '`scripts/backup.sh <volume> <dest>` makes a dated tar of a Docker volume and removes archives older than 14 days.', '',
    'Schedule with cron on the target, e.g. `0 3 * * * /path/to/scripts/backup.sh app_db-data /backups`.', 'Test a restore once before relying on it.');
}

function rollbackDoc(a) {
  if (a.rollback === 'git-revert') return L('# Rollback', '', '1. `git revert <bad-commit>` and push to main.',
    '2. Redeploy (Dokploy: Deploy; VPS: `git pull && docker compose up -d --build`).');
  return L('# Rollback', '', '1. Find the previous image tag (`docker images app`).', '2. Set `APP_TAG=<previous>` and run `docker compose up -d`.',
    '3. Record the tag before every deploy.');
}

function troubleshootDoc() {
  return L('# Troubleshooting', '', '| Symptom | Check |', '|---|---|',
    '| Container exits | `docker compose logs app`; missing env var? |',
    '| Port not reachable | Port in compose matches app listen port; firewall; proxy labels |',
    '| Unhealthy | Health path exists and returns 2xx |',
    '| DB refuses connection | `db` service healthy; DATABASE_URL host is `db` |');
}

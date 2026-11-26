// Turns detected stack + answers into files. Returns Map<relativePath, content>.
// Never includes real secrets. Pure function: no filesystem access.
const L = (...lines) => lines.join('\n') + '\n';
const TARGET = { dokploy: 'Dokploy', vps: 'VPS/VM', static: 'static host', k8s: 'Kubernetes' };
const hasDomain = (a) => a.domain && a.domain !== 'none';

export function render(stack, a) {
  const files = new Map();
  const port = a.port || stack.port || 3000;
  const hasDb = a.db === 'postgres' || a.db === 'mysql';
  const healthPath = a.health && a.health !== 'none' ? a.health : null;
  const s = stack;

  // Build: keep an existing Dockerfile untouched; otherwise use template or Nixpacks.
  if (s.strategy === 'template') files.set('Dockerfile', dockerfile(s, port));
  if (s.strategy === 'nixpacks') files.set('scripts/build-nixpacks.sh', nixpacksScript());
  files.set('.dockerignore', dockerignore(s));
  files.set('compose.yaml', compose(s, a, port, healthPath, hasDb));
  files.set('.env.example', envExample(a, port));
  if (a.proxy === 'caddy') files.set('Caddyfile', L((hasDomain(a) ? a.domain : ':80') + ' {', '  reverse_proxy app:' + port, '}'));
  if (a.ci === 'github') files.set('.github/workflows/deploy.yml', ciWorkflow(a, s));
  if (a.backup === 'daily-tar') files.set('scripts/backup.sh', backupScript());

  files.set('devops/README.md', readme(s, a));
  files.set('devops/deploy.md', deployDoc(s, a, port));
  files.set('devops/build.md', buildDoc(s));
  files.set('devops/env.md', envDoc(a, hasDb));
  files.set('devops/proxy.md', proxyDoc(a));
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
      : pm === 'yarn' ? 'yarn install --frozen-lockfile'
      : (s.notes.some(n => n.includes('No lockfile')) ? 'npm install' : 'npm ci');
    const build = s.buildCmd ? 'RUN ' + s.buildCmd : '';
    if (s.framework === 'vite') return L('# syntax=docker/dockerfile:1', 'FROM node:22-alpine AS build', 'WORKDIR /app',
      'COPY . .', 'RUN ' + install, build, '', 'FROM nginx:alpine', 'COPY --from=build /app/dist /usr/share/nginx/html', 'EXPOSE 80');
    const start = s.startCmd || 'node index.js';
    return L('# syntax=docker/dockerfile:1', 'FROM node:22-alpine AS build', 'WORKDIR /app', 'COPY . .', 'RUN ' + install, build,
      '', 'FROM node:22-alpine', 'ENV NODE_ENV=production', ...(pm === 'npm' ? [] : ['RUN corepack enable']),
      'WORKDIR /app', 'COPY --from=build /app ./', 'USER node', 'EXPOSE ' + port, 'CMD ' + JSON.stringify(['sh', '-c', start]));
  }
  if (s.language === 'python') {
    const hasReqs = s.installCmd && s.installCmd.includes('requirements.txt');
    const install = hasReqs
      ? ['COPY requirements.txt ./', 'RUN ' + s.installCmd, 'COPY . .']
      : ['COPY . .', 'RUN ' + s.installCmd];  // pyproject install needs the source present
    return L('# syntax=docker/dockerfile:1', 'FROM python:3.12-slim',
    'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1', 'WORKDIR /app', ...install, 'RUN useradd -m app && chown -R app /app',
    'USER app', 'EXPOSE ' + port, 'CMD ' + JSON.stringify((s.startCmd || 'python main.py').split(' '))); }
  if (s.language === 'go') return L('# syntax=docker/dockerfile:1', 'FROM golang:1.23-alpine AS build', 'WORKDIR /src',
    'COPY . .', 'RUN mkdir -p /out && CGO_ENABLED=0 ' + (s.buildCmd || 'go build -o /out/app .'), '', 'FROM alpine:3.20', 'RUN adduser -D app', 'USER app',
    'COPY --from=build /out/app /app', 'EXPOSE ' + port, 'CMD ["/app"]');
  return L('# syntax=docker/dockerfile:1', 'FROM nginx:alpine', 'COPY . /usr/share/nginx/html', 'EXPOSE 80');
}

function nixpacksScript() {
  return L('#!/usr/bin/env sh', '# Builds the image with Nixpacks (no Dockerfile in this repo).',
    '# Needs the nixpacks CLI: https://nixpacks.com/docs/install', 'set -eu',
    'nixpacks build . --name app:${1:-latest}');
}

function dockerignore(s) {
  const base = ['.git', '.env', '*.log', 'devops', '.github', 'node_modules', '.next', 'dist', 'target'];
  if (s.language === 'python') base.push('__pycache__', '.venv', 'venv');
  return L(...base);
}

function compose(s, a, port, healthPath, hasDb) {
  const lines = ['name: app', 'services:', '  app:'];
  const image = a.method === 'registry' ? '    image: ${APP_IMAGE:?set APP_IMAGE to the pushed image}'
    : s.strategy === 'nixpacks' ? '    image: app:latest'
    : '    build: .\n    image: app:${APP_TAG:-latest}';
  lines.push(...image.split('\n'));
  lines.push('    restart: unless-stopped', '    env_file: .env');
  if (a.proxy === 'none') lines.push('    ports:', '      - "${HOST_PORT:-' + port + '}:' + port + '"');
  else lines.push('    expose:', '      - "' + port + '"');
  if (healthPath) {
    const url = 'http://localhost:' + port + healthPath;
    const test = s.language === 'python'
      ? '["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen(\'' + url + '\')"]'
      : '["CMD", "wget", "-qO-", "' + url + '"]';
    lines.push('    healthcheck:', '      test: ' + test, '      interval: 30s', '      timeout: 5s', '      retries: 3');
  }
  if (a.proxy === 'traefik') {
    const host = hasDomain(a) ? a.domain : 'app.localhost';
    lines.push('    labels:', '      - "traefik.enable=true"', '      - "traefik.http.routers.app.rule=Host(`' + host + '`)"',
      '      - "traefik.http.routers.app.tls.certresolver=letsencrypt"',
      '      - "traefik.http.services.app.loadbalancer.server.port=' + port + '"');
  }
  if (a.db === 'sqlite') lines.push('    volumes:', '      - app-data:/app/data');
  if (hasDb) {
    lines.push('    depends_on:', '      - db', '  db:');
    const img = a.db === 'postgres' ? 'postgres:16-alpine' : 'mysql:8';
    const vol = a.db === 'postgres' ? '/var/lib/postgresql/data' : '/var/lib/mysql';
    lines.push('    image: ' + img, '    restart: unless-stopped', '    env_file: .env', '    volumes:', '      - db-data:' + vol);
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
  if (hasDomain(a)) l.push('PUBLIC_URL=https://' + a.domain);
  if (a.db === 'postgres') l.push('POSTGRES_USER=app', 'POSTGRES_PASSWORD=change-me', 'POSTGRES_DB=app', 'DATABASE_URL=postgres://app:change-me@db:5432/app');
  if (a.db === 'mysql') l.push('MYSQL_ROOT_PASSWORD=change-me', 'MYSQL_DATABASE=app', 'MYSQL_USER=app', 'MYSQL_PASSWORD=change-me');
  if (a.db === 'sqlite') l.push('DATABASE_URL=file:/app/data/app.db');
  if (a.method === 'registry') l.push('APP_IMAGE=ghcr.io/OWNER/REPO:latest');
  return L(...l);
}

function ciWorkflow(a, s) {
  const build = s.strategy === 'nixpacks'
    ? ['      - name: Install Nixpacks', '        run: curl -sSL https://raw.githubusercontent.com/railwayapp/nixpacks/master/install.sh | bash',
       '      - name: Build image', '        run: sh scripts/build-nixpacks.sh ${{ github.sha }}']
    : ['      - name: Build image', '        run: docker build -t app:${{ github.sha }} .'];
  const deploy = a.target === 'dokploy'
    ? ['      - name: Trigger Dokploy deploy', '        run: curl -fsS -X POST "$DOKPLOY_DEPLOY_HOOK"',
       '        env:', '          DOKPLOY_DEPLOY_HOOK: ${{ secrets.DOKPLOY_DEPLOY_HOOK }}']
    : ['      - name: Deploy (replace with your step, see devops/ci.md)', '        run: echo "no deploy step configured"'];
  return L('name: deploy', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:',
    '  build-deploy:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', ...build, ...deploy);
}

function backupScript() {
  return L('#!/usr/bin/env sh', '# Usage: scripts/backup.sh <volume-name> <dest-dir>', 'set -eu',
    'VOL="${1:?volume name}"; DEST="${2:-./backups}"', 'mkdir -p "$DEST"',
    'docker run --rm -v "$VOL":/data:ro -v "$(cd "$DEST" && pwd)":/backup alpine \\',
    '  tar czf "/backup/$VOL-$(date +%F).tgz" -C /data .',
    'find "$DEST" -name "$VOL-*.tgz" -mtime +14 -delete');
}

function readme(s, a) {
  const rows = [
    '| [deploy.md](deploy.md) | How to deploy, step by step |',
    '| [build.md](build.md) | How the image is built (Dockerfile / Nixpacks) |',
    '| [env.md](env.md) | Environment variables and secrets |',
    '| [proxy.md](proxy.md) | Domain and TLS |'];
  if (a.ci === 'github') rows.push('| [ci.md](ci.md) | CI pipeline |');
  if (a.backup === 'daily-tar') rows.push('| [backup.md](backup.md) | Volume backups |');
  rows.push('| [rollback.md](rollback.md) | Going back to a previous version |', '| [troubleshooting.md](troubleshooting.md) | Common failures |');
  return L('# DevOps notes', '', `Generated by devops-master. Stack: **${s.language} / ${s.framework}**. Target: **${TARGET[a.target] || a.target}**.`, '',
    '| File | Topic |', '|---|---|', ...rows, '',
    'Answers: ' + Object.entries(a).map(([k, v]) => k + '=' + v).join(', ') + '.');
}

function deployDoc(s, a, port) {
  const steps = a.target === 'dokploy'
    ? ['In Dokploy, create a **Compose** service pointing at this repo (branch `main`).',
       s.strategy === 'nixpacks' ? 'Build type: **Nixpacks** (no Dockerfile in the repo).' : 'Build type: **Docker Compose** (uses `compose.yaml`).',
       'Set env vars from [env.md](env.md) in the Dokploy UI.',
       `Domain: \`${hasDomain(a) ? a.domain : 'none'}\`, port \`${port}\`.`, 'Click **Deploy**, then check the health path and logs.']
    : a.target === 'static' ? ['Build the image (see [build.md](build.md)).', 'Run: `docker run -d -p 80:80 app`.', 'Point the static host or CDN at it.']
    : a.target === 'k8s' ? ['Build and push the image to your registry.',
       'Write Deployment/Service manifests from `compose.yaml` (not generated by this tool).', 'Apply with `kubectl apply -f`.']
    : ['Copy the repo to the VM (`git pull` or clone).', 'Create `.env` from `.env.example` and fill in secrets.',
       '`docker compose up -d --build`', 'Check with `docker compose ps` and `docker compose logs -f app`.'];
  return L('# Deploy', '', `Target: **${TARGET[a.target] || a.target}** · Image: **${a.method}** · Port: **${port}** · Domain: **${hasDomain(a) ? a.domain : 'none'}**`, '',
    '## Steps', ...steps.map((x, i) => (i + 1) + '. ' + x), '', '## Check after deploy',
    '- The app answers on port ' + port + (a.health && a.health !== 'none' ? ' at `' + a.health + '`' : '') + '.',
    '- `docker compose ps` shows `healthy` if a healthcheck is set.',
    '- No secrets in git: `git ls-files | grep -E "(^|/)\\.env$"` prints nothing.');
}

function buildDoc(s) {
  if (s.strategy === 'existing-dockerfile') return L('# Build', '', 'The repo already has a `Dockerfile`. It was kept unchanged.', 'Build: `docker build -t app .`');
  if (s.strategy === 'nixpacks') return L('# Build', '', 'No template matched this stack, so the image is built with **Nixpacks** (it detects the language itself).',
    'Locally: install the nixpacks CLI, then `sh scripts/build-nixpacks.sh`.', 'On Dokploy: set build type to Nixpacks.', '',
    'Notes: ' + (s.notes.join(' ') || 'none') + '.');
  return L('# Build', '', `Stack detected: **${s.language} / ${s.framework}**. Template Dockerfile generated.`, 'Build: `docker build -t app .`', '',
    s.notes.length ? 'Notes: ' + s.notes.join(' ') : 'No warnings.');
}

function envDoc(a, hasDb) {
  return L('# Environment', '', 'Real values go in `.env` on the target (or the platform env settings). Only `.env.example` is committed.', '',
    'Secret source: **' + a.secrets + '**.', ...(hasDb ? ['', 'Database credentials must be set before the first `compose up`.'] : []), '',
    'Rotate any value that was ever pasted into chat, a ticket or a commit.');
}

function proxyDoc(a) {
  if (a.proxy === 'none') return L('# Domain and TLS', '', 'No proxy in compose. The platform (Dokploy) or an external proxy handles domain and TLS.');
  if (a.proxy === 'traefik') return L('# Domain and TLS', '', 'Traefik labels on the app service route `' + (hasDomain(a) ? a.domain : 'app.localhost') + '` with Let\'s Encrypt. Traefik itself must already run on the host network with the `letsencrypt` resolver.');
  return L('# Domain and TLS', '', 'Caddy listens on 80/443 and proxies to the app (see `Caddyfile`). DNS for `' + (hasDomain(a) ? a.domain : '(none)') + '` must point to this host.');
}

function ciDoc() {
  return L('# CI', '', 'Workflow: `.github/workflows/deploy.yml`. Runs on push to `main`.', '1. Checkout', '2. Build the image tagged with the commit SHA', '3. Deploy step',
    '', 'Add `DOKPLOY_DEPLOY_HOOK` (or your deploy secret) under repo Settings → Secrets. Never print it in logs.');
}

function backupDoc() {
  return L('# Backup', '', '`scripts/backup.sh <volume> <dest>` makes a dated tar of a Docker volume and removes archives older than 14 days.', '',
    'Schedule with cron on the target, e.g. `0 3 * * * /path/to/scripts/backup.sh app_db-data /backups`.', 'Test a restore once before relying on it.');
}

function rollbackDoc(a) {
  if (a.rollback === 'git-revert') return L('# Rollback', '', '1. `git revert <bad-commit>` and push to main.', '2. Redeploy (Dokploy: Deploy; VPS: `git pull && docker compose up -d --build`).');
  return L('# Rollback', '', '1. Find the previous image tag (`docker images app`).', '2. Set `APP_TAG=<previous>` and run `docker compose up -d`.', '3. Record the tag before every deploy.');
}

function troubleshootDoc() {
  return L('# Troubleshooting', '', '| Symptom | Check |', '|---|---|',
    '| Container exits | `docker compose logs app`; missing env var? |',
    '| Port not reachable | Port in compose matches the app listen port; firewall; proxy config |',
    '| Unhealthy | Health path exists and returns 2xx |',
    '| DB refuses connection | `db` service healthy; DATABASE_URL host is `db` |');
}

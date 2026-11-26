// The 10 deploy questions. Each has numbered choices; the answer key is stable.
export const QUESTIONS = [
  { key: 'target', ask: 'Deploy target?', choices: [
    ['dokploy', 'Dokploy (Compose stack on a VM) - matches this homelab'],
    ['vps', 'Plain VPS / VM with Docker + Compose'],
    ['static', 'Static hosting (nginx container, no server runtime)'],
    ['k8s', 'Kubernetes (manifests only, no cluster bootstrap)']] },
  { key: 'method', ask: 'How is the image built and shipped?', choices: [
    ['build-on-host', 'Build Dockerfile on the target host (compose build:)'],
    ['registry', 'Build in CI, push to a registry, pull on target'],
    ['git-pull', 'No image: git pull + run process directly (not recommended)']] },
  { key: 'domain', ask: 'Public domain? (e.g. app.example.com, or "none")', free: true, default: 'none' },
  { key: 'port', ask: 'App listen port inside the container?', free: true, default: null },
  { key: 'proxy', ask: 'Reverse proxy / TLS?', choices: [
    ['traefik', 'Traefik (labels, auto TLS)'],
    ['caddy', 'Caddy sidecar (auto TLS)'],
    ['none', 'None - platform (Dokploy) handles it']] },
  { key: 'db', ask: 'Database?', choices: [
    ['none', 'None'], ['postgres', 'PostgreSQL 16 service'], ['mysql', 'MySQL 8 service'], ['sqlite', 'SQLite file in a volume']] },
  { key: 'secrets', ask: 'Where do secrets live?', choices: [
    ['env-file', '.env file on target (never committed; .env.example committed)'],
    ['platform', 'Platform env settings (Dokploy UI / CI secrets)']] },
  { key: 'ci', ask: 'CI pipeline?', choices: [
    ['github', 'GitHub Actions: test + build + deploy on push to main'],
    ['none', 'None - manual deploy only']] },
  { key: 'health', ask: 'Health check path? (e.g. /health, or "none")', free: true, default: '/' },
  { key: 'backup', ask: 'Backup for data volumes?', choices: [
    ['none', 'None (not recommended if DB is used)'],
    ['daily-tar', 'Daily tar of named volume via cron on target']] },
  { key: 'rollback', ask: 'Rollback strategy?', choices: [
    ['previous-tag', 'Keep previous image tag; re-run deploy with it'],
    ['git-revert', 'Revert the git commit and redeploy']] },
];

export const DEFAULTS = Object.fromEntries(QUESTIONS.map(q => [q.key, q.choices ? q.choices[0][0] : q.default]));

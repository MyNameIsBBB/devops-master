// The 10 deploy questions. Choices are stable keys used in answers JSON.
export const QUESTIONS = [
  { key: 'target', ask: 'Deploy target?', choices: [
    ['dokploy', 'Dokploy (Compose service on a VM) - matches this homelab'],
    ['vps', 'Plain VPS / VM with Docker + Compose'],
    ['static', 'Static hosting (image only, no compose)'],
    ['k8s', 'Kubernetes (image + docs only; no manifests generated yet)']] },
  { key: 'method', ask: 'Where is the image built?', choices: [
    ['build-on-host', 'On the target host (compose build)'],
    ['registry', 'In CI, pushed to a registry, pulled on the target']] },
  { key: 'domain', ask: 'Public domain? (e.g. app.example.com, or "none")', free: true, default: 'none' },
  { key: 'port', ask: 'App listen port inside the container? (Enter = detected)', free: true, default: null },
  { key: 'proxy', ask: 'Reverse proxy / TLS?', choices: [
    ['none', 'None - Dokploy or the platform handles it'],
    ['traefik', 'Traefik labels (auto TLS)'],
    ['caddy', 'Caddy container (auto TLS)']] },
  { key: 'db', ask: 'Database?', choices: [
    ['none', 'None'], ['postgres', 'PostgreSQL 16 service'], ['mysql', 'MySQL 8 service'], ['sqlite', 'SQLite file in a volume']] },
  { key: 'secrets', ask: 'Where do secrets live?', choices: [
    ['env-file', '.env file on the target (never committed; .env.example is)'],
    ['platform', 'Platform env settings (Dokploy UI / CI secrets)']] },
  { key: 'ci', ask: 'CI pipeline?', choices: [
    ['github', 'GitHub Actions: build image on push to main, then deploy'],
    ['none', 'None - manual deploy only']] },
  { key: 'health', ask: 'Health check path? (e.g. /health, or "none")', free: true, default: '/' },
  { key: 'backup', ask: 'Backup for data volumes?', choices: [
    ['none', 'None (not recommended if a DB is used)'],
    ['daily-tar', 'Daily tar of a named volume (cron on the target)']] },
  { key: 'rollback', ask: 'Rollback strategy?', choices: [
    ['previous-tag', 'Keep the previous image tag and redeploy it'],
    ['git-revert', 'Revert the git commit and redeploy']] },
];

export const DEFAULTS = Object.fromEntries(QUESTIONS.map(q => [q.key, q.choices ? q.choices[0][0] : q.default]));

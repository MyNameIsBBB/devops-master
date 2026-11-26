// Detect tech stack and the right build strategy. Zero dependencies.
// strategy: 'existing-dockerfile' | 'template' | 'nixpacks'
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', 'dist', 'build', 'target', '__pycache__', '.next']);
const has = (root, f) => fs.existsSync(path.join(root, f));
const read = (root, f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };

// List files up to maxDepth, skipping vendored dirs.
function walk(root, maxDepth = 3, dir = root, depth = 0, acc = []) {
  if (depth > maxDepth) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, maxDepth, full, depth + 1, acc);
    else acc.push(path.relative(root, full));
  }
  return acc;
}

const toModule = (rel) => rel.replace(/\.py$/, '').split(path.sep).join('.');

function findPyApp(root, files, pattern) {
  for (const f of files.filter(f => f.endsWith('.py'))) {
    const m = read(root, f).match(pattern);
    if (m) return { module: toModule(f), variable: m[1] };
  }
  return null;
}

export function detectStack(root) {
  const files = walk(root);
  const out = { root, language: 'unknown', framework: 'unknown', runtime: null, pkgManager: null,
    port: null, buildCmd: null, startCmd: null, strategy: 'nixpacks', notes: [] };
  const hasDockerfile = has(root, 'Dockerfile');

  if (has(root, 'package.json')) {
    const pkg = JSON.parse(read(root, 'package.json') || '{}');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    out.language = 'node';
    out.runtime = 'node:22-alpine';
    out.pkgManager = has(root, 'pnpm-lock.yaml') ? 'pnpm' : has(root, 'yarn.lock') ? 'yarn' : 'npm';
    out.framework = deps.next ? 'next' : deps.nuxt ? 'nuxt' : deps.vite ? 'vite' : deps['@nestjs/core'] ? 'nestjs'
      : deps.express ? 'express' : deps.fastify ? 'fastify' : 'plain';
    out.buildCmd = pkg.scripts?.build ? `${out.pkgManager} run build` : null;
    out.startCmd = pkg.scripts?.start ? `${out.pkgManager} start` : (pkg.main ? `node ${pkg.main}` : null);
    if (out.framework === 'next') out.port = 3000;
    if (out.framework === 'vite') { out.port = 80; out.notes.push('Vite build is static; served by nginx.'); }
    if (has(root, 'bun.lockb') || has(root, 'bun.lock')) { out.strategy = 'nixpacks'; out.notes.push('Bun lockfile found; using Nixpacks.'); }
    else out.strategy = 'template';
    if (!out.startCmd && out.framework !== 'vite') out.notes.push('No "start" script or "main" in package.json; set startCmd by hand.');
    if (out.pkgManager === 'npm' && !has(root, 'package-lock.json')) out.notes.push('No lockfile; the build uses npm install, not npm ci.');
  } else if (files.some(f => /(^|\/)(requirements\.txt|pyproject\.toml)$/.test(f))) {
    const reqFile = files.find(f => /(^|\/)requirements\.txt$/.test(f)) || files.find(f => /(^|\/)pyproject\.toml$/.test(f));
    const reqs = read(root, reqFile) + files.filter(f => f.endsWith('.toml') || f.endsWith('.txt')).map(f => read(root, f)).join('');
    out.language = 'python';
    out.runtime = 'python:3.12-slim';
    out.pkgManager = 'pip';
    out.port = 8000;
    if (/fastapi/i.test(reqs)) {
      out.framework = 'fastapi';
      const app = findPyApp(root, files, /(\w+)\s*=\s*FastAPI\(/);
      if (app) out.startCmd = `uvicorn ${app.module}:${app.variable} --host 0.0.0.0 --port 8000`;
    } else if (/django/i.test(reqs)) {
      out.framework = 'django';
      const wsgi = files.find(f => /(^|\/)wsgi\.py$/.test(f));
      if (wsgi) out.startCmd = `gunicorn ${toModule(wsgi)}:application -b 0.0.0.0:8000`;
    } else if (/flask/i.test(reqs)) {
      out.framework = 'flask';
      const app = findPyApp(root, files, /(\w+)\s*=\s*Flask\(/);
      if (app) out.startCmd = `gunicorn ${app.module}:${app.variable} -b 0.0.0.0:8000`;
    } else out.framework = 'plain';
    out.strategy = 'template';
    if (!out.startCmd) out.notes.push('Could not find the app entrypoint; set startCmd by hand (--start).');
    out.installCmd = files.some(f => /(^|\/)requirements\.txt$/.test(f)) ? 'pip install --no-cache-dir -r requirements.txt' : 'pip install --no-cache-dir .';
  } else if (has(root, 'go.mod')) {
    out.language = 'go';
    out.runtime = 'golang:1.23-alpine';
    out.framework = 'go';
    out.port = 8080;
    const mainFiles = files.filter(f => f.endsWith('.go') && /(^|\/)main\.go$/.test(f));
    const pkgPath = mainFiles.includes('main.go') ? '.' : mainFiles[0] ? './' + path.dirname(mainFiles[0]) : null;
    if (pkgPath) { out.buildCmd = `go build -o /out/app ${pkgPath}`; out.strategy = 'template'; }
    else out.notes.push('No main.go found; Go build is not set up.');
  } else if (hasDockerfile) {
    out.language = 'docker'; out.strategy = 'existing-dockerfile';
  } else if (files.some(f => f === 'index.html' || f.endsWith('/index.html'))) {
    out.language = 'static'; out.framework = 'html'; out.runtime = 'nginx:alpine'; out.port = 80; out.strategy = 'template';
  } else {
    out.notes.push('No known stack manifest. Nixpacks will try to detect the language.');
    out.strategy = 'nixpacks';
  }

  if (hasDockerfile) {
    out.strategy = 'existing-dockerfile';
    out.notes.push('Existing Dockerfile found; it is kept and used as-is.');
  }
  return out;
}

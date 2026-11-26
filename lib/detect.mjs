// Detect tech stack of a project folder. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';

const has = (root, f) => fs.existsSync(path.join(root, f));
const read = (root, f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };

export function detectStack(root) {
  const out = { root, language: 'unknown', framework: 'unknown', runtime: null, pkgManager: null,
    port: null, buildCmd: null, startCmd: null, hasDockerfile: has(root, 'Dockerfile'),
    hasCompose: has(root, 'docker-compose.yml') || has(root, 'compose.yaml'), notes: [] };

  if (has(root, 'package.json')) {
    const pkg = JSON.parse(read(root, 'package.json') || '{}');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    out.language = 'node';
    out.runtime = 'node:22-alpine';
    out.pkgManager = has(root, 'pnpm-lock.yaml') ? 'pnpm' : has(root, 'yarn.lock') ? 'yarn' : 'npm';
    out.framework = ['next', 'nuxt', 'vite', 'express', 'fastify', '@nestjs/core', 'react-scripts']
      .find(d => deps[d])?.replace('@nestjs/core', 'nestjs') ?? 'plain';
    if (deps.next) out.framework = 'next';
    if (deps.vite && !deps.next) out.framework = out.framework === 'plain' ? 'vite' : out.framework;
    out.buildCmd = pkg.scripts?.build ? `${out.pkgManager} run build` : null;
    out.startCmd = pkg.scripts?.start ? `${out.pkgManager} start` : null;
    if (out.framework === 'next') out.port = 3000;
    if (out.framework === 'vite') { out.port = 80; out.notes.push('Vite build is static; served by nginx.'); }
    if (!out.startCmd && out.framework !== 'vite') out.notes.push('No "start" script in package.json; set startCmd manually.');
  } else if (has(root, 'requirements.txt') || has(root, 'pyproject.toml')) {
    const reqs = read(root, 'requirements.txt') + read(root, 'pyproject.toml');
    out.language = 'python';
    out.runtime = 'python:3.12-slim';
    out.pkgManager = has(root, 'requirements.txt') ? 'pip' : 'pip';
    out.framework = /fastapi/i.test(reqs) ? 'fastapi' : /flask/i.test(reqs) ? 'flask' : /django/i.test(reqs) ? 'django' : 'plain';
    out.port = 8000;
    out.startCmd = out.framework === 'fastapi' ? 'uvicorn main:app --host 0.0.0.0 --port 8000'
      : out.framework === 'django' ? 'gunicorn project.wsgi:application -b 0.0.0.0:8000'
      : out.framework === 'flask' ? 'gunicorn app:app -b 0.0.0.0:8000' : null;
    if (!out.startCmd) out.notes.push('Could not infer the start command; set startCmd manually.');
  } else if (has(root, 'go.mod')) {
    out.language = 'go';
    out.runtime = 'golang:1.23-alpine';
    out.framework = 'stdlib-or-router';
    out.port = 8080;
    out.buildCmd = 'go build -o /out/app .';
  } else if (has(root, 'index.html')) {
    out.language = 'static';
    out.framework = 'html';
    out.runtime = 'nginx:alpine';
    out.port = 80;
  } else {
    out.notes.push('No known manifest found (package.json, requirements.txt/pyproject.toml, go.mod, index.html).');
  }
  return out;
}

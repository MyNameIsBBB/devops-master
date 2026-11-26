#!/usr/bin/env sh
# Smoke tests: detection + generation for the fixtures. Exit non-zero on failure.
set -eu
cd "$(dirname "$0")/.."
B=bin/devops-master.mjs
fail() { echo "FAIL: $1"; exit 1; }
T=$(mktemp -d); P=$(mktemp -d); trap 'rm -rf "$T" "$P"' EXIT
cp -r test/fixtures/node-next/. "$T"/; cp -r test/fixtures/py-fastapi/. "$P"/

node $B detect --project "$T" | grep -q '"framework": "next"' || fail "next detect"
node $B detect --project "$P" | grep -q '"framework": "fastapi"' || fail "fastapi detect"

echo '{"target":"dokploy","db":"postgres","proxy":"traefik","domain":"app.example.com","port":"3000","ci":"github","backup":"daily-tar","health":"/api/health"}' > "$T/a.json"
node $B init --project "$T" --answers "$T/a.json" >/dev/null
for f in Dockerfile compose.yaml .env.example devops/README.md devops/deploy.md devops/rollback.md; do [ -s "$T/$f" ] || fail "missing $f"; done
grep -q 'traefik.enable=true' "$T/compose.yaml" || fail "traefik label"
grep -q 'corepack enable' "$T/Dockerfile" || fail "pnpm corepack"
! grep -qE 'POSTGRES_PASSWORD=[^c]' "$T/.env.example" || fail "real-looking secret in .env.example"

echo '{"proxy":"caddy","db":"sqlite"}' > "$P/a.json"
node $B init --project "$P" --answers "$P/a.json" >/dev/null
grep -q 'reverse_proxy app:8000' "$P/Caddyfile" || fail "caddyfile"

if node $B init --project "$T" --answers "$T/a.json" >/dev/null 2>&1; then fail "overwrite should be refused"; fi
if echo '{"target":"aws"}' | node $B init --project "$P" --answers - >/dev/null 2>&1; then fail "invalid answer accepted"; fi
echo "all tests passed"

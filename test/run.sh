#!/usr/bin/env sh
# Smoke tests: detection, generation, safety rules, KB search. Exit non-zero on failure.
set -eu
cd "$(dirname "$0")/.."
B="node bin/devops-master.mjs"
fail() { echo "FAIL: $1"; exit 1; }
tmp() { d=$(mktemp -d); cp -r "test/fixtures/$1/." "$d"/; echo "$d"; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j[process.argv[1]])})' "$1"; }

# detection
[ "$($B detect --project test/fixtures/node-next | json strategy)" = template ] || fail "next strategy"
[ "$($B detect --project test/fixtures/py-fastapi | json framework)" = fastapi ] || fail "fastapi"
[ "$($B detect --project test/fixtures/go-app | json strategy)" = template ] || fail "go strategy"
[ "$($B detect --project test/fixtures/has-dockerfile | json strategy)" = existing-dockerfile ] || fail "existing dockerfile"
[ "$($B detect --project test/fixtures/unknown-bun | json strategy)" = nixpacks ] || fail "bun -> nixpacks"
[ "$($B detect --project test/fixtures/flask-pyproject | json startCmd)" = "gunicorn src.web:app -b 0.0.0.0:8000" ] || fail "flask entry"

# generation: node + traefik + postgres
T=$(tmp node-next); echo '{"target":"dokploy","db":"postgres","proxy":"traefik","domain":"app.example.com","ci":"github","backup":"daily-tar","health":"/api/health"}' > "$T/a.json"
$B init --project "$T" --answers "$T/a.json" >/dev/null
for f in Dockerfile compose.yaml .env.example devops/README.md devops/deploy.md devops/build.md devops/rollback.md .github/workflows/deploy.yml; do [ -s "$T/$f" ] || fail "missing $f"; done
grep -q 'traefik.enable=true' "$T/compose.yaml" || fail "traefik label"
grep -q 'corepack enable' "$T/Dockerfile" || fail "pnpm corepack"
grep -q 'POSTGRES_PASSWORD=change-me' "$T/.env.example" || fail "placeholder password"

# generation: existing dockerfile must be kept byte-for-byte, even with --force
D=$(tmp has-dockerfile); printf 'FROM alpine\nCMD ["echo"]\n' > "$D/Dockerfile.orig"; cp "$D/Dockerfile" "$D/before"
echo '{}' > "$D/a.json"; $B init --project "$D" --answers "$D/a.json" --force >/dev/null
cmp -s "$D/Dockerfile" "$D/before" || fail "existing Dockerfile was modified"
grep -q 'keep' "$D/devops/build.md" 2>/dev/null || grep -q 'already has a' "$D/devops/build.md" || fail "build doc for existing Dockerfile"

# nixpacks: script instead of Dockerfile
N=$(tmp unknown-bun); echo '{}' > "$N/a.json"; $B init --project "$N" --answers "$N/a.json" >/dev/null
[ -x "$N/scripts/build-nixpacks.sh" ] || fail "nixpacks script"; [ ! -f "$N/Dockerfile" ] || fail "nixpacks should not write Dockerfile"

# go: mkdir for /out
G=$(tmp go-app); echo '{}' > "$G/a.json"; $B init --project "$G" --answers "$G/a.json" >/dev/null
grep -q 'mkdir -p /out' "$G/Dockerfile" || fail "go /out"

# python pyproject-only: source copied before install
F=$(tmp flask-pyproject); echo '{}' > "$F/a.json"; $B init --project "$F" --answers "$F/a.json" >/dev/null
awk '/COPY \. \./{c=NR} /pip install/{p=NR} END{exit !(c && p && c<p)}' "$F/Dockerfile" || fail "pyproject source before install"

# registry method: compose requires APP_IMAGE, no build section
R=$(tmp node-next); echo '{"method":"registry"}' > "$R/a.json"; $B init --project "$R" --answers "$R/a.json" >/dev/null
grep -q 'APP_IMAGE:?' "$R/compose.yaml" || fail "registry image"

# safety rules
if $B init --project "$T" --answers "$T/a.json" >/dev/null 2>&1; then fail "overwrite should be refused"; fi
if echo '{"target":"aws"}' | $B init --project "$N" --answers - >/dev/null 2>&1; then fail "invalid target accepted"; fi
if echo '{"health":"health"}' | $B init --project "$N" --answers - --force >/dev/null 2>&1; then fail "health without slash accepted"; fi

# KB
$B ask "how do I rotate a leaked secret" | grep -q "rotate" || fail "kb secret"
$B ask "compose logs 502" | grep -q "502" || fail "kb 502"
$B ask "cloudflare workers" | grep -q NO_MATCH || fail "kb no-match"

# real YAML parse (skipped if js-yaml is not installed)
if [ -n "${NODE_PATH:-}" ] || node -e "require('js-yaml')" >/dev/null 2>&1; then
  node test/validate-yaml.cjs "$T/compose.yaml" compose >/dev/null || fail "compose yaml invalid"
  node test/validate-yaml.cjs "$T/.github/workflows/deploy.yml" workflow >/dev/null || fail "workflow yaml invalid"
  node test/validate-yaml.cjs "$R/compose.yaml" compose >/dev/null || fail "registry compose yaml invalid"
  
  echo "yaml validated"
else
  echo "yaml check skipped (js-yaml not installed)"
fi
echo "all tests passed"

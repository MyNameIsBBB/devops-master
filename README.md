# devops-master

A small skill + CLI that teaches an AI agent to set up deployment for a project.

1. **Detect** the tech stack (Node/Next/Vite, Python/FastAPI/Flask/Django, Go, static HTML).
2. **Ask** 11 deploy questions with numbered choices (target, build method, domain, port, proxy, DB, secrets, CI, health check, backup, rollback). The agent asks; defaults apply if the user skips.
3. **Build strategy**: keeps an existing Dockerfile; uses a template for Node, Python, Go, and static; falls back to Nixpacks for anything else.
4. **Generate** `compose.yaml`, `.env.example`, Caddyfile / CI workflow / backup script when chosen, and `devops/*.md` docs.
5. **Answer DevOps questions** with `ask`, searching the local knowledge base in `kb/`.

No dependencies: Node 18+ only.

## Use

```sh
node bin/devops-master.mjs detect --project ./my-app
node bin/devops-master.mjs questions
node bin/devops-master.mjs init --project ./my-app            # interactive (TTY)
node bin/devops-master.mjs init --project ./my-app --answers answers.json --dry-run
node bin/devops-master.mjs ask "how do I rotate a leaked secret"
NODE_PATH=/tmp/yv/node_modules sh test/run.sh                  # tests (YAML check needs js-yaml)
```

The skill for the agent is in [`skills/devops-master/SKILL.md`](skills/devops-master/SKILL.md).

## Layout

- `bin/devops-master.mjs`: CLI (`detect`, `questions`, `init`)
- `lib/detect.mjs`: stack detection
- `lib/questions.mjs`: the 11 questions and defaults
- `lib/render.mjs`: file templates
- `lib/kb.mjs`, `kb/*.md`: DevOps knowledge base for `ask`
- `skills/devops-master/SKILL.md`: agent instructions
- `test/`: fixtures and smoke test

## Limits
- No Kubernetes manifests (k8s target writes docs only).
- Does not build images or deploy. Tests run in CI or on a machine with Docker; this sandbox has none.
- Start command is inferred for FastAPI, Flask, Django and Node; otherwise pass `--start`.
- Monorepos and multiple services in one folder are not handled.
- `ask` is keyword search over `kb/`, not an LLM. Answers beyond the KB come from the agent's own knowledge.

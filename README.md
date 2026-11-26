# devops-master

A small skill + CLI that teaches an AI agent to set up deployment for a project.

1. **Detect** the tech stack (Node/Next/Vite, Python/FastAPI/Flask/Django, Go, static HTML).
2. **Ask** 10 deploy questions with numbered choices (target, build method, domain, port, proxy, DB, secrets, CI, health check, backup, rollback). The agent asks; defaults apply if the user skips.
3. **Generate** `Dockerfile`, `compose.yaml`, `.env.example`, Caddyfile / CI workflow / backup script when chosen, and `devops/*.md` docs.

No dependencies: Node 18+ only.

## Use

```sh
node bin/devops-master.mjs detect --project ./my-app
node bin/devops-master.mjs questions
node bin/devops-master.mjs init --project ./my-app            # interactive (TTY)
node bin/devops-master.mjs init --project ./my-app --answers answers.json --dry-run
sh test/run.sh                                                 # smoke tests
```

The skill for the agent is in [`skills/devops-master/SKILL.md`](skills/devops-master/SKILL.md).

## Layout

- `bin/devops-master.mjs`: CLI (`detect`, `questions`, `init`)
- `lib/detect.mjs`: stack detection
- `lib/questions.mjs`: the 10 questions and defaults
- `lib/render.mjs`: file templates
- `skills/devops-master/SKILL.md`: agent instructions
- `test/`: fixtures and smoke test

## Limits (v0)
- No Kubernetes manifests yet (k8s target writes docs only).
- Does not build images or deploy. Output is not tested against a live host.
- Templates are a starting point; check `compose.yaml` and `Dockerfile` for each app.

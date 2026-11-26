---
name: devops-master
description: Set up deployment for a project. Detects the tech stack, asks the user 10 deploy questions (numbered choices), then generates Dockerfile, compose.yaml, .env.example, optional CI/backup files, and devops/*.md docs.
---

# devops-master

Use this when the user asks to deploy a project, add Docker/Compose/CI, or write deploy docs.

## Steps

1. **Detect the stack.** Run:
   `node /workspace/devops-master/bin/devops-master.mjs detect --project <project-dir>`
   Report the language, framework, package manager, and port in one or two lines.
   If `notes` contains a warning, tell the user before asking questions.

2. **Ask the 10 questions.** Get the list with
   `node /workspace/devops-master/bin/devops-master.mjs questions`.
   Show each question with its numbered choices, one message at a time or all together.
   Let the user answer by number. Enter/empty means the first choice (or the default for free-text questions).
   Do not invent answers. If the user does not know, use the default and say so.

3. **Write an answers file** (JSON, keys from `questions`), for example `/tmp/devops-answers.json`.
   Do not put real secrets in it.

4. **Generate files.** Dry run first, then write:
   ```
   node /workspace/devops-master/bin/devops-master.mjs init --project <project-dir> --answers /tmp/devops-answers.json --dry-run
   node /workspace/devops-master/bin/devops-master.mjs init --project <project-dir> --answers /tmp/devops-answers.json
   ```
   The CLI refuses to overwrite existing files. Use `--force` only if the user agrees.

5. **Check the output.** Read the generated `compose.yaml` and `Dockerfile`. Make sure the port and health path match the app.
   If the stack needs something the templates don't cover (for example Kubernetes manifests, or a custom start command), say so and ask.

6. **Report.** List the files written. Point to `devops/README.md` as the index. State what was not verified (for example, no image was built and no deploy was run).

## Rules
- Never write real passwords, tokens or `.env` files. Only `.env.example` with `change-me` placeholders.
- Never deploy to a live host without explicit user approval.
- Dokploy: follow `devops/deploy.md`. Do not SSH into the Proxmox host to deploy.
- Keep the work inside the project folder.

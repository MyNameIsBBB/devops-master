---
name: devops-master
description: DevOps helper for any project. (1) Set up deployment: detect the stack, ask the user 11 deploy questions with numbered choices, then generate Dockerfile or Nixpacks build, compose.yaml, .env.example, optional CI/backup/Caddy files, and devops/*.md docs. (2) Answer DevOps questions (Docker, Compose, Dokploy, TLS, env/secrets, rollback, troubleshooting) using the local knowledge base.
---

# devops-master

Use this skill when the user wants to deploy a project, add Docker/Compose/CI, write deploy docs, or asks a DevOps question.
Run the CLI as `node /workspace/devops-master/bin/devops-master.mjs <command>`. Below, `DM` means that command.

## A. Set up deployment

1. **Detect.** `DM detect --project <dir>`
   Report language, framework, `strategy`, start/build commands and any `notes` in one or two lines.
   - `template`: a Dockerfile is generated.
   - `nixpacks`: no template fits; the image is built by Nixpacks (`scripts/build-nixpacks.sh`).
   - `existing-dockerfile`: the repo's Dockerfile is kept unchanged.
   If `startCmd` is missing or wrong, ask the user for it and pass `--start "CMD"` later.

2. **Ask the 11 questions.** `DM questions` lists keys and choices.
   Show them with numbers. One answer per key. Do not guess. If the user does not know, use the default and say so.
   Keys: target, method, domain, port, proxy, db, secrets, ci, health, backup, rollback.

3. **Write answers** to a JSON file (for example `/tmp/devops-answers.json`). Never put real secrets in it.

4. **Generate.** Dry run first, then write:
   ```
   DM init --project <dir> --answers /tmp/devops-answers.json --dry-run
   DM init --project <dir> --answers /tmp/devops-answers.json [--start "CMD"]
   ```
   The CLI refuses to overwrite files. Use `--force` only with the user's agreement. It never changes an existing Dockerfile.

5. **Review.** Read `compose.yaml` and the Dockerfile. Check the port, health path and start command against the app.

6. **Report.** List the files written, the start with `devops/README.md`, and what was NOT verified. The sandbox often has no Docker, so the image was probably not built; say that.

## B. Answer DevOps questions

1. Run `DM ask "<the user's question>"`.
2. If it prints entries, answer from them and cite the file (for example `kb/tls-domains.md`).
3. If it prints `NO_MATCH`, answer from general knowledge and say that the local knowledge base had no entry.
4. For a question about a specific project, run `DM detect` first, then answer.

## Rules
- Never write real passwords, tokens, or `.env` files. Only `.env.example` with `change-me` placeholders.
- Never deploy to a live host without the user's explicit approval.
- Dokploy: follow `devops/deploy.md`. Do not SSH into the Proxmox host to deploy.
- Work only inside the current project folder.
- For a secret that leaked into chat or git, say to rotate it. Do not just advise deleting the message.

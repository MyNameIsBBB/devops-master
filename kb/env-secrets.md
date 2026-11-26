# Environment variables and secrets
Tags: env, secret, password, token, .env, dotenv, rotate
- Keep real values in `.env` on the target or in the platform's env settings. Commit only `.env.example` with placeholders.
- If a secret was pasted into chat, a ticket or a commit, rotate it. Deleting the message is not enough.
- Check that no secret is tracked: `git ls-files | grep -E "(^|/)\.env$"` must print nothing.

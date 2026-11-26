# Docker Compose basics
Tags: compose, docker, yaml, up, down, logs, restart
- Start: `docker compose up -d --build`. Stop: `docker compose down` (keeps volumes). Remove volumes too: `docker compose down -v` (destroys data, ask first).
- Status: `docker compose ps`. Logs: `docker compose logs -f app`.
- Use `env_file: .env` for secrets. Never bake secrets into the image.
- `restart: unless-stopped` keeps the container up after a reboot.
- Use `expose:` when a proxy in front reaches the port; use `ports:` only when the host must be reachable directly.

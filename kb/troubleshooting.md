# Troubleshooting a failing container
Tags: error, crash, exit, unhealthy, 502, port, logs, debug
- Read logs first: `docker compose logs --tail=200 app`.
- 502 from proxy: the app is not listening on the port set in the proxy, or the container crashed.
- Unhealthy: the health path does not return 2xx; check it with `curl` inside the container.
- App listens on 127.0.0.1: set it to 0.0.0.0 (inside containers, localhost is not reachable from outside).
- Missing env var: check `.env` and `env_file` in compose.

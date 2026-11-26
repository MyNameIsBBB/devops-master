# Dokploy
Tags: dokploy, deploy, compose, domain, traefik, webhook
- Create a Compose or Application service pointing at the repo, branch `main`.
- Build type: Dockerfile / Docker Compose, or Nixpacks when there is no Dockerfile.
- Set env vars in the Dokploy UI, not in the repo.
- Domains are set in Dokploy; the port must match the app's listen port.
- Deploy webhook: use it from CI to trigger a deploy; store the URL as a secret.

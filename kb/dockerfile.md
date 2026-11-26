# Dockerfile best practices
Tags: dockerfile, image, build, cache, size, security, non-root
- Copy the lockfile and install dependencies before copying the source, so the layer cache works.
- Use multi-stage builds: build in one stage, copy only the output to a slim runtime stage.
- Run as a non-root `USER`.
- Add a `.dockerignore` that excludes `.git`, `.env`, `node_modules`, build output.
- Pin base image tags (for example `node:22-alpine`), not `latest`.

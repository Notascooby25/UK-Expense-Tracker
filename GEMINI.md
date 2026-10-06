# App Deployment Architecture & Rules

This project runs locally on a NUC using Docker and Watchtower.

**Deployment Process:**
1. Code changes made locally in this repository must be committed and pushed to `origin/main` using Git.
2. Pushing to `origin/main` triggers a GitHub Actions workflow (`publish-ghcr.yml`) which builds a multi-arch Docker image and publishes it to GitHub Container Registry (ghcr.io).
3. Watchtower (running on the NUC) polls the registry, downloads the new image, and restarts the container automatically.

**Important AI Rule:**
Whenever making code changes (`app.py`, etc.), always remind the user that changes will NOT be visible in their live app until the code is committed and pushed to GitHub. Do not attempt to use `docker restart` or `docker-compose up` on this machine, as the live app does not run directly from this folder. Instead, offer to run `git commit` and `git push` for them.

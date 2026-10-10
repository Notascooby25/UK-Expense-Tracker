# App Deployment Architecture & Rules

This project runs locally on a NUC using Docker and Watchtower.

**Deployment Process:**
1. Code changes made locally in this repository must be committed and pushed to `origin/main` using Git.
2. Pushing to `origin/main` triggers a GitHub Actions workflow (`publish-ghcr.yml`) which builds a multi-arch Docker image and publishes it to GitHub Container Registry (ghcr.io).
3. Watchtower (running on the NUC) polls the registry, downloads the new image, and restarts the container automatically.

**Important AI Rule:**
Whenever making code changes (`app.py`, etc.), always do the following:
1. Run `git commit` with an appropriate, descriptive commit message explaining what changed and why, then run `git push` for the user to trigger the GitHub Actions build.
2. Remind the user that changes will NOT be visible in their live app until the GitHub Action finishes building the image (takes ~2 minutes).
3. Since Watchtower on their NUC only polls every 24 hours, provide the user with the following exact snippet so they can instantly apply the update on their NUC via SSH:
   ```bash
   docker pull ghcr.io/notascooby25/uk-expense-tracker:latest
   docker compose -f docker-compose.prod.yml up -d
   ```
Do not attempt to use `docker restart` or `docker compose` on the local machine where you are editing the code, as the live app does not run directly from this folder.

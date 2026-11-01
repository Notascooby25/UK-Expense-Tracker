# App Deployment Architecture & Rules

This project runs locally on a NUC using Docker and Watchtower.

**Deployment Process:**
1. Code changes are committed to a working branch and go live through a pull request, once checks pass and the owner merges. Never push to `origin/main`.
2. Merging to `origin/main` triggers a GitHub Actions workflow (`publish-ghcr.yml`) which builds a multi-arch Docker image and publishes it to GitHub Container Registry (ghcr.io).
3. Watchtower (running on the NUC) polls the registry, downloads the new image, and restarts the container automatically.

**Important AI Rule:**
Follow the shared `safe-change` skill. When a release is ready to go live (`backend/`, `frontend/`, `app.py`, etc.), do the following:
1. Bump `APP_VERSION` and prepend a new release entry at the top of `CHANGELOG` in `backend/changelog.py` (and keep `frontend/package.json` `"version"` in sync) so the footer version number and changelog modal visually confirm the update in the live app.
2. Commit with a descriptive message explaining what changed and why, push the working branch, and open a pull request for the owner to merge.
3. After the merge, remind the user that changes will NOT be visible in their live app until the GitHub Action finishes building the image (takes ~2 minutes).
4. Since Watchtower on their NUC only polls every 24 hours, provide the user with the following exact snippet so they can instantly apply the update on their NUC via SSH:
   ```bash
   docker pull ghcr.io/notascooby25/uk-expense-tracker-web:latest
   docker pull ghcr.io/notascooby25/uk-expense-tracker:latest
   docker compose -f docker-compose.prod.yml up -d
   ```
Do not attempt to use `docker restart` or `docker compose` on the local machine where you are editing the code, as the live app does not run directly from this folder.

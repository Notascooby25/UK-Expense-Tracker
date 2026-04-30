# Expense Tracker

Personal Streamlit expense tracker with CSV import, dashboard analytics, and optional Google Sheets sync.

## Public Repo Note

Yes, someone else can download and run this project.

- The repo includes enough code and templates to run the app locally.
- It does not include your real secrets or personal finance data.
- Google Sheets sync is optional and only works if the user adds their own service-account credentials.

## What Is In Git

- App source and container files
- Safe Streamlit config in `.streamlit/config.toml`
- Template/example files for local setup

## What Stays Local

These files are intentionally ignored and should not be committed:

- `.streamlit/secrets.toml`
- `data/` (runtime data folder)
- `expense_database.csv`
- `settings.json`
- `saved_filters.json`
- Backup/testing folders

## Local Setup

### Quick Start

From the project root, create the local runtime files:

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
cp expense_database.example.csv data/expense_database.csv
cp settings.example.json data/settings.json
cp saved_filters.example.json data/saved_filters.json
```

Then edit `.streamlit/secrets.toml` and set at minimum:

- `[auth].username`
- `[auth].password`

If you only want the app without Google Sheets sync, you can leave the `[connections.gsheets]` block as placeholders and simply avoid using the sync feature.

1. Create your secrets file from the template:
   - Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml`
   - Fill in your auth credentials
   - Fill in Google service account credentials only if you want Sheets sync
2. Prepare runtime data files (optional):
   - Copy `expense_database.example.csv` to `data/expense_database.csv`
   - Copy `settings.example.json` to `data/settings.json`
   - Copy `saved_filters.example.json` to `data/saved_filters.json`
3. Run with Docker Compose:

```bash
docker compose up -d --build
```

Compose sets `EXPENSE_TRACKER_ENV=production`, so login requires explicit `[auth]` secrets.

4. Open the app at `http://localhost:8501`
5. Open the sidebar section named Startup Health to confirm secrets and runtime data files are configured.

### What Works Immediately

- Manual login using your local `[auth]` credentials
- Manual CSV upload
- Manual transaction entry
- Local save/load using the files under `data/`

### What Needs Extra Setup

- Google Sheets sync requires valid values in `[connections.gsheets]`
- Any real personal finance dataset must be supplied locally by the user

## Runtime Paths

The app uses environment-based file paths:

- `EXPENSE_TRACKER_DATA_DIR` (default `/app/data` in container, app directory when run directly)
- `EXPENSE_TRACKER_DB_FILE` (default `expense_database.csv`)
- `EXPENSE_TRACKER_SETTINGS_FILE` (default `settings.json`)
- `EXPENSE_TRACKER_FILTERS_FILE` (default `saved_filters.json`)
- `EXPENSE_TRACKER_ASSETS_DIR` (default app directory)
- `EXPENSE_TRACKER_LOGO_FILE` (default `logo.png`)

## Auth Modes

- `EXPENSE_TRACKER_ENV=production`: enforces secrets-based auth and disables default fallback credentials.
- `EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS=true`: explicitly enforces secrets-based auth in any environment.
- `EXPENSE_TRACKER_DEV_FALLBACK_USER` and `EXPENSE_TRACKER_DEV_FALLBACK_PASS`: optional development-only fallback credentials when auth secrets are missing.

Production recommendation:

- Set `EXPENSE_TRACKER_ENV=production` and provide `[auth]` credentials in `.streamlit/secrets.toml`.
- Do not rely on fallback credentials outside local development.

## CI Multi-Arch Build

GitHub Actions workflow:

- `.github/workflows/container-build-multiarch.yml`
- Builds for `linux/amd64` and `linux/arm64`
- Build/test only (no registry push)

This validates Intel NUC compatibility while keeping deployment manual.

## Manual Deployment To Intel NUC

1. Pull latest code on the NUC.
2. Add `.streamlit/secrets.toml` on the server.
3. Ensure `data/` exists with your runtime files.
4. Run `docker compose up -d --build`.
5. Verify login, data load/save, and dashboard tabs.

## First Publish Checklist

- Confirm `.streamlit/secrets.toml` is not tracked.
- Confirm personal CSV/JSON files are not tracked.
- Run the multi-arch workflow once from a branch/PR.
- Rotate any credentials that were previously stored in plaintext.

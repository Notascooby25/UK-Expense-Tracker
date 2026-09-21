# UK Expense Tracker

Streamlit-based expense tracker for importing, categorizing, analyzing, and exporting transaction data.

This repository contains application code, container configuration, and safe example templates. It does not include real credentials or personal finance data.

## What It Does

The app helps you build and maintain a single local transaction dataset, then explore it with dashboards, category tools, and export presets.

## Features

- Secure login via Streamlit secrets
- Import from multiple sources:
   - Google Sheets sync (optional)
   - CSV upload (auto-detect plus Monzo, HSBC, Barclaycard formats)
   - Pasted tabular transaction data
   - Manual transaction entry
- Save-to-disk workflow for persistent runtime files
- Dashboard analytics:
   - True income vs committed vs variable spend model
   - Monthly cash flow, cumulative trend, top categories, top merchants, sunburst
   - Financial year, calendar year, and rolling period filters
- Category intelligence:
   - Category standardization suggestions
   - Ignore-list controls for noisy merchants
- Data editor and bulk updates:
   - Direct table editing
   - Filtered bulk category/type updates
- Export workflow:
   - Advanced filters
   - Saved filter presets
   - Download filtered CSV
- Internal transfer tracking tab for savings/investment movement analysis

## Runtime Files

The app reads and writes runtime data from:

- data/expense_database.csv
- data/settings.json
- data/saved_filters.json

Primary transaction columns in the database CSV:

- Date
- Name
- Amount
- Transaction_Type
- Bank
- Category
- Notes
- Financial_Year

Template files provided in the repository:

- expense_database.example.csv
- settings.example.json
- saved_filters.example.json
- .streamlit/secrets.toml.example

## Quick Start

1. Clone the repository and enter the project directory.

2. Create local secrets and initial runtime files:

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
mkdir -p data
cp expense_database.example.csv data/expense_database.csv
cp settings.example.json data/settings.json
cp saved_filters.example.json data/saved_filters.json
```

3. Edit .streamlit/secrets.toml and set at least:

- [auth].username
- [auth].password

4. Start the app (local build):

```bash
docker compose up -d --build
```

5. Open http://localhost:8501

6. In the app sidebar, open Startup Health and confirm no missing runtime/secrets warnings.

## Deployment Options

### Option A: Local Build Deployment

Use docker-compose.yml:

```bash
docker compose up -d --build
```

### Option B: Prebuilt Image Deployment (GHCR)

Use docker-compose.prod.yml:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

This mode is suitable for image-based updates and includes a Watchtower-compatible label in the compose file.

### Automatic Updates (GHCR -> Server)

Production compose includes a `watchtower` service and enables update monitoring on the app container via label.

How it works:

- Push commit to `main`/`master`
- GitHub Actions publishes a new GHCR image (`latest` + SHA)
- Watchtower checks every 5 minutes (`--interval 300`)
- If a newer `latest` image exists, Watchtower pulls and recreates the app container automatically

Start/update production stack:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Check update monitor logs:

```bash
docker compose -f docker-compose.prod.yml logs -f watchtower
```

If Watchtower logs show a Docker API compatibility error such as `client version 1.25 is too old`, the production compose file pins `DOCKER_API_VERSION=1.40` for the Watchtower container to match newer Docker daemons.

Disable automatic updates:

- Stop/remove the `watchtower` service, or
- Remove the label `com.centurylinklabs.watchtower.enable=true` from the app service

### Automatic Categorization Rules

Rules are saved per account scope, so Personal and Joint can each have different auto-categorization behavior.

In the sidebar under `Advanced Settings` -> `Automatic Rules`, you can create rules that match on:

- `Person / merchant name contains`
- `Notes contains`

You can also edit an existing rule, remove it, or reorder it to change which rule wins first.

When a new transaction is imported and both conditions match, the app sets the category to the chosen value automatically.

You can also test a rule in the sidebar before syncing by entering a sample name and notes value. The preview uses the same first-match logic as the sync/import path, so it shows exactly which rule would fire.

Rule order matters. If more than one rule could match, the app uses the first matching rule in the list. Use `Move Rule Up` / `Move Rule Down` to control priority.

## Environment Variables

- EXPENSE_TRACKER_DATA_DIR
  - Runtime data directory
  - Default in container setup: /app/data
- EXPENSE_TRACKER_DB_FILE
  - Database filename
  - Default: expense_database.csv
- EXPENSE_TRACKER_SETTINGS_FILE
  - Settings filename
  - Default: settings.json
- EXPENSE_TRACKER_FILTERS_FILE
  - Saved filters filename
  - Default: saved_filters.json
- EXPENSE_TRACKER_ASSETS_DIR
  - Asset directory (logo)
  - Default: app base directory
- EXPENSE_TRACKER_LOGO_FILE
  - Logo filename
  - Default: logo.png
- EXPENSE_TRACKER_ENV
  - Set to production to enforce secrets-based auth
- EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS
  - Explicitly enforce secrets-based auth
- EXPENSE_TRACKER_DEV_FALLBACK_USER
  - Development-only fallback username
- EXPENSE_TRACKER_DEV_FALLBACK_PASS
  - Development-only fallback password

## Authentication and Secrets

Recommended for production:

- Set EXPENSE_TRACKER_ENV=production
- Provide [auth] credentials in .streamlit/secrets.toml
- Do not rely on development fallback credentials outside local development

Google Sheets sync is optional. Configure [connections.gsheets] in .streamlit/secrets.toml only if you need sync.

## CI/CD Workflows

- .github/workflows/container-build-multiarch.yml
  - Multi-arch validation build (linux/amd64, linux/arm64), no push
- .github/workflows/publish-ghcr.yml
  - Builds and pushes GHCR images with latest and commit SHA tags

## Data and Privacy

Sensitive local files are intentionally ignored by git, including:

- .streamlit/secrets.toml
- data/
- local runtime CSV/JSON files
- local backup/snapshot folders

Before publishing or sharing:

- Verify no personal data files are tracked
- Verify no real credentials are tracked
- Rotate credentials if they were ever exposed

## Common Commands

Start (local build):

```bash
docker compose up -d --build
```

Start (GHCR image):

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

View logs:

```bash
docker compose logs -f
```

View logs (GHCR/prod file):

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Stop:

```bash
docker compose down
```

## Automated Backups (Cron)

The project includes:

- `scripts/data_backup.sh` for timestamped backups of the whole `data/` folder
- `scripts/setup_backup_cron.sh` to install the cron job
- built-in retention, so old backups are pruned automatically

Each run archives everything in `data/` — the main database, settings, saved
filters **and the joint-account files** — to
`expense_tracker_data_<timestamp>.tar.gz` plus a `.sha256`, self-checks the
archive, and only then moves it into place. By default it keeps the latest 14.

`.streamlit/secrets.toml` is deliberately **not** in the archive (the copy that
reaches Google Drive must not carry credentials). Keep it in your password
manager.

Install or update the cron job (daily at 03:00; the defaults match the NUC):

```bash
chmod +x scripts/setup_backup_cron.sh scripts/data_backup.sh
./scripts/setup_backup_cron.sh                                 # /srv/shared/backups, keep 14, daily 03:00
./scripts/setup_backup_cron.sh /srv/shared/backups 14 "0 3 * * *"   # same, explicit
```

Notes:

- Re-running the setup script replaces the existing job (including a hand-edited
  crontab line that calls `data_backup.sh`), so you never end up with two.
- Backup logs are written to `<output_dir>/expense_tracker_backup_cron.log`.
- On the NUC the archives in `/srv/shared/backups` are then copied to Google Drive
  (encrypted) and the Synology NAS by the sleepwell backup jobs — see that repo's
  `docs/nuc-backup-overview.md`.
- You can run a manual backup at any time:

```bash
./scripts/data_backup.sh /srv/shared/backups 14
```

The backup scripts have hermetic tests (temp dirs and a stub `crontab` only): `scripts/tests/test_data_backup.sh`.

### Restoring

```bash
cd /srv/shared/backups                       # or wherever the archive was fetched to
sha256sum -c expense_tracker_data_<timestamp>.sha256
docker stop uk_expense_tracker               # stop the app first so it cannot overwrite the restore
tar -xzf expense_tracker_data_<timestamp>.tar.gz -C /srv/UK-Expense-Tracker
docker start uk_expense_tracker
```

(`uk_expense_tracker` is the container name on the NUC; elsewhere use whatever
`docker compose down` / `up -d` you normally run.) Restored files may need their
original owner re-applied — the joint-account files are written by the container
as root.

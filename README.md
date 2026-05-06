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

- `scripts/data_backup.sh` for timestamped backups of runtime data files
- built-in retention, so old backups are pruned automatically

By default, each run keeps only the latest 4 backup archives and checksums.

Install or update a cron job that runs every 4 days at 03:00:

```bash
chmod +x scripts/setup_backup_cron.sh scripts/data_backup.sh
./scripts/setup_backup_cron.sh /srv/shared/backups/expense_tracker 4 "0 3 */4 * *"
```

Notes:

- Cron schedule `*/4` in day-of-month means every 4th day of each month.
- Backup logs are written to `logs/data_backup_cron.log`.
- You can run a manual backup at any time:

```bash
./scripts/data_backup.sh /srv/shared/backups/expense_tracker 4
```

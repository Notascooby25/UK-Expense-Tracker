# App Version Footer & Interactive Changelog Design

**Date:** 2026-10-11
**Status:** Draft for User Review

## 1. Problem Statement
When deploying updates to the Intel NUC via GitHub Container Registry (`ghcr.io`), there was no visible version indicator or release history in the UI to quickly confirm whether a newly built container image had actually been pulled and started, versus whether an update had arrived and wasn't working as expected.

Additionally, `GEMINI.md` previously referenced only `ghcr.io/notascooby25/uk-expense-tracker:latest` (the legacy Streamlit container on port `8501`) rather than `ghcr.io/notascooby25/uk-expense-tracker-web:latest` (the React + FastAPI web container on port `8502`).

## 2. Goals
1. **Subtle Version Footer (`AppFooter`):** Display a clean footer bar at the bottom of the application showing the current version number and a clickable `"v0.6.0 — View Changelog"` button.
2. **Interactive Changelog Modal with Backfilled History:** Clicking the version button in the footer opens a modal listing the full chronological history of the app (`v0.1.0` through `v0.6.0`) backfilled from git commits, with each version's release date, milestone title, and plain-English bullet points, and the active version highlighted as `"Current Release"`.
3. **Single Source of Truth (`backend/changelog.py`):** Centralize `APP_VERSION` and `CHANGELOG` on the backend and expose them via `/api/auth/status` and `/api/bootstrap` so the UI always displays the live running container's version and release notes.
4. **Deployment Rules Update (`GEMINI.md`):**
   - Update the NUC Docker pull instructions to pull `ghcr.io/notascooby25/uk-expense-tracker-web:latest`.
   - Document the rule that every user-facing change must increment `APP_VERSION` and prepend a new entry to `CHANGELOG`.

## 3. Backfilled Release History (`v0.6.0` → `v0.1.0`)
- **`0.6.0` (`2026-10-11`) — Version Footer, Changelog & Category Inspector Handoff**
  - Added app version footer (`v0.6.0 — View Changelog`) and interactive Changelog modal to verify live deployments at a glance.
  - Added inline Category dropdown editing directly inside the Dashboard's Category Inspector transactions table.
  - Updated **Open in Transactions Editor** to carry over the active Dashboard time period (`Date From` / `Date To`, `Financial Year`, or selected `Months`) and `Bank` filter alongside the Category.
  - Added **Exceptional / One-Off Spend** category tagging in Settings and a Dashboard callout banner to exclude large one-off costs from monthly run-rate averages.
  - Made Savings & Investments categories clickable for Category Inspector drilldown and added Income/Expense indicator dots.
- **`0.5.0` (`2026-10-11`) — Modern React + FastAPI Web Application**
  - Launched the full React + TypeScript + FastAPI web application (`uk-expense-tracker-web` on port `8502`) alongside the legacy Streamlit app.
  - Added Dashboard default to Current Month, interactive month-pill filter toolbar, and Shift-click multi-row selection in the Transactions Editor.
  - Configured native `linux/amd64` Docker builds for fast deployments on the Intel NUC.
- **`0.4.0` (`2026-10-10`) — Subscriptions Intelligence & Design System Overhaul**
  - Replaced category-based subscription tracking with a dedicated `Is_Subscription` flag, smart keyword dictionary, bulk mark actions, and one-click database subscription scanning.
  - Applied the Impeccable high-contrast slate & coral design system, responsive mobile tabs vs. desktop grid toggle for the Cash Flow breakdown, and automated Ruff + Pytest + Pre-commit quality gates.
- **`0.3.0` (`2026-10-06` – `2026-10-09`) — Wealth Tracker, Smart Insights & Category Drilldown**
  - Introduced the **Wealth / Assets Tracker**, **What-If Calculator**, **Smart Insights**, and **4-Column Cash Flow Breakdown** (Income, Committed Bills, Variable Spend, Savings).
  - Added Category Drilldown with merchant summaries (last date, transaction count) and individual transaction notes.
  - Added `max_amount` threshold support for auto-categorisation rules and a button to retrospectively apply rules across existing transactions.
- **`0.2.0` (`2026-06-05` – `2026-09-28`) — Personal/Joint Account Scopes & Auto-Categorisation Engine**
  - Added isolated **Personal** and **Joint** account scopes with separate transaction databases, settings, and automated daily backups.
  - Built the **Auto-Categorisation Rules Engine** with rule priority ordering, live test preview, rule editing, and notes filtering.
  - Optimised mobile layouts and persistent login sessions.
- **`0.1.0` (`2026-04-30` – `2026-05-02`) — Initial Release & Intel NUC Docker Architecture**
  - Initial release of the UK Expense Tracker with UK Financial Year (`YYYY/YY`) calculations, multi-bank CSV/TSV import, and Google Sheets Monzo sync.
  - Set up automated GitHub Container Registry (`ghcr.io`) builds and Watchtower deployment for the Intel NUC.

## 4. Architecture & Data Flow

### 4.1 Backend (`backend/changelog.py` & `backend/main.py`)
- Create `backend/changelog.py` defining `APP_VERSION = "0.6.0"` and `CHANGELOG: list[dict[str, Any]]`.
- Import `APP_VERSION` and `CHANGELOG` into `backend/main.py`.
- Include `"changelog": CHANGELOG` in both `GET /api/auth/status` and `GET /api/bootstrap`.

### 4.2 Frontend (`frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/components/AppFooter.tsx`, `frontend/src/App.tsx`)
- Add `ChangelogEntry` interface to `frontend/src/types.ts` and include `changelog: ChangelogEntry[]` in `BootstrapPayload` and `api.getAuthStatus()`.
- Create `frontend/src/components/AppFooter.tsx` to render the subtle footer bar (`v0.6.0 — View Changelog`) and the interactive Changelog modal.
- Render `AppFooter` in `frontend/src/App.tsx` (both on the login screen and in the main authenticated shell) and sync `frontend/package.json` version to `"0.6.0"`.

## 5. Testing & Verification Plan
- **Backend Unit Tests (`tests/test_backend_api.py`):**
  - Verify `/api/auth/status` and `/api/bootstrap` return `version` (`"0.6.0"`) and the 6-release `changelog` list (`0.6.0` down to `0.1.0`).
- **Frontend Build & Type Check:**
  - Run `npm --prefix frontend run build` (`tsc && vite build`).
- **Impeccable & Quality Checks:**
  - Run `impeccable detect --json` on modified frontend files.
  - Run `./venv/bin/ruff check .`, `./venv/bin/ruff format .`, `./venv/bin/pytest`, and `./venv/bin/pre-commit run --all-files`.

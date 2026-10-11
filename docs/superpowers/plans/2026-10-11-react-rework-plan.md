# UK Expense Tracker React + FastAPI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern React + TypeScript frontend and Python FastAPI backend for the UK Expense Tracker that runs side-by-side on port `8502` alongside the existing Streamlit app (`8501`), sharing the same `data/` CSV/JSON files and `.streamlit/secrets.toml`.

**Architecture:** Extract and wrap the proven Pandas data processing, bank parsers, and cash flow calculations (`cashflow_utils.py`) into a modular FastAPI backend (`backend/`) with atomic file persistence and cookie-based authentication. Build a responsive, dark-first React SPA (`frontend/`) with a persistent top navigation bar, centered `+ Add / Sync` popup modal, interactive click-to-inspect Dashboard, unified Transactions editor/exporter, 1-click Intelligence actions, side-by-side Wealth logger, and full-page Settings. Package via `Dockerfile.web` and add a parallel `expense-tracker-web` container in `docker-compose.prod.yml` and GitHub Actions.

**Tech Stack:** Python 3.11, FastAPI, Uvicorn, Pandas, GSpread / Google-Auth, Pytest, React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React.

**Spec:** `docs/superpowers/specs/2026-10-11-react-rework-design.md`

## Global Constraints

- Do NOT modify or break `app.py`, `cashflow_utils.py`, or existing `Dockerfile` so the Streamlit app on port `8501` remains 100% functional during side-by-side operation.
- Never manually edit runtime files in `data/` (`expense_database.csv`, `settings.json`, `saved_filters.json`, `assets.json`).
- All CSV writes must format `Date` as `%d/%m/%Y` (`DD/MM/YYYY`) with columns `Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year,Is_Subscription` and use atomic file replacement (`tempfile` + `os.replace`) under a lock.
- Enforce authentication on all `/api/*` endpoints (except `/api/auth/status` and `/api/auth/login`) reading `[auth]` from `.streamlit/secrets.toml` (or development fallback when `EXPENSE_TRACKER_ENV != "production"` and `EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS` is false).
- Follow PEP 8 and verify every backend change with `./venv/bin/ruff check .`, `./venv/bin/ruff format --check .`, and `./venv/bin/pytest`.

## Review Focus

1. **Corrupted or partial writes during auto-save:** Concurrent or rapid inline edits must never truncate `expense_database.csv` or `settings.json`—tested via atomic write helper in Task 1.
2. **Barclaycard headerless CSV & HSBC $£/comma formatting:** Uploading a 7-column Barclaycard CSV where row 0 is data (not headers) or an HSBC CSV with `£1,234.56` values must parse without dropping the first row or failing numeric conversion—tested in Task 1.
3. **Monzo multi-category split rows:** A Monzo row with `Category split` like `Groceries:15.50, Entertainment:10.00` must drop the parent row and emit two separate rows with positive floats—tested in Task 1.
4. **Filtered inline edits / bulk deletes shifting row indices:** Editing or deleting a row while a filter is active on the `Transactions` page must target the exact underlying transaction row without overwriting or dropping unfiltered rows—tested in Task 2.
5. **Unauthenticated API access in production mode:** Requests to `/api/*` without a valid signed session cookie must return HTTP 401, and missing `.streamlit/secrets.toml` in `production` mode must block login—tested in Task 2.

---

### Task 1: Backend Storage, Atomic Persistence & Bank Import Engine

**Files:**
- Create: `backend/__init__.py`
- Create: `backend/storage.py`
- Modify: `requirements.txt`
- Test: `tests/test_backend_storage.py`

**Interfaces:**
- Consumes: `cashflow_utils.py`
- Produces:
  - `COLS: list[str]`, `ACCOUNT_SCOPES: list[str]`, `INTERNAL_CATEGORIES: list[str]`, `TRUE_INCOME_CATEGORIES: list[str]`, `SMART_SUBSCRIPTION_KEYWORDS: list[str]`
  - `resolve_scope_paths(scope: str) -> dict[str, str]` (keys: `db`, `settings`, `filters`, `assets`)
  - `clean_string(val: object) -> str`
  - `calculate_uk_financial_year(date_obj: pd.Timestamp) -> str`
  - `load_transactions(scope: str) -> pd.DataFrame` (includes `_row_id` integer index column on return helpers when needed)
  - `save_transactions(scope: str, df: pd.DataFrame) -> None` (atomic write via `tempfile.NamedTemporaryFile` + `os.replace`)
  - `load_settings(scope: str) -> dict`, `save_settings(scope: str, settings: dict) -> None`
  - `load_filters(scope: str) -> dict`, `save_filters(scope: str, filters: dict) -> None`
  - `load_assets(scope: str) -> dict`, `save_assets(scope: str, assets: dict) -> None`
  - `process_monzo_splits(df: pd.DataFrame) -> pd.DataFrame`
  - `apply_smart_dictionary(df: pd.DataFrame) -> pd.DataFrame`
  - `get_matching_auto_rule(row: dict | pd.Series, rules: list[dict]) -> tuple[int | None, dict | None]`
  - `apply_auto_rules(df: pd.DataFrame, rules: list[dict]) -> pd.DataFrame`
  - `parse_and_merge_import(existing_df: pd.DataFrame, raw_df: pd.DataFrame, rules: list[dict], source_format: str = "Auto-Detect") -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]` (returns `merged_df, new_rows_df, updated_rows_df`)

- [ ] **Step 1: Write failing unit tests in `tests/test_backend_storage.py`**
  Test `calculate_uk_financial_year` (2025-04-05 -> `2024-2025`, 2025-04-06 -> `2025-2026`), atomic `save_transactions` / `load_transactions` round-trip (`%d/%m/%Y` format), `process_monzo_splits`, `parse_and_merge_import` for Monzo, HSBC (`Paid out`/`Paid in` with `£,`), and Barclaycard (7-col headerless CSV), deduplication (`Date + Name + Amount`), and existing-row category update detection.

- [ ] **Step 2: Run pytest to verify tests fail**
  Run: `./venv/bin/pytest tests/test_backend_storage.py -v`
  Expected: FAIL (`ModuleNotFoundError: No module named 'backend'`)

- [ ] **Step 3: Install FastAPI & test dependencies in `venv` and update `requirements.txt`**
  Add `fastapi`, `uvicorn[standard]`, `python-multipart`, `gspread`, `google-auth`, `httpx` to `requirements.txt` while keeping existing dependencies intact.

- [ ] **Step 4: Implement `backend/storage.py`**
  Implement atomic file I/O with `threading.RLock()` and `tempfile.NamedTemporaryFile(dir=target_dir, delete=False)` + `os.replace()`, plus the pure data parsing and rule functions matching `app.py`.

- [ ] **Step 5: Run pytest and ruff to verify Task 1 passes**
  Run: `./venv/bin/pytest tests/test_backend_storage.py -v && ./venv/bin/ruff check backend/ tests/`
  Expected: PASS

---

### Task 2: FastAPI Auth, Analytics Engine & REST Endpoints

**Files:**
- Create: `backend/auth.py`
- Create: `backend/analytics.py`
- Create: `backend/gsheets.py`
- Create: `backend/main.py`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- Consumes: `backend/storage.py`, `cashflow_utils.py`
- Produces:
  - `backend.auth`: `get_auth_config()`, `create_session_token(username: str) -> str`, `verify_session_token(token: str) -> str | None`, `require_auth` FastAPI dependency.
  - `backend.analytics`:
    - `build_dashboard_data(df: pd.DataFrame, settings: dict, filters: dict) -> dict`
    - `build_category_drilldown(df: pd.DataFrame, settings: dict, filters: dict, category: str) -> dict`
    - `build_intelligence_data(df: pd.DataFrame, settings: dict) -> dict`
    - `build_wealth_data(df: pd.DataFrame, assets: dict, ignore_legacy: bool, timeframe: str) -> dict`
  - `backend.main`: FastAPI `app` exposing:
    - `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout`
    - `GET /api/bootstrap`
    - `GET /api/dashboard`, `GET /api/dashboard/drilldown`
    - `GET /api/transactions`, `POST /api/transactions`, `PATCH /api/transactions/{row_id}`, `POST /api/transactions/bulk`, `GET /api/transactions/export`
    - `POST /api/sync/gsheets`, `POST /api/sync/import`, `POST /api/sync/confirm`
    - `GET /api/intelligence`, `POST /api/intelligence/action`
    - `GET /api/wealth`, `POST /api/wealth/balances`
    - `PUT /api/settings`, `POST /api/settings/apply-rules`, `POST /api/settings/test-rule`, `PUT /api/filters`

- [ ] **Step 1: Write failing API & analytics tests in `tests/test_backend_api.py`**
  Using `fastapi.testclient.TestClient` and `monkeypatch` on `EXPENSE_TRACKER_DATA_DIR` (pointing to `tmp_path`), test:
  1. Unauthenticated `/api/bootstrap` returns 401; login sets `uk_expense_session` cookie; production mode without secrets blocks login.
  2. `/api/dashboard` and `/api/dashboard/drilldown` return accurate KPI totals, monthly averages, refund-netted committed/variable breakdowns, and merchant drilldowns.
  3. `/api/transactions` filtering, `PATCH /api/transactions/{row_id}` inline edit on a filtered subset (verifying unfiltered rows remain untouched and `Financial_Year` updates), `POST /api/transactions/bulk` update and delete, and `/api/transactions/export` CSV format.
  4. `/api/intelligence` detection & `/api/intelligence/action` 1-click actions (mark committed, ignore recurring, flag subscriptions, standardise category).
  5. `/api/wealth` & `/api/wealth/balances` monthly asset logging and net worth calculation.
  6. `/api/settings`, `/api/settings/test-rule`, and `/api/settings/apply-rules`.

- [ ] **Step 2: Run pytest to verify tests fail**
  Run: `./venv/bin/pytest tests/test_backend_api.py -v`
  Expected: FAIL (`ModuleNotFoundError: No module named 'backend.main'`)

- [ ] **Step 3: Implement `backend/auth.py`, `backend/analytics.py`, `backend/gsheets.py`, and `backend/main.py`**
  Implement all endpoints with Pydantic request validation, string sanitization, and atomic auto-saving on every mutation.

- [ ] **Step 4: Run pytest and ruff to verify all backend tests pass**
  Run: `./venv/bin/pytest -v && ./venv/bin/ruff check .`
  Expected: PASS

---

### Task 3: React + TypeScript Frontend Scaffolding, App Shell & Popup Add/Sync Modal

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/index.css`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/components/LoginScreen.tsx`
- Create: `frontend/src/components/TopNav.tsx`
- Create: `frontend/src/components/AddSyncModal.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `/api/auth/*`, `/api/bootstrap`, `/api/transactions`, `/api/sync/*`
- Produces:
  - Authenticated App Shell with persistent `TopNav` (`Personal`/`Joint` pill toggle, 5 page tabs defaulting to `Dashboard`, `+ Add / Sync` modal button, Dark/Light theme toggle defaulting to Dark, `"All changes saved"` indicator, and Log Out).
  - `AddSyncModal`: Centered modal with 3 tabs (`Monzo Sync`, `Quick Add`, `CSV / Paste`) and inline editable review table for newly synced rows (`Category`, `Notes`, `Is_Subscription`) that auto-saves on confirmation.

- [ ] **Step 1: Scaffold `frontend/` with Vite, React, TypeScript, Tailwind CSS, Lucide icons, and Recharts**
  Create `package.json`, `vite.config.ts` (with `/api` proxy to `http://127.0.0.1:8502`), `tsconfig.json`, and install dependencies.

- [ ] **Step 2: Implement `types.ts`, `api.ts`, `LoginScreen.tsx`, `TopNav.tsx`, and `AddSyncModal.tsx`**
  Build the top navigation shell (following the Deep Slate & semantic color system in `DESIGN.md` with Dark/Light mode support) and the centered `+ Add / Sync` modal.

- [ ] **Step 3: Verify TypeScript compilation**
  Run: `npm --prefix frontend run build`
  Expected: PASS with zero TypeScript errors.

---

### Task 4: Interactive Dashboard & Unified Transactions Pages

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/TransactionsPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `frontend/src/api.ts` (`/api/dashboard`, `/api/dashboard/drilldown`, `/api/transactions`, `/api/transactions/bulk`, `/api/transactions/export`, `/api/filters`)
- Produces:
  - `DashboardPage`: Always-visible compact filter bar, Period Totals & Monthly Averages KPI cards, Recent Month vs Historical Average insight card, collapsible Wage Reduction "What-If" calculator, 4-column Cash Flow Breakdown with **click-to-inspect Category Drill-Down panel** (showing category net cost, merchant summary table, individual transactions, and `"Open in Transactions →"` button), and toggleable interactive charts (`Monthly Cash Flow`, `Top 10 Categories`, `Cumulative Wealth`, `Top 10 Merchants`, `Bank & Category Breakdown`).
  - `TransactionsPage`: Unified filter toolbar (Merchant search, Notes search, Bank, Category, Type, Financial Year, Date Range), Saved Filter Presets loader/saver, `⬇️ Export CSV` button, inline-editable transactions table with immediate auto-save, and floating Bulk Action bar (`Set Category`, `Set Type`, `Set Subscription`, `Delete Selected`).

- [ ] **Step 1: Implement `DashboardPage.tsx` with click-to-inspect category drill-down and Recharts visualizations**
- [ ] **Step 2: Implement `TransactionsPage.tsx` with inline cell editing (auto-save), filter presets, CSV export, and bulk action bar**
- [ ] **Step 3: Wire `DashboardPage` and `TransactionsPage` into `App.tsx` (supporting jumping from Dashboard category drill-down straight into filtered Transactions)**
- [ ] **Step 4: Verify frontend build**
  Run: `npm --prefix frontend run build`
  Expected: PASS with zero TypeScript or bundler errors.

---

### Task 5: 1-Click Intelligence, Side-by-Side Wealth, Full-Page Settings & Docker Coexistence

**Files:**
- Create: `frontend/src/pages/IntelligencePage.tsx`
- Create: `frontend/src/pages/WealthPage.tsx`
- Create: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `Dockerfile.web`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Modify: `.github/workflows/publish-ghcr.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `frontend/src/api.ts` (`/api/intelligence/*`, `/api/wealth/*`, `/api/settings/*`)
- Produces:
  - `IntelligencePage`: Auto-scanning 3-tab/card view for Recurring Spend Detection (`+ Mark Committed`, `Ignore`, and `Restore Ignored`), Auto-Tag Subscriptions (`Flag as Subscription` / `Flag All`), and Category Standardisation (`Apply` / `Mute Merchant`).
  - `WealthPage`: 2-column layout with Monthly Asset Balance logger card on the left and Total Net Worth area chart, Asset Balances multi-line chart, and Internal Movements timeline + table on the right.
  - `SettingsPage`: Full-page 3-tab workspace (`Automatic Categorisation Rules` with reorder/edit/delete + Live Rule Tester + `Apply Rules to All Existing Data`, `Committed Bills & Presets`, and `Categories, Google Sheets & Startup Health`).
  - `Dockerfile.web`, `docker-compose.prod.yml`, and `.github/workflows/publish-ghcr.yml` configured to run `expense-tracker-web` on port `8502` alongside the untouched `expense-tracker` (Streamlit) on port `8501`.

- [ ] **Step 1: Implement `IntelligencePage.tsx`, `WealthPage.tsx`, and `SettingsPage.tsx` and wire into `App.tsx`**
- [ ] **Step 2: Build production frontend bundle (`frontend/dist`) and verify FastAPI serves the SPA and API end-to-end**
  Run: `npm --prefix frontend run build && ./venv/bin/pytest -v`
  Expected: PASS
- [ ] **Step 3: Create `Dockerfile.web` and update `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/publish-ghcr.yml`, and `.gitignore`**
- [ ] **Step 4: Run full verification suite (`ruff check`, `ruff format --check`, `pytest`, frontend build, and live smoke test of FastAPI serving the built React app)**
  Run: `./venv/bin/ruff check . && ./venv/bin/ruff format --check . && ./venv/bin/pytest -v && npm --prefix frontend run build`
  Expected: All checks and tests PASS.

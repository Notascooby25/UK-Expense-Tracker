# UK Expense Tracker — React + FastAPI Rework Design

**Date:** 2026-10-11
**Status:** Draft (Pending Builder Check & User Approval)

---

## 1. Intent and Why

The current UK Expense Tracker is built as a single 2,548-line Streamlit script (`app.py`). While the underlying data processing—syncing Monzo transactions from Google Sheets, splitting multi-category Monzo rows, parsing HSBC and Barclaycard CSVs, separating Personal and Joint account scopes, and computing refund-adjusted cash flow—works reliably, the user experience feels clunky and amateurish compared to the user's other apps (such as Audio Squabbler, built on React):

1. **Awkward Sidebar Navigation & Cramped Settings:** Both page navigation and complex settings (Automatic Categorisation Rules, Committed Bill Presets, Custom Categories) are squeezed into a narrow collapsible left sidebar.
2. **Clumsy Landing Page & Stretched Boxes:** Opening the app lands on "Add & Sync", where form inputs and bulk import boxes stretch from edge to edge across wide screens with poor visual formatting.
3. **Streamlit Interaction Friction:** Every click triggers a full Python script rerun, and users must remember to click both *"Commit Table Edits"* and *"Save Database to Disk"* to persist changes.
4. **Fragmented Workflows:** Drilling down into a category on the Dashboard requires scrolling down to an expander and selecting the category again from a dropdown; meanwhile, "Data Editor" and "Export" duplicate the same transaction filters across two separate tabs.

The goal of this project is to build a modern, responsive **React frontend + Python (FastAPI) backend** application that reuses the proven Python data logic and reads/writes the exact same `data/` files, running **side-by-side** alongside the existing Streamlit app until the user is ready to retire the old version.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Side-by-Side Coexistence:** Keep the existing Streamlit app (`app.py` on port `8501`) completely intact and running in production while deploying the new React + FastAPI app alongside it (on port `8502`), sharing the same `/app/data` and `/app/.streamlit/secrets.toml` volumes.
- **Top Navigation App Shell:** Replace the sidebar with a clean, persistent top navigation bar (inspired by Audio Squabbler) containing the brand header, `Personal` / `Joint` scope switcher, main page tabs (`Dashboard`, `Transactions`, `Intelligence`, `Wealth`, `Settings`), a `+ Add / Sync` modal button, a Dark/Light theme toggle, and Log Out.
- **Default to Dashboard:** Land directly on the `Dashboard` view upon opening/logging in.
- **Popup Modal for Add & Sync:** Move transaction entry and syncing into a centered, well-proportioned popup dialog (`max-width: 640px` for forms, expanding to `900px` when reviewing synced rows) accessible from the top bar on any page.
- **Automatic Saving to Disk:** Persist every confirmed sync, quick add, inline cell edit, bulk update, row deletion, setting/rule update, and asset balance change immediately and atomically to disk—no manual "Save Database to Disk" button required.
- **Unified Transactions Workspace:** Combine "Data Editor", "Bulk Update", and "Export" into a single `Transactions` page where users filter once, load/save filter presets, inline-edit cells, bulk-edit selected rows, or export the filtered view to CSV.
- **Click-to-Inspect Dashboard & 1-Click Intelligence:** Allow clicking any category row in the Dashboard Cash Flow Breakdown (or bar in the category chart) to open its merchant/transaction breakdown immediately, and replace multiselect dropdown workflows on the `Intelligence` tab with 1-click row action buttons.

### Non-Goals
- **Database Migration:** We are **not** migrating away from `expense_database.csv`, `settings.json`, `saved_filters.json`, or `assets.json` (and their `_joint` counterparts). Preserving the exact file formats and schemas is required so both the Streamlit app and the new React + FastAPI app can operate side-by-side on the same data files.
- **Changing Core Financial Formulas:** The existing UK financial year calculation (6 April boundary), true income vs. committed/variable refund netting (`cashflow_utils.py`), Monzo split expansion, and bank CSV parsers remain unchanged.

### Anti-Goals (What Would Make This a Failure)
- Full-width form inputs stretching edge-to-edge across a desktop monitor.
- Burying navigation or settings inside a narrow sidebar.
- Requiring two-step manual saves ("Commit Edits" then "Save to Disk").
- Breaking or modifying the existing Streamlit app while both are running side-by-side.

---

## 3. Constraints & Security Requirements

- **Data Compatibility & Atomic Writes:**
  - Must read and write the exact file paths resolved by `EXPENSE_TRACKER_DATA_DIR` (falling back to `BASE_DIR` legacy paths on read, identical to `app.py`):
    - Personal scope: `expense_database.csv`, `settings.json`, `saved_filters.json`, `assets.json`
    - Joint scope: `expense_database_joint.csv`, `settings_joint.json`, `saved_filters_joint.json`, `assets_joint.json`
  - CSV `Date` column must always be serialized as `DD/MM/YYYY` (`%d/%m/%Y`) in UTF-8 with columns: `Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year,Is_Subscription`.
  - All file writes (`CSV` and `JSON`) must be **atomic** (write to a temporary file in the target directory, flush/fsync, then `os.replace()`) with an in-process file lock so concurrent requests cannot corrupt `data/` files.
- **Authentication & Secrets:**
  - Read credentials from `.streamlit/secrets.toml` (`[auth] username`, `password`) using Python's `tomllib` (standard in Python 3.11+).
  - Enforce `EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS` / `EXPENSE_TRACKER_ENV=production` rules identically to `app.py` (blocking login with a clear configuration error if secrets are missing in production, or falling back to `DEV_FALLBACK_USER`/`DEV_FALLBACK_PASS` in development with a visible warning).
  - Issue an `HttpOnly`, `SameSite=Lax` signed session cookie (`uk_expense_session`) valid for 30 days when "Remember me for 30 days" is checked, or a browser-session cookie otherwise. Every `/api/*` endpoint (except `/api/auth/login` and `/api/auth/status`) must require a valid session.
- **Google Sheets Integration:**
  - Read `[connections.gsheets]` service account credentials from `.streamlit/secrets.toml` and use `gspread` / `google-auth` (already installed via `st-gsheets-connection` transitive dependencies, or pinned explicitly in `requirements.txt`) to fetch live worksheet rows without depending on the Streamlit runtime.
- **XSS & Input Sanitization:**
  - React automatically escapes rendered text nodes; never use `dangerouslySetInnerHTML` on transaction names, notes, categories, or bank names. Validate all API payloads via Pydantic models and clean strings (`nan`/`none`/`null` -> `""`, strip whitespace, round `Amount` to 2 decimal places as positive floats).

---

## 4. User-Decided Design & UX Architecture

### 4.1 Visual Theme & App Shell
- **Theme:** Modern Dark Theme by default (deep slate backgrounds `#0b0f17` / `#151c28`, subtle borders, crisp emerald `#2ecc71` for income, coral red `#ff5252` for committed bills, amber `#f39c12` for variable spend, sky blue `#3498db` for net/cumulative) with a 1-click **Dark / Light Mode Toggle** in the top bar (persisted in `localStorage`).
- **Layout Width:** Content sits inside a centered container (`max-width: 1400px`, responsive padding) with structured cards so boxes never stretch awkwardly across ultra-wide monitors.
- **Top Navigation Bar:**
  - **Left:** App logo/icon + title (`UK Expense Tracker`) + **Personal / Joint Scope Switcher** (segmented pill toggle that switches all queries/mutations between Personal and Joint files).
  - **Center:** Horizontal navigation tabs:
    1. `📊 Dashboard` (Default landing page)
    2. `💳 Transactions` (Unified Data Editor + Bulk Operations + CSV Export)
    3. `🧠 Intelligence` (Recurring Bills, Subscription Tagger, Category Cleanup)
    4. `🏦 Wealth` (Net Worth & Assets Logger + Internal Movements)
    5. `⚙️ Settings` (Full-Page Rules, Committed Presets, Categories & Sheet Config)
  - **Right:** Primary **`+ Add / Sync`** button (opens the centered Add/Sync modal from anywhere), subtle **"All changes saved"** status indicator, Theme Toggle (🌙/☀️), and Log Out button.

### 4.2 Centered Popup Modal: `+ Add / Sync`
Clicking `+ Add / Sync` opens a modal overlay over the current page with 3 tabs:
1. **🔄 Monzo Sync (Default tab):**
   - Shows the active scope's configured `monzo_sheet_url` and `monzo_sheet_worksheet` (with an inline option to edit them if needed) and a primary **Sync Now** button.
   - Clicking **Sync Now** fetches the sheet, expands Monzo category splits (`process_monzo_splits`), applies `SMART_SUBSCRIPTION_KEYWORDS` and `auto_rules`, deduplicates against existing rows (matching `Date`, `Name`, and `Amount`), and updates categories on existing matches if changed in Monzo.
   - **Inline Review & Auto-Save:**
     - If existing rows had their categories updated, they are auto-saved immediately and a summary badge is shown (`Updated X existing transactions`).
     - If new transactions are found, the modal displays an editable preview table (`Category` dropdown, `Notes` text input, `Subscription` checkbox) with a primary **Confirm & Save X Transactions** button (or they can auto-save immediately on sync with inline edits auto-persisting).
2. **✍️ Quick Add:**
   - Compact 2-column form inside the modal: Date (defaults to today), Merchant/Person Name, Amount (£), Type (`Expense` / `Income` pill toggle), Category dropdown, Notes (optional), and Subscription checkbox.
   - Submitting runs `apply_smart_dictionary` / `apply_auto_rules` (unless category was explicitly chosen), saves immediately to disk, shows a toast notification, and refreshes the active page data.
3. **📄 CSV Upload / Paste:**
   - Sub-toggle between **Upload CSV File** and **Paste Spreadsheet Rows**, with Bank Format selector (`Auto-Detect`, `Monzo`, `HSBC`, `Barclaycard`).
   - Processes rows through the exact same parser and review/auto-save flow as Monzo Sync.

### 4.3 Page 1: `📊 Dashboard` (Default View)
- **Top Filter Bar (Always visible, compact card):**
  - Time Mode segmented control: `Financial Year` | `Calendar Year` | `Rolling Period`.
  - Period selector: Financial Year dropdown (`All`, `2025-2026`, etc.), Calendar Year dropdown (+ optional Specific Months multi-select), or Rolling Period (`Last 3 Months`, `Last 6 Months`, `Last 12 Months`, `Last 18 Months`, `Last 2 Years`).
  - Bank selector (`All Banks` + banks), Include Categories / Exclude Categories multi-select popovers.
  - Quick toggles: `Hide Internal Movements` (default on), `Net Spend Only` (default off), `Hide Pre-2020` (default on, filtering `Date >= 2021-01-01` as in `app.py`), and `Reset`.
- **KPI Summary Cards:**
  - **Period Totals (3 cards):** Total True Income, Net Expenses (gross minus refunds), Net Flow.
  - **Monthly Averages (4 highlighted cards):** Avg Income /Mo, Baseline Bills /Mo (committed net), Spare Cash /Mo (Income minus Baseline), Avg Total Spend /Mo.
- **Insights & What-If Row:**
  - **Recent Month vs. Historical Average card:** Shows last month's Committed and Variable spend with `£` deltas against prior months in the selected period and a clear green/amber insight callout.
  - **Wage Reduction 'What-If' Calculator (compact collapsible card):** Input hypothetical monthly income to see New Discretionary Budget (`expected_salary - avg_baseline`), delta vs. current spare cash, and coverage status.
- **Interactive Cash Flow Breakdown + Click-to-Inspect Drill-Down:**
  - 4 cards/columns (responsive grid on desktop, clean tabs on mobile):
    1. **💰 Income Streams** (categories and merchant monthly averages)
    2. **🔒 Committed Bills** (categories sorted by `Avg P/M (£)`)
    3. **🍕 Variable Spend** (categories sorted by `Avg P/M (£)`)
    4. **🏦 Savings & Transfers** (net monthly internal transfers by category and merchant)
  - **Click-to-Inspect:** Clicking any category in the breakdown (or selecting one) opens a dedicated **Category Drill-Down Panel / Drawer** right next to or below the breakdown showing:
    - Total Expenditure, Total Income/Refunds, Net Cost, and Monthly Average for that category.
    - Merchant Summary table (Merchant Name, Type, Total Amount, Transaction Count, Last Date, Subscription badge).
    - Individual Transactions list for that category, plus a **"Open in Transactions Editor →"** button that jumps to the `Transactions` tab pre-filtered to that category.
- **Interactive Charts Grid:**
  - Header bar with pill toggles to show/hide each chart (`Monthly Cash Flow` on by default, `Top 10 Categories` on by default, `Cumulative Wealth`, `Top 10 Merchants`, `Bank & Category Breakdown`).
  - 2-column responsive grid on desktop (1-column on mobile) with collapsible "What does this chart show?" helper notes.

### 4.4 Page 2: `💳 Transactions` (Unified Editor, Bulk Update & Export)
- **Filter & Preset Toolbar:**
  - Text search for Merchant Name, text search for Notes, Bank dropdown, Category multi-select/dropdown, Transaction Type (`Both`, `Expense`, `Income`), Financial Year dropdown, and Date Range picker (`From` / `To`).
  - **Filter Presets (`saved_filters.json`):** Dropdown to load a saved filter preset, button to save current filters under a preset name, and option to delete a preset.
  - **⬇️ Export CSV Button:** Downloads all transactions matching the active filters as `expense_export.csv` (`DD/MM/YYYY` date format).
- **Interactive Data Table:**
  - Displays matching count, pagination / page-size selector (`25`, `50`, `100`, `500`, `All`), and sortable columns.
  - **Inline Editing with Auto-Save:** Clicking any row's Date, Name, Amount, Type, Bank, Category, Notes, or Subscription checkbox edits it directly and persists immediately to disk via the API (recalculating `Financial_Year` when `Date` changes).
  - **Add / Delete Single Row:** Option to delete a row or add a row directly.
- **Floating Bulk Action Bar:**
  - Checking row checkboxes (including "Select All Matching / On Page") reveals a floating action bar at the bottom of the screen:
    - Shows `X rows selected`.
    - Bulk actions: **Set Category**, **Set Type (Expense/Income)**, **Set Subscription (True/False)**, and **🗑️ Delete Selected** (with confirmation prompt).
    - Applying any bulk action updates all selected rows and saves to disk immediately.

### 4.5 Page 3: `🧠 Intelligence`
Automatically runs all three scans when the page loads (and whenever underlying data changes), presenting them as 3 clean cards or sub-tabs with badge counts:
1. **💡 Recurring Spend Detection:**
   - Uses the exact recurrence algorithm from `app.py` (`freq_ratio > 0.6` or `frequency >= 3` when `total_months >= 3`, `cv < 0.20`, category not in `committed_categories` or `internal_categories`, merchant not in `ignore_recurring`).
   - Each candidate row shows Merchant, Category, Frequency (Months), and Avg P/M (£), with two 1-click buttons:
     - **+ Add Category to Committed** (adds the category to `committed_categories` and saves)
     - **🚫 Ignore Merchant** (adds merchant to `ignore_recurring` and saves)
   - Includes a collapsible **"Ignored Merchants"** drawer where ignored merchants can be restored with 1 click.
2. **🤖 Auto-Tag Subscriptions:**
   - Lists distinct unflagged merchants matching `SMART_SUBSCRIPTION_KEYWORDS` (showing how many transactions and total spend each has).
   - 1-click **Flag as Subscription** per merchant row, plus a **✅ Flag All Selected** button that updates `Is_Subscription = True` and saves to disk.
3. **🧹 Category Standardisation:**
   - Scans non-Monzo transactions whose category is not in `pure_monzo_cats` and finds close matches (`difflib.get_close_matches(..., cutoff=0.5)`), excluding merchants in `ignore_suggestions`.
   - Groups or lists suggestions showing Merchant, Current Category (`From`), and Suggested Monzo Category (`Suggested`), with 1-click **✅ Apply** and **🔇 Mute Merchant** buttons.

### 4.6 Page 4: `🏦 Wealth` (Assets & Internal Movements)
- **2-Column Desktop Layout:**
  - **Left Column (`Log Monthly Balances` Card, ~360px wide):**
    - Month selector (`YYYY-MM`, defaulting to current month or any historical month).
    - Lists all known assets from `assets.json` (or defaults `Trading 212 S&S ISA`, `Trading 212 Cash ISA`, `Crypto`, `Monzo savings`), pre-filled with the selected month's values (or the latest recorded month's values).
    - Inline "+ Add New Asset" inputs (Asset Name & Balance).
    - **Save Month Balances** button that persists to `assets.json` (or `assets_joint.json`) and updates the charts immediately.
  - **Right Column (Charts & Internal Movements):**
    - **Total Tracked Net Worth** summary metric (with month-over-month delta) and area chart.
    - **Asset Balances Over Time** multi-line chart.
    - **🔄 Internal Wealth Movements** section: Timeframe filter (`All Time`, `Last 12 Months`, `Last 2 Years`, `Last 3 Years`, `Last 4 Years`), stacked bar timeline by internal category (`Savings`, `Investments - ISA`, `Transfers`, `Investment - Crypto`), and companion transaction table.

### 4.7 Page 5: `⚙️ Settings` (Full-Page Workspace)
Opens in the full main viewport with 3 horizontal sub-tabs:
1. **⚡ Automatic Categorisation Rules:**
   - **Left/Main Panel (Wide Rules List):** Displays all active `auto_rules` for the current scope in priority order (`1..N`), showing `Name contains`, `Notes contains`, `Max Amount (£)`, and target `Category`. Each row has 1-click **↑ Move Up**, **↓ Move Down**, **✎ Edit**, and **🗑️ Delete** buttons (all auto-saving immediately).
   - **Top Action:** **🚀 Apply Rules to All Existing Data** button that runs `apply_auto_rules` across the active scope's database and saves to disk.
   - **Right Panel (Add / Edit Rule + Live Rule Tester):**
     - Clean card to add a new rule (or edit a selected rule).
     - Live **"Test Rule Match"** card where typing a sample merchant name, notes, and amount immediately highlights which rule # would match (or warns if none match).
2. **🔒 Committed Bills & Presets:**
   - Interactive category grid/checklist to toggle which categories count as **Committed Bills** (`committed_categories`), auto-saving on toggle.
   - **Committed Presets (`committed_presets`):** Card to load a saved baseline preset (e.g., "2025 Baseline"), save the current selection as a new preset, or delete an old preset.
3. **🏷️ Categories, Google Sheets & System Health:**
   - **Custom Categories:** View existing custom categories and add/remove custom categories (`custom_categories`).
   - **Monzo Google Sheets Configuration:** Edit and save `monzo_sheet_url` and `monzo_sheet_worksheet` for the active scope.
   - **Startup Health & Storage Diagnostics:** Displays green/warning status badges for Database file, Settings file, Saved Filters file, Assets file, and Auth Secrets, showing the resolved runtime file paths.

---

## 5. Technical Architecture & Side-by-Side Deployment

### 5.1 Backend & Frontend Structure
To keep the repository clean and ensure the existing Streamlit app (`app.py`, `cashflow_utils.py`, `Dockerfile`, `tests/`) continues to work without any disruption:
- **`backend/` (Python FastAPI service):**
  - Reuses `cashflow_utils.py` and extracts/shares pure data-processing functions (CSV loading/saving with atomic writes, Monzo split expansion, HSBC/Barclaycard parsing, auto-rules, smart subscription dictionary, recurrence detection) so logic is tested and consistent.
  - Exposes REST endpoints under `/api/*` (scoped via `?scope=Personal|Joint` or header) and serves the compiled React static bundle (`frontend/dist`) at `/` in production.
- **`frontend/` (React + TypeScript + Vite + Tailwind CSS):**
  - Uses Lucide icons and Recharts (or Plotly.js) for responsive dark/light charts.
  - Communicates with `/api/*` using `fetch` with credentials included.

### 5.2 Side-by-Side Docker & Deployment Setup
- **Existing App (Untouched):**
  - Continues running `streamlit run app.py` on port `8501` (`uk_expense_tracker` container).
- **New React + FastAPI App (Side-by-Side):**
  - Packaged via `Dockerfile.web` (multi-stage build: `node:20-alpine` builds `frontend/dist`, `python:3.11-slim` runs `uvicorn backend.main:app --host 0.0.0.0 --port 8502`).
  - Added as a second service (`expense-tracker-web`) in `docker-compose.prod.yml` mapped to port **`8502:8502`**, mounting the exact same `./data:/app/data` and `./.streamlit/secrets.toml:/app/.streamlit/secrets.toml:ro` volumes.
  - `.github/workflows/publish-ghcr.yml` builds and publishes both `ghcr.io/notascooby25/uk-expense-tracker:latest` (Streamlit, port 8501) and `ghcr.io/notascooby25/uk-expense-tracker-web:latest` (React + FastAPI, port 8502) so Watchtower and the user's NUC can run both side-by-side until the user decides to retire the Streamlit container.

---

## 6. What Is Left to the Builder

The following implementation details are left to the builder's judgment during planning and execution:
- Exact FastAPI route signatures and Pydantic schema naming.
- Choice of React charting library (`recharts` vs `react-plotly.js`)—`recharts` is recommended for main bar/line/area charts for bundle speed and native dark-mode styling, with a clean interactive 2-level breakdown or sunburst for the Bank > Category chart.
- Internal component file organization under `frontend/src/` and `backend/`.
- Specific CSS animation timings and toast library selection.

# Category Inspector Inline Edit & Transactions Time-Period Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow inline category editing directly inside the Dashboard's Category Inspector and pre-filter the Transactions Editor to the Dashboard's active time period and bank when clicking "Open in Transactions Editor".

**Architecture:** Extend `/api/transactions` and `/api/transactions/export` to support optional `months` filtering (matching the Dashboard's Calendar Year month-pill filter for non-contiguous month selections). Introduce a `TransactionsFilterHandoff` type in `frontend/src/types.ts` computed from the Dashboard's active `timeMode`, `selectedPeriod`, `selectedMonths`, `ignoreLegacy`, and `bank` state, pass it through `App.tsx` to `TransactionsPage.tsx`, and add an inline `Category` `<select>` column in `DashboardPage.tsx`'s Category Inspector transactions table that patches the transaction and refreshes the Dashboard.

**Tech Stack:** FastAPI, Pandas, Pytest, React 18, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-10-11-category-inspector-transactions-handoff-design.md`

## Global Constraints

- Preserve PEP 8 and Ruff formatting on Python backend files (`./venv/bin/ruff check .`, `./venv/bin/ruff format .`).
- Preserve TypeScript strict typing in `frontend/src/`.
- Never modify runtime data files in `data/`.

## Review Focus

- Non-contiguous Calendar Year months selected on Dashboard (e.g., `["January", "March"]` in `2026`): `/api/transactions` and `/api/transactions/export` must filter to only those selected months within the date range rather than including February.
- Leap year February end-of-month date calculation (e.g., `February` in `2024` vs `2026`): `date_to` must use the exact last day of the month (`2024-02-29` vs `2026-02-28`).
- Transaction row in Category Inspector whose current `Category` is a legacy/unlisted category not in `masterCategories`: the inline `<select>` must include `tx.Category` in its options so the current value renders accurately.
- Clicking "Reset Filters" on `TransactionsPage` after navigating from the Dashboard: must clear `dateFrom`, `dateTo`, `financialYear`, `bank`, `category`, and `months` back to default all-time view.
- `bank = "All Banks"` on Dashboard vs `bank = "All"` on TransactionsPage: handoff must normalize `"All Banks"` to `"All"` so the TransactionsPage Bank dropdown matches its option value.

---

### Task 1: Backend Month Filtering Support in `/api/transactions` and `/api/transactions/export`

**Files:**
- Modify: `backend/main.py:182-228`
- Modify: `backend/main.py:374-455`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- Consumes: `df: pd.DataFrame` from `load_transactions(norm_scope)`
- Produces: `_filter_transactions_df(..., months: list[str] | None = None) -> pd.DataFrame`, `GET /api/transactions?months=...`, `GET /api/transactions/export?months=...`

- [ ] **Step 1: Write the failing test in `tests/test_backend_api.py`**

```python
def test_transactions_filter_by_date_range_and_months(api_env):
    """Verify /api/transactions supports date_from, date_to, and months filters matching Dashboard."""
    client = TestClient(app)
    client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": False},
    )

    # Filter Bills in February 2026 via date_from / date_to
    r_feb = client.get(
        "/api/transactions?scope=Personal&category=Bills&date_from=2026-02-01&date_to=2026-02-28"
    )
    assert r_feb.status_code == 200
    feb_data = r_feb.json()
    assert feb_data["total"] == 1
    assert feb_data["rows"][0]["Date"] == "2026-02-18"

    # Filter Bills by explicit month name list (months=January)
    r_jan = client.get(
        "/api/transactions?scope=Personal&category=Bills&date_from=2026-01-01&date_to=2026-12-31&months=January"
    )
    assert r_jan.status_code == 200
    jan_data = r_jan.json()
    assert jan_data["total"] == 1
    assert jan_data["rows"][0]["Date"] == "2026-01-18"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_api.py::test_transactions_filter_by_date_range_and_months -v`
Expected: FAIL because `months` query parameter is not yet applied in `_filter_transactions_df`.

- [ ] **Step 3: Implement `months` filtering in `_filter_transactions_df`, `list_transactions`, and `export_transactions_csv` in `backend/main.py`**

Add `months: list[str] | None = None` to `_filter_transactions_df` (matching full `%B` or short `%b` month names just like `backend/analytics.py:128-131`), and add `months: str = Query("")` to `list_transactions` and `export_transactions_csv`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_api.py -v`
Expected: PASS

---

### Task 2: Frontend Filter Handoff & Inline Category Editing in Category Inspector

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts:129-194`
- Modify: `frontend/src/App.tsx:33-35,119-126,225-244`
- Modify: `frontend/src/pages/DashboardPage.tsx:34-40,172-233,830-945`
- Modify: `frontend/src/pages/TransactionsPage.tsx:20-85,137-150,368-391`

**Interfaces:**
- Consumes: `GET /api/transactions` (with optional `months`), `PATCH /api/transactions/{row_id}`
- Produces:
  - `TransactionsFilterHandoff` in `frontend/src/types.ts`:
    ```ts
    export interface TransactionsFilterHandoff {
      category?: string;
      bank?: string;
      financial_year?: string;
      date_from?: string;
      date_to?: string;
      months?: string[];
    }
    ```
  - `buildTransactionsHandoff` in `frontend/src/pages/DashboardPage.tsx` converting active Dashboard filters (`timeMode`, `selectedPeriod`, `selectedMonths`, `ignoreLegacy`, `bank`, `category`) into `TransactionsFilterHandoff`
  - Inline `<select>` for `Category` in `DashboardPage.tsx` Category Inspector table calling `api.patchTransaction` and refreshing the Dashboard & drill-down

- [ ] **Step 1: Add `TransactionsFilterHandoff` to `frontend/src/types.ts` and `months?: string[]` to `api.getTransactions` & `api.getExportUrl` in `frontend/src/api.ts`**

Add `TransactionsFilterHandoff` interface in `frontend/src/types.ts` and include `months: (params.months || []).join(',')` in `api.getTransactions` and `api.getExportUrl`.

- [ ] **Step 2: Update `DashboardPage.tsx` to support inline Category editing in Category Inspector and build `TransactionsFilterHandoff`**

1. Compute `TransactionsFilterHandoff` when clicking **Open in Transactions Editor**:
   - `category`: `inspectCategory`
   - `bank`: `bank && bank !== 'All Banks' ? bank : 'All'`
   - When `timeMode === 'Financial Year'`:
     - `financial_year`: `selectedPeriod`
     - `date_from`: `selectedPeriod === 'All' && ignoreLegacy ? '2021-01-01' : ''`
     - `date_to`: `''`
   - When `timeMode === 'Calendar Year'`:
     - If `selectedPeriod !== 'All'`:
       - Compute month indices (`0..11`) for `selectedMonths`.
       - If `selectedMonths.length === 0`: `date_from = "${year}-01-01"`, `date_to = "${year}-12-31"`.
       - If `selectedMonths.length >= 1`: `minMonth = Math.min(...indices)`, `maxMonth = Math.max(...indices)`, `date_from = YYYY-MM-01` for `minMonth`, `date_to = YYYY-MM-DD` (exact last day of `maxMonth` in `year` via `new Date(year, maxMonth + 1, 0).getDate()`). If non-contiguous (`maxMonth - minMonth + 1 !== indices.length`), also pass `months: selectedMonths`.
     - If `selectedPeriod === 'All'`:
       - `date_from = ignoreLegacy ? '2021-01-01' : ''`, `date_to = ''`, and if `selectedMonths.length > 0`, pass `months: selectedMonths`.
   - When `timeMode === 'Rolling Period'`:
     - Match backend rolling cutoff:
       - If `selectedPeriod === 'This Month'`: `date_from` is 1st of current month (`YYYY-MM-01`).
       - Otherwise (`Last 3 Months`, `Last 6 Months`, `Last 12 Months`, `Last 18 Months`, `Last 2 Years`): subtract `N` months from today (`YYYY-MM-DD`).
2. Add inline `Category` `<select>` column in the Category Inspector's transactions table (`DashboardPage.tsx` lines 906-942):
   - Render `<select>` with `masterCategories` (and `tx.Category` if not already in `masterCategories`).
   - On change, call `api.patchTransaction(scope, tx.row_id, { Category: e.target.value })` and then `fetchDashboard()` so both Dashboard KPIs/breakdowns and the Category Inspector update immediately.

- [ ] **Step 3: Update `App.tsx` and `TransactionsPage.tsx` to accept and apply `TransactionsFilterHandoff`**

In `App.tsx`, replace `prefilterCategory: string | null` with `prefilterHandoff: TransactionsFilterHandoff | null`.
In `TransactionsPage.tsx`, accept `initialFilters?: TransactionsFilterHandoff | null` and `onClearInitialFilters?: () => void`, apply `category`, `bank`, `financial_year`, `date_from`, `date_to`, and `months` when `initialFilters` arrives, show active `months` filter badge if non-contiguous months are set, and clear `months` in `handleResetFilters` or when `dateFrom`/`dateTo` is manually changed.

- [ ] **Step 4: Build frontend and run full test + lint suite**

Run: `npm --prefix frontend run build && ./venv/bin/ruff check . && ./venv/bin/pytest`
Expected: Frontend TypeScript build succeeds with 0 errors, Ruff check passes with 0 errors, and all pytest tests pass.

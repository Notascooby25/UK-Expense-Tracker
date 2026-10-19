# Loan Tracking & True Net Worth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement personal loan and debt tracking in the Wealth tab so outstanding debt is subtracted from total assets for true net worth, displayed in a dedicated KPI card with payoff progress, and logged across date snapshots.

**Architecture:** Add scoped `debts.json` storage in `backend/storage.py` and extend `backend/analytics.py` with forward-filled timeline alignment. Update FastAPI endpoints in `backend/main.py` with safe partial updates and scoped deletion. Extend TypeScript interfaces and update `frontend/src/pages/WealthPage.tsx` with mobile-responsive KPI cards, debt balance logger, and history management.

**Tech Stack:** Python 3.14 (FastAPI, Pandas, Pytest, Ruff), TypeScript, React, Tailwind CSS, Recharts, Vite.

**Spec:** `docs/superpowers/specs/2026-10-19-loan-tracking-wealth-design.md`

## Global Constraints
- Target version bump: `0.6.6` in `backend/changelog.py` and `frontend/package.json`.
- Scoped flat-file isolation: Debts stored in `debts.json` / `debts_joint.json` via `resolve_scope_paths`.
- Existing `assets.json` structure must never be modified or corrupted.
- All backend routes require `@require_auth`.
- Zero linter or test failures: `./venv/bin/ruff check .`, `./venv/bin/pytest`, `./venv/bin/pre-commit run --all-files`, and `npm run build` in `frontend/`.

## Review Focus
1. **Empty / Missing Debts File:** If `debts.json` does not exist or has no entries, the app must fall back seamlessly to assets-only net worth without runtime errors.
2. **Independent Snapshot Deletion:** Deleting a debt snapshot on date X in Edit History must leave the asset snapshot on date X completely intact.
3. **Mismatched Date Carry-Forward:** If assets are logged on date A and debt on date B, `build_wealth_data` must carry forward the last known balance so the net worth curve does not falsely drop or spike to £0.
4. **Loan Payoff Zero State:** When a loan balance is logged as £0 (or fully paid off), the Outstanding Loan card displays 100% repaid gracefully.
5. **Mobile Viewport Overflow:** On 360px–400px mobile screens, the new Outstanding Loan card must stack cleanly under Total Net Worth without horizontal scrolling.

---

### Task 1: Scoped Debt Storage in `backend/storage.py`

**Files:**
- Modify: `backend/storage.py:122-137, 270-290`
- Test: `tests/test_backend_storage.py`

**Interfaces:**
- Consumes: `resolve_scope_paths(scope: str) -> dict[str, str]`, `load_json_file`, `atomic_write_json`
- Produces: `load_debts(scope: str) -> dict[str, Any]`, `save_debts(scope: str, debts: dict[str, Any]) -> None`

- [ ] **Step 1: Write the failing tests in `tests/test_backend_storage.py`**

```python
def test_load_save_debts_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    from backend.storage import load_debts, save_debts

    initial = load_debts("Personal")
    assert initial == {"loans": {}, "balances": {}}

    sample = {
        "loans": {"Monzo Loan": {"original_amount": 5000.0}},
        "balances": {"2026-10-18": {"Monzo Loan": 4850.0}},
    }
    save_debts("Personal", sample)
    loaded = load_debts("Personal")
    assert loaded["loans"]["Monzo Loan"]["original_amount"] == 5000.0
    assert loaded["balances"]["2026-10-18"]["Monzo Loan"] == 4850.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_storage.py -k test_load_save_debts_roundtrip`
Expected: FAIL with `ImportError: cannot import name 'load_debts'`

- [ ] **Step 3: Implement `load_debts` and `save_debts` in `backend/storage.py`**

Add `"debts": os.path.join(data_dir, get_scoped_filename("debts.json", scope))` to `resolve_scope_paths`.
Implement:
```python
def load_debts(scope: str) -> dict[str, Any]:
    paths = resolve_scope_paths(scope)
    raw = load_json_file(paths["debts"])
    if not isinstance(raw, dict):
        return {"loans": {}, "balances": {}}
    raw.setdefault("loans", {})
    raw.setdefault("balances", {})
    return raw


def save_debts(scope: str, debts: dict[str, Any]) -> None:
    paths = resolve_scope_paths(scope)
    atomic_write_json(paths["debts"], debts)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_storage.py -k test_load_save_debts_roundtrip`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/storage.py tests/test_backend_storage.py
git commit -m "feat(storage): add load_debts and save_debts with scoped debts.json resolution"
```

---

### Task 2: Wealth Analytics & Forward-Fill Alignment in `backend/analytics.py`

**Files:**
- Modify: `backend/analytics.py:628-732`
- Test: `tests/test_backend_analytics.py`

**Interfaces:**
- Consumes: `load_assets`, `load_debts`
- Produces: `build_wealth_data(df, assets_data, debts_data, ignore_legacy=True, timeframe="All Time") -> dict[str, Any]`

- [ ] **Step 1: Write failing analytics tests**

```python
def test_build_wealth_data_with_debts():
    from backend.analytics import build_wealth_data
    import pandas as pd

    assets_data = {
        "2026-09-30": {"Savings": 10000.0},
        "2026-10-31": {"Savings": 12000.0},
    }
    debts_data = {
        "loans": {"Monzo Loan": {"original_amount": 5000.0}},
        "balances": {
            "2026-10-18": {"Monzo Loan": 4850.0},
        },
    }

    result = build_wealth_data(pd.DataFrame(), assets_data, debts_data)

    assert result["latest_assets_total"] == 12000.0
    assert result["latest_debts_total"] == 4850.0
    assert result["latest_net_worth"] == 7150.0
    assert len(result["loans_summary"]) == 1
    assert result["loans_summary"][0]["name"] == "Monzo Loan"
    assert result["loans_summary"][0]["repaid_amount"] == 150.0
    assert result["loans_summary"][0]["pct_repaid"] == 3.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_analytics.py -k test_build_wealth_data_with_debts`
Expected: FAIL (takes 2 arguments instead of 3 or missing keys)

- [ ] **Step 3: Update `build_wealth_data` in `backend/analytics.py`**

- Accept optional `debts_data: dict[str, Any] | None = None`. Default to empty dict if omitted.
- Extract `known_debts`, `debt_balances` from `debts_data.get("balances", {})` and `loans_metadata = debts_data.get("loans", {})`.
- Collect all distinct dates from `sorted(set(assets_data.keys()).union(debt_balances.keys()))`.
- Maintain running state `current_assets` and `current_debts`, forward-filling known balances across chronological dates.
- For each date: `net_worth = sum(current_assets.values()) - sum(current_debts.values())`.
- Generate `loans_summary`: for each loan, `original = metadata.get(loan, {}).get("original_amount") or max(past_balances, default=balance)`, `repaid = original - balance`, `pct = round(repaid / original * 100, 1)`.
- Return payload keys: `known_debts`, `debts_by_month`, `latest_debts`, `latest_assets_total`, `latest_debts_total`, `latest_net_worth`, `loans_summary`, `net_worth_series` (with `assets`, `debts`, `net_worth`).

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_analytics.py -k test_build_wealth_data_with_debts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/analytics.py tests/test_backend_analytics.py
git commit -m "feat(analytics): add debt deduction, loans summary, and timeline carry-forward to build_wealth_data"
```

---

### Task 3: Backend API Endpoints in `backend/main.py`

**Files:**
- Modify: `backend/main.py:153-165, 814-915`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- Consumes: `load_assets`, `save_assets`, `load_debts`, `save_debts`, `build_wealth_data`
- Produces: Updated `/api/wealth`, `/api/wealth/balances`, `/api/wealth/balances/{date}`, `/api/wealth/accounts`

- [ ] **Step 1: Write failing API integration tests in `tests/test_backend_api.py`**

```python
def test_wealth_api_supports_debt_balances_and_summary(client, auth_headers):
    # Save both asset and debt on date
    payload = {
        "date": "2026-10-18",
        "asset_balances": {"Savings": 10000.0},
        "debt_balances": {"Monzo Loan": 4850.0},
        "loans_metadata": {"Monzo Loan": {"original_amount": 5000.0}},
    }
    res = client.post("/api/wealth/balances?scope=Personal", json=payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["wealth"]
    assert data["latest_net_worth"] == 5150.0
    assert data["loans_summary"][0]["name"] == "Monzo Loan"
    assert data["loans_summary"][0]["repaid_amount"] == 150.0

    # Delete only debt snapshot on date
    del_res = client.delete(
        "/api/wealth/balances/2026-10-18?scope=Personal&target=debts", headers=auth_headers
    )
    assert del_res.status_code == 200
    after_data = del_res.json()["wealth"]
    assert after_data["latest_net_worth"] == 10000.0  # Asset preserved!
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_api.py -k test_wealth_api_supports_debt_balances_and_summary`
Expected: FAIL

- [ ] **Step 3: Implement endpoint updates in `backend/main.py`**

- Update `WealthBalanceSaveRequest`:
  ```python
  class WealthBalanceSaveRequest(BaseModel):
      date: str = ""
      month: str = ""
      balances: dict[str, float] = {}
      asset_balances: dict[str, float] | None = None
      debt_balances: dict[str, float] | None = None
      loans_metadata: dict[str, dict[str, float]] | None = None
  ```
- In `POST /api/wealth/balances`:
  - If `debt_balances` is provided, update `debts_data["balances"][snapshot_key]` and any `loans_metadata` in `debts_data["loans"]`. Save via `save_debts`.
  - Maintain backward compatibility: if `balances` provided without `asset_balances`, treat `balances` as `asset_balances`.
- In `DELETE /api/wealth/balances/{month}`:
  - Add query param `target: str = "all"` (`assets`, `debts`, or `all`).
  - Only delete from assets if `target in ("assets", "all")`.
  - Only delete from debts if `target in ("debts", "all")`.
- In `POST /api/wealth/accounts`:
  - Add `account_type: str = "asset"` (`"asset"` or `"debt"`).
  - Handle renaming/deleting across `assets_data` or `debts_data`.

- [ ] **Step 4: Run all backend tests to verify they pass**

Run: `./venv/bin/pytest tests/`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/test_backend_api.py
git commit -m "feat(api): expand wealth endpoints to support debts, loans metadata, and targeted deletion"
```

---

### Task 4: Frontend Types & API Client Updates

**Files:**
- Modify: `frontend/src/types.ts:193-210`
- Modify: `frontend/src/api.ts:315-375`

**Interfaces:**
- Consumes: Backend API responses
- Produces: `LoanSummary`, updated `WealthPayload`, `saveWealthBalances` with dual payload, `manageWealthAccount` with `account_type`

- [ ] **Step 1: Update `frontend/src/types.ts`**

Add:
```typescript
export interface LoanSummary {
  name: string;
  original_amount: number;
  current_balance: number;
  repaid_amount: number;
  pct_repaid: number;
}

export interface WealthPayload {
  known_assets: string[];
  known_debts?: string[];
  assets_by_month: Record<string, Record<string, number>>;
  debts_by_month?: Record<string, Record<string, number>>;
  latest_month: string;
  latest_date?: string;
  latest_balances: Record<string, number>;
  latest_debts?: Record<string, number>;
  latest_assets_total?: number;
  latest_debts_total?: number;
  latest_net_worth: number;
  net_worth_delta: number;
  loans_summary?: LoanSummary[];
  net_worth_series: Array<{
    month: string;
    total: number;
    assets?: number;
    debts?: number;
  }>;
  asset_timeline: Array<Record<string, any>>;
  internal_timeline: Array<Record<string, any>>;
  internal_transactions: Array<Record<string, any>>;
}
```

- [ ] **Step 2: Update `frontend/src/api.ts`**

Update `saveWealthBalances`:
```typescript
saveWealthBalances: async (
  scope: AccountScope,
  payload: {
    date: string;
    asset_balances?: Record<string, number>;
    debt_balances?: Record<string, number>;
    loans_metadata?: Record<string, { original_amount: number }>;
  }
)
```
Update `deleteWealthMonth` with optional `target: 'assets' | 'debts' | 'all'`.
Update `manageWealthAccount` with optional `account_type?: 'asset' | 'debt'`.

- [ ] **Step 3: Verify TypeScript builds**

Run: `npm run build` in `frontend/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat(frontend): add loan and debt payload types and api client methods"
```

---

### Task 5: Wealth Page UI Enhancements in `frontend/src/pages/WealthPage.tsx`

**Files:**
- Modify: `frontend/src/pages/WealthPage.tsx`

**Interfaces:**
- Consumes: `WealthPayload`, `LoanSummary`, `api`

- [ ] **Step 1: Implement Headline KPI Cards (Total Net Worth + Outstanding Loan)**

- In `WealthPage.tsx`:
  - When `data?.latest_debts_total && data.latest_debts_total > 0`, calculate `grid-cols-1 md:grid-cols-4` or stack appropriately.
  - **Total Net Worth Card:**
    - Headline: `£{(data?.latest_net_worth || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    - Subtitle: `Total Assets: £${(data?.latest_assets_total || data?.latest_net_worth || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })} — Debt: £${(data?.latest_debts_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
  - **Outstanding Loan Card:**
    - Title: "Outstanding Loan" (or name of primary loan).
    - Amount: `£{(data?.latest_debts_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` in soft coral / warm text (`text-rose-400` / `text-amber-300`).
    - Progress Bar: horizontal bar with percentage width matching `loans_summary[0].pct_repaid`.
    - Subtitle: `Original: £${loan.original_amount.toLocaleString('en-GB')} • Repaid: £${loan.repaid_amount.toLocaleString('en-GB')} (${loan.pct_repaid}%)`.

- [ ] **Step 2: Implement Debts in the Wealth Balance Logger**

- In the logger form:
  - Add section title "Savings & Asset Balances" for assets.
  - Add section title "Debts & Loans" for liabilities with fields for each known debt (e.g. "Monzo Loan").
  - Provide an inline "Original Amount" setting or input when a new loan is added.
  - When clicking "Save Recorded Balances", submit both `asset_balances` and `debt_balances`.

- [ ] **Step 3: Update Edit History Modal for Safe Deletion & Editing**

- In Edit History modal:
  - Render tabs or sub-sections for "Assets" and "Debts / Loans".
  - Ensure deleting a snapshot from the "Debts" view calls `api.deleteWealthMonth(scope, date, 'debts')` so the corresponding asset snapshot remains safe.

- [ ] **Step 4: Verify Frontend Build & Visual Regression**

Run: `npm run build` in `frontend/`
Expected: PASS with 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WealthPage.tsx
git commit -m "feat(ui): add outstanding loan KPI card, debt balance logger, and safe history management"
```

---

### Task 6: Version Bump, Verification & Documentation

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

- [ ] **Step 1: Bump version to `0.6.6` in `backend/changelog.py` and `frontend/package.json`**

Prepend new entry:
```python
(
    {
        "version": "0.6.6",
        "date": "19 Oct 2026",
        "title": "Monzo Loan & Debt Tracking with True Net Worth",
        "changes": [
            "Introduced debt and loan liability tracking in the Wealth & Net Worth dashboard.",
            "Added an Outstanding Loan KPI card featuring real-time balance, original borrowing, and repayment progress bar.",
            "Updated Total Net Worth to reflect true financial position (Assets minus Outstanding Debt) with clear breakdown.",
            "Expanded Wealth Balance Logger and Edit History modal to manage debt balances alongside assets safely.",
        ],
    },
)
```

- [ ] **Step 2: Run linters, formatters, and full test suite**

Run:
```bash
./venv/bin/ruff check .
./venv/bin/ruff format .
./venv/bin/pytest
./venv/bin/pre-commit run --all-files
cd frontend && npm run build
```
Expected: All checks pass with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/changelog.py frontend/package.json
git commit -m "chore(release): bump version to 0.6.6 with loan tracking changelog"
```

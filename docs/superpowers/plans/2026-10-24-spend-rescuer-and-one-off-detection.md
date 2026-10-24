# Automated Spend Rescuer & One-Off Expense Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an automated helper in UK Expense Tracker that detects out-of-character spend spikes (one-offs like phone replacements or DIY projects), excludes them from baseline monthly living costs, identifies recurring discretionary lifestyle leaks (coffees, takeaways), and offers configurable time horizon filtering (2026, 2025, 2024, All Time).

**Architecture:**
- **Data Layer:** Add `Is_Exceptional` to standard transaction schema in `backend/storage.py` and `app.py`. Default missing values to `False`, provide atomic persistence, and extend `settings.json` with `ignore_exceptional_candidates` and `discretionary_leak_taxonomies`.
- **Analytics & API:** Update `prepare_filtered_dashboard_df` to exclude `Is_Exceptional` rows when `exclude_exceptional=True`. Update `build_intelligence_data` to accept `horizon` query param, detect statistical outliers (>£150 & >2.5x category median), roll up frequent small leaks into habit themes (>=3 transactions), and calculate category creep (>20% jump over prior 6 months). Expose action endpoints in `backend/main.py`.
- **Frontend (React + Tailwind):** Add `One-Off` toggle and filter support in `TransactionsPage.tsx`, build the "Spend Helper & One-Off Audit" section in `IntelligencePage.tsx` with horizon selector and 1-click action buttons, and link Dashboard callout banner to filtered transactions.

**Tech Stack:** Python 3.11+, FastAPI, Pandas, React 19, TypeScript, Tailwind CSS, Vite, Pytest, Ruff.

**Spec:** `docs/superpowers/specs/2026-10-24-spend-rescuer-and-one-off-detection-design.md`

## Global Constraints
- Only read, create, edit or delete files inside `/home/andyl/expense_tracker`.
- Never manually edit runtime CSVs in `data/` or mock runtime databases directly outside atomic helpers.
- Run ruff check, ruff format, and pytest after changes, ensuring 100% pass rate.
- Bump `APP_VERSION` and prepend `CHANGELOG` in `backend/changelog.py` (sync `frontend/package.json` `"version"`).

## Review Focus
- **CSV Schema Compatibility:** Loading an existing CSV missing `Is_Exceptional` must default to `False` and not fail or alter existing data.
- **Dual-App Persistence:** Streamlit (`app.py`) must include `Is_Exceptional` in `COLS` so saving from Streamlit never silently drops the column.
- **Dismissal Granularity:** Dismissing a spike at Currys must record `f"{date}|{name}|{amount}"`, only silencing that specific purchase and not future ones at Currys.
- **Trivial Leak Filtering:** Discretionary leak scanner must require at least 3 transactions in the active period so a single coffee from months ago doesn't generate a false savings habit.
- **Dashboard Metric Accuracy:** Excluded one-off items must reduce `variable_expenses` and `avg_baseline` on the dashboard, while keeping net cash flow accurate.

---

### Task 1: Storage Schema & Dual-App Safety (`backend/storage.py` and `app.py`)

**Files:**
- Modify: `backend/storage.py:23-45`, `backend/storage.py:90-115`, `backend/storage.py:520-585`
- Modify: `app.py:105-120`, `app.py:1130-1140`
- Test: `tests/test_backend_storage.py`

**Interfaces:**
- Produces: `COLS` containing `"Is_Exceptional"`, `DEFAULT_SETTINGS` containing `"ignore_exceptional_candidates": []` and `"discretionary_leak_taxonomies"`. `load_transactions(scope)` returns DataFrame with boolean `Is_Exceptional`. `save_transactions(scope, df)` persists `Is_Exceptional` without error.

- [ ] **Step 1: Write failing tests in `tests/test_backend_storage.py`**

```python
def test_is_exceptional_schema_backward_compatibility_and_roundtrip(tmp_path, monkeypatch):
    from backend.storage import COLS, load_transactions, save_transactions

    assert "Is_Exceptional" in COLS

    # Simulate existing CSV without Is_Exceptional column
    db_file = tmp_path / "expense_database.csv"
    old_csv = "Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year,Is_Subscription\n01/10/2026,Phone Replacement,599.00,Expense,Monzo,Shopping,Broken screen,2026/27,False\n"
    db_file.write_text(old_csv, encoding="utf-8")

    monkeypatch.setattr(
        "backend.storage.resolve_scope_paths",
        lambda scope: {
            "db": str(db_file),
            "settings": str(tmp_path / "settings.json"),
            "filters": str(tmp_path / "saved_filters.json"),
            "assets": str(tmp_path / "assets.json"),
        },
    )

    df = load_transactions("Personal")
    assert "Is_Exceptional" in df.columns
    assert df.loc[0, "Is_Exceptional"] == False

    # Mark as exceptional and save
    df.loc[0, "Is_Exceptional"] = True
    save_transactions("Personal", df)

    reloaded = load_transactions("Personal")
    assert reloaded.loc[0, "Is_Exceptional"] == True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_storage.py::test_is_exceptional_schema_backward_compatibility_and_roundtrip -v`
Expected: FAIL (assertion `"Is_Exceptional" in COLS` fails)

- [ ] **Step 3: Implement `Is_Exceptional` in `backend/storage.py` and `app.py`**
  - Add `"Is_Exceptional"` to `COLS` in `backend/storage.py`.
  - In `load_transactions`, ensure missing `"Is_Exceptional"` defaults to `False` and cast to `bool`.
  - In `save_transactions`, ensure `"Is_Exceptional"` is formatted as boolean.
  - In `DEFAULT_SETTINGS`, add `"ignore_exceptional_candidates": []` and default `"discretionary_leak_taxonomies"`.
  - In `app.py`, add `"Is_Exceptional"` to `COLS` (line 107) and add `"Is_Exceptional"` to `disabled_cols` exclusions so Streamlit editor allows toggling it.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_storage.py::test_is_exceptional_schema_backward_compatibility_and_roundtrip -v`
Expected: PASS

- [ ] **Step 5: Run full storage test suite**

Run: `./venv/bin/pytest tests/test_backend_storage.py -v`
Expected: 100% PASS

- [ ] **Step 6: Commit**

```bash
git add backend/storage.py app.py tests/test_backend_storage.py
git commit -m "feat(storage): add Is_Exceptional column with dual-app safety and backward compatibility"
```

---

### Task 2: Analytics - Dashboard Run-Rate Exclusion (`backend/analytics.py`)

**Files:**
- Modify: `backend/analytics.py:135-180`
- Test: `tests/test_backend_analytics.py`

**Interfaces:**
- Consumes: DataFrame with `Is_Exceptional` column, settings dictionary with `exceptional_categories`.
- Produces: `prepare_filtered_dashboard_df` returns `exceptional_summary` including individual one-off transactions and filters out `Is_Exceptional == True` rows when `exclude_exceptional=True`.

- [ ] **Step 1: Write failing test in `tests/test_backend_analytics.py`**

```python
def test_dashboard_excludes_individual_exceptional_transactions():
    from backend.analytics import prepare_filtered_dashboard_df
    import pandas as pd

    df = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-10-05"),
                "Name": "Pret A Manger",
                "Amount": 4.50,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Dining Out",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
            {
                "Date": pd.Timestamp("2026-10-10"),
                "Name": "Apple Store",
                "Amount": 799.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Shopping",
                "Notes": "Replacement phone",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": True,
            },
        ]
    )

    settings = {"exceptional_categories": [], "committed_categories": []}
    filters = {
        "exclude_exceptional": True,
        "time_mode": "Rolling Period",
        "selected_period": "This Month",
    }

    df_filtered, months, _, exc_summary = prepare_filtered_dashboard_df(df, settings, filters)

    # Excluded from active filtered dataframe
    assert len(df_filtered) == 1
    assert df_filtered.iloc[0]["Name"] == "Pret A Manger"

    # Present in exceptional summary
    assert len(exc_summary) == 1
    assert exc_summary[0]["category"] == "Shopping"
    assert exc_summary[0]["total"] == 799.00
    assert exc_summary[0]["count"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_analytics.py::test_dashboard_excludes_individual_exceptional_transactions -v`
Expected: FAIL

- [ ] **Step 3: Implement individual one-off exclusion in `prepare_filtered_dashboard_df`**
  - Check for `Is_Exceptional` column in `df_v`.
  - When `exclude_exceptional=True`, isolate rows where `Is_Exceptional == True` (or category in `exceptional_cats`).
  - Calculate `exceptional_summary` aggregating total and count for all excluded items by category.
  - Remove excluded rows from `df_v`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_analytics.py::test_dashboard_excludes_individual_exceptional_transactions -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/analytics.py tests/test_backend_analytics.py
git commit -m "feat(analytics): exclude individual Is_Exceptional transactions in dashboard run-rate"
```

---

### Task 3: Analytics - Spike Detection & Time Horizon Filtering (`backend/analytics.py`)

**Files:**
- Modify: `backend/analytics.py:510-565`
- Test: `tests/test_backend_analytics.py`

**Interfaces:**
- Consumes: `df: pd.DataFrame`, `settings: dict[str, Any]`, `horizon: str = "2026"`.
- Produces: `build_intelligence_data` returns `"one_off_candidates": list[dict[str, Any]]` where each candidate contains `row_id`, `date`, `name`, `amount`, `category`, `bank`, `signature`, and `reason`.

- [ ] **Step 1: Write failing test in `tests/test_backend_analytics.py`**

```python
def test_spike_detection_with_time_horizon_and_dismissal_signature():
    from backend.analytics import build_intelligence_data
    import pandas as pd

    df = pd.DataFrame(
        [
            # Normal shopping transactions
            {
                "Date": pd.Timestamp("2026-05-01"),
                "Name": "Amazon",
                "Amount": 25.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Shopping",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
            {
                "Date": pd.Timestamp("2026-06-01"),
                "Name": "Argos",
                "Amount": 30.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Shopping",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
            {
                "Date": pd.Timestamp("2026-07-01"),
                "Name": "IKEA",
                "Amount": 40.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Shopping",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
            # Outlier spike in 2026
            {
                "Date": pd.Timestamp("2026-10-01"),
                "Name": "Apple Store",
                "Amount": 650.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Shopping",
                "Notes": "Broken phone replacement",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
            # Outlier spike in 2025
            {
                "Date": pd.Timestamp("2025-04-10"),
                "Name": "B&Q",
                "Amount": 450.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Home",
                "Notes": "Garden patio",
                "Financial_Year": "2025/26",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
        ]
    )

    settings = {"ignore_exceptional_candidates": []}

    # 1. Horizon 2026 only catches the Apple Store spike
    intel_2026 = build_intelligence_data(df, settings, horizon="2026")
    candidates_2026 = intel_2026["one_off_candidates"]
    assert len(candidates_2026) == 1
    assert candidates_2026[0]["name"] == "Apple Store"
    assert candidates_2026[0]["amount"] == 650.00

    # 2. Dismissing Apple Store with signature suppresses it
    apple_sig = candidates_2026[0]["signature"]
    settings_dismissed = {"ignore_exceptional_candidates": [apple_sig]}
    intel_dismissed = build_intelligence_data(df, settings_dismissed, horizon="2026")
    assert len(intel_dismissed["one_off_candidates"]) == 0

    # 3. Horizon 2025 catches the B&Q spike
    intel_2025 = build_intelligence_data(df, settings, horizon="2025")
    assert any(c["name"] == "B&Q" for c in intel_2025["one_off_candidates"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_analytics.py::test_spike_detection_with_time_horizon_and_dismissal_signature -v`
Expected: FAIL

- [ ] **Step 3: Implement spike detection in `build_intelligence_data`**
  - Accept `horizon: str = "2026"` in `build_intelligence_data(df, settings, horizon="2026")`.
  - Filter by horizon: `"2026"`, `"2025"`, `"2024"` (matching `Date.dt.year`), `"last_6_months"`, or `"all"`.
  - Filter to non-committed expense transactions.
  - Calculate category median transaction amounts.
  - For each transaction where `Amount > 150.0` and `Amount > 2.5 * category_median` and `Is_Exceptional == False`:
    - Generate signature: `f"{date_str}|{name}|{amount:.2f}"`.
    - Skip if signature is in `settings.get("ignore_exceptional_candidates", [])`.
    - Append candidate with details.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_analytics.py::test_spike_detection_with_time_horizon_and_dismissal_signature -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/analytics.py tests/test_backend_analytics.py
git commit -m "feat(analytics): add spike detection with time horizon filtering and signature dismissal"
```

---

### Task 4: Analytics - Spend Rescuer (Discretionary Leaks & Category Creep) (`backend/analytics.py`)

**Files:**
- Modify: `backend/analytics.py:560-630`
- Test: `tests/test_backend_analytics.py`

**Interfaces:**
- Consumes: `df: pd.DataFrame`, `settings: dict[str, Any]`, `horizon: str`.
- Produces: `spend_rescue_opportunities` and `category_creep_warnings` inside payload returned by `build_intelligence_data`.

- [ ] **Step 1: Write failing test in `tests/test_backend_analytics.py`**

```python
def test_spend_rescuer_lifestyle_habits_and_category_creep():
    from backend.analytics import build_intelligence_data
    import pandas as pd

    # Multiple small coffees across 3 months
    rows = []
    for m in [8, 9, 10]:
        for d in [5, 12, 19, 26]:
            rows.append(
                {
                    "Date": pd.Timestamp(f"2026-{m:02d}-{d:02d}"),
                    "Name": "Pret A Manger",
                    "Amount": 4.25,
                    "Transaction_Type": "Expense",
                    "Bank": "Monzo",
                    "Category": "Dining Out",
                    "Notes": "",
                    "Financial_Year": "2026/27",
                    "Is_Subscription": False,
                    "Is_Exceptional": False,
                }
            )

    # Category creep in Groceries: 6-month baseline ~£200/mo, recent 3 months ~£400/mo
    for m in range(1, 7):
        rows.append(
            {
                "Date": pd.Timestamp(f"2026-{m:02d}-15"),
                "Name": "Tesco",
                "Amount": 200.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            }
        )
    for m in [8, 9, 10]:
        rows.append(
            {
                "Date": pd.Timestamp(f"2026-{m:02d}-15"),
                "Name": "Tesco",
                "Amount": 400.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            }
        )

    df = pd.DataFrame(rows)
    settings = {}
    intel = build_intelligence_data(df, settings, horizon="2026")

    # 1. Pret should be recognized under Coffee & Cafes
    habits = intel["spend_rescue_opportunities"]
    assert len(habits) >= 1
    coffee_habit = next(h for h in habits if h["habit"] == "Coffee & Cafes")
    assert coffee_habit["transaction_count"] == 12
    assert coffee_habit["annual_projected"] > 0
    assert coffee_habit["annual_savings_50pct"] > 0

    # 2. Groceries should trigger creep alert
    creep = intel["category_creep_warnings"]
    assert any(c["category"] == "Groceries" for c in creep)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_analytics.py::test_spend_rescuer_lifestyle_habits_and_category_creep -v`
Expected: FAIL

- [ ] **Step 3: Implement lifestyle habit grouping and category creep calculation in `build_intelligence_data`**
  - Load taxonomies from `settings.get("discretionary_leak_taxonomies", DEFAULT_TAXONOMIES)`.
  - Group transactions matching keywords by habit theme; require `transaction_count >= 3`.
  - Calculate monthly run-rate, annual cost, and projected annual savings for 25% and 50% cutbacks.
  - Calculate category creep: compare mean monthly spend in recent 3 completed months vs preceding 6 completed months. Flag if increase > 20% and > £50/month.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_analytics.py::test_spend_rescuer_lifestyle_habits_and_category_creep -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/analytics.py tests/test_backend_analytics.py
git commit -m "feat(analytics): add spend rescuer discretionary habits and category creep warnings"
```

---

### Task 5: API Endpoints & Actions in `backend/main.py`

**Files:**
- Modify: `backend/main.py:110-165`, `backend/main.py:650-715`, `backend/main.py:895-950`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- `GET /api/intelligence?horizon=2026&scope=Personal` -> returns `IntelligencePayload` with `one_off_candidates`, `spend_rescue_opportunities`, `category_creep_warnings`.
- `POST /api/intelligence/action` with action `"mark_one_off"` (sets `Is_Exceptional = True`) and `"dismiss_one_off"` (adds signature to `ignore_exceptional_candidates`).
- `PATCH /api/transactions/{row_id}` and `POST /api/transactions/bulk` allow setting `is_exceptional`.

- [ ] **Step 1: Write failing test in `tests/test_backend_api.py`**

```python
def test_intelligence_actions_and_patch_one_off(client, monkeypatch, tmp_path):
    # Setup test transactions
    ...
    # Test GET /api/intelligence?horizon=2026
    res = client.get("/api/intelligence?horizon=2026")
    assert res.status_code == 200
    data = res.json()
    assert "one_off_candidates" in data
    assert "spend_rescue_opportunities" in data
    assert "category_creep_warnings" in data

    # Test POST /api/intelligence/action mark_one_off
    res_mark = client.post(
        "/api/intelligence/action",
        json={
            "action": "mark_one_off",
            "row_id": 0,
        },
    )
    assert res_mark.status_code == 200

    # Test PATCH /api/transactions/0
    res_patch = client.patch("/api/transactions/0", json={"Is_Exceptional": False})
    assert res_patch.status_code == 200
    assert res_patch.json()["row"]["Is_Exceptional"] == False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_api.py -k "test_intelligence_actions_and_patch_one_off" -v`
Expected: FAIL

- [ ] **Step 3: Update `backend/main.py` endpoints and request models**
  - Add `Is_Exceptional: bool | None = None` to `TransactionPatchRequest` and `BulkTransactionsRequest`.
  - Update `get_intelligence` to accept `horizon: str = Query("2026")`.
  - Add `mark_one_off` and `dismiss_one_off` actions to `execute_intelligence_action`.
  - Ensure `_serialize_tx_rows` includes `"Is_Exceptional": bool(r.get("Is_Exceptional", False))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_backend_api.py -k "test_intelligence_actions_and_patch_one_off" -v`
Expected: PASS

- [ ] **Step 5: Run complete backend API test suite**

Run: `./venv/bin/pytest tests/test_backend_api.py -v`
Expected: 100% PASS

- [ ] **Step 6: Commit**

```bash
git add backend/main.py tests/test_backend_api.py
git commit -m "feat(api): expose intelligence horizon, one-off actions, and transaction Is_Exceptional patch"
```

---

### Task 6: Frontend Types & Transactions Editor (`frontend/src/`)

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/pages/TransactionsPage.tsx`
- Test: `npm run build` in `frontend/`

**Interfaces:**
- `TransactionRow` has `Is_Exceptional: boolean`.
- `api.getIntelligence(scope, horizon)` supports horizon param.
- `TransactionsPage` renders a `One-Off` toggle column and filter toggle for exceptional spend.

- [ ] **Step 1: Update TypeScript interfaces in `frontend/src/types.ts` and `frontend/src/api.ts`**
  - In `types.ts`, add `Is_Exceptional: boolean` to `TransactionRow`.
  - Add `one_off_candidates`, `spend_rescue_opportunities`, and `category_creep_warnings` to `IntelligencePayload`.
  - In `api.ts`, add `horizon?: string` to `getIntelligence(scope, horizon)`.
  - In `api.ts`, add `is_exceptional?: boolean` to transaction patch methods.

- [ ] **Step 2: Add One-Off column and filter in `frontend/src/pages/TransactionsPage.tsx`**
  - Add an amber/orange `One-Off` badge toggle in the transactions table rows.
  - Add `One-Off Only` filter toggle in the transaction filters header.
  - Support pre-filtering when routed from Dashboard with `is_exceptional: true`.

- [ ] **Step 3: Run TypeScript compiler and Vite build**

Run: `npm run build` in `frontend/`
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/pages/TransactionsPage.tsx
git commit -m "feat(frontend): add Is_Exceptional support and One-Off column in Transactions Editor"
```

---

### Task 7: Frontend Intelligence Page & Dashboard Callout Banner (`frontend/src/`)

**Files:**
- Modify: `frontend/src/pages/IntelligencePage.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Test: `npm run build` in `frontend/`

**Interfaces:**
- `IntelligencePage` renders:
  - Horizon selector pills (`2026`, `2025`, `2024`, `Last 6 Months`, `All Time`).
  - Spike & One-Off Candidates card with 1-click `Mark as One-Off` and `Keep Regular` buttons.
  - Spend Rescuer card with habit savings breakdown (e.g. Coffee, Takeaways) and Category Creep alerts.
- `DashboardPage` Exceptional Spend Banner includes "Inspect One-Offs" button routing to Transactions page.

- [ ] **Step 1: Build Spend Helper UI components in `frontend/src/pages/IntelligencePage.tsx`**
  - Add horizon state (`selectedHorizon`, defaulting to `"2026"`).
  - Add pill selector toolbar for horizons.
  - Add **Spike & One-Off Detector** card listing candidates with amounts, category, merchant, and reason badge.
  - Add **Monthly Spend Rescuer** card displaying lifestyle habit groupings, monthly average, and projected annual savings.
  - Add **Category Creep Alerts** section with warning badges.

- [ ] **Step 2: Update Exceptional Spend Banner in `frontend/src/pages/DashboardPage.tsx`**
  - Ensure the banner shows total one-offs excluded.
  - Wire up "Inspect One-Offs" button to call `onNavigateToTransactions` with `{ is_exceptional: true }`.

- [ ] **Step 3: Run Vite build and verify zero linter/compiler errors**

Run: `npm run build` in `frontend/`
Expected: Build succeeds cleanly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/IntelligencePage.tsx frontend/src/pages/DashboardPage.tsx
git commit -m "feat(ui): add spend rescuer, spike detector cards, horizon selector, and dashboard banner link"
```

---

### Task 8: Version Bump, Changelog, and Verification

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

- [ ] **Step 1: Bump version and add Changelog entry in `backend/changelog.py`**
  - Increment `APP_VERSION` to `0.8.0`.
  - Prepend release notes for v0.8.0 describing:
    - Transaction-level One-Off / Exceptional spend tagging.
    - Automated Spike & One-Off Detector with multi-year time horizon selector (2026, 2025, 2024).
    - Monthly Spend Rescuer habit highlights and category creep alerts.
    - Dashboard callout banner integration.
  - Update `version` in `frontend/package.json` to `0.8.0`.

- [ ] **Step 2: Run linter and tests**

Run:
- `./venv/bin/ruff check .`
- `./venv/bin/ruff format . --check`
- `./venv/bin/pytest`
- `npm run build` (in `frontend/`)
- `./venv/bin/pre-commit run --all-files`
Expected: All checks pass with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/changelog.py frontend/package.json
git commit -m "chore(release): bump version to 0.8.0 with Spend Rescuer changelog"
```

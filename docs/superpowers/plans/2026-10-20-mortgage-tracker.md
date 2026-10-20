# Mortgage Tracker & Overpayment Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Mortgage Tracker to the application featuring saved profile data (with automated fixed-term pre-population), an interactive overpayment simulator, a payoff trajectory comparison graph, an isolated overpayment ledger, and rebrand the app to UK Finance Tracker.

**Architecture:** Python backend module `backend/mortgage_utils.py` handles amortization and loan projections, integrated with `backend/storage.py` and exposed via FastAPI in `backend/main.py`. The frontend adds `frontend/src/pages/MortgagePage.tsx` using Tailwind CSS and Recharts, with client-side instant math in `frontend/src/utils/mortgageMath.ts` and top-level navigation in `TopNav.tsx`.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, React 18, TypeScript, Tailwind CSS, Recharts, Lucide React, Pytest, Ruff.

**Spec:** `docs/superpowers/specs/2026-10-20-mortgage-tracker-design.md`

## Global Constraints

- Never commit secrets, API keys, or credentials.
- Prevent errors that could overwrite or corrupt existing CSV or JSON files.
- Store mortgage data independently in `data/mortgage.json` (and `data/mortgage_joint.json`), completely isolated from `expense_database.csv`.
- Follow PEP 8 style guide for Python and existing TypeScript/Tailwind patterns for React.
- Run Ruff linter, Ruff formatter, and pytest after all backend changes.
- Update `backend/changelog.py` and `frontend/package.json` with the new version.

## Review Focus

1. **Zero / Nominal Interest Rate**: Handling 0% interest rate without dividing by zero in amortization formulas.
2. **Overpayment Exceeding Balance**: When lump-sum or high monthly overpayment exceeds the remaining balance before the full term ends.
3. **Past Deal Expiry Date**: When `deal_expiry_date` is in the past, showing an expired deal status rather than negative countdowns.
4. **Scope Isolation**: Guaranteeing Joint mortgage actions never overwrite or bleed into Personal mortgage data.
5. **JSON Storage Concurrency / Atomic Writes**: Ensuring saving profiles or logging overpayments uses atomic writes with file locks.

---

### Task 1: Backend Amortization & Mortgage Utility Engine

**Files:**
- Create: `backend/mortgage_utils.py`
- Test: `tests/test_mortgage_utils.py`

**Interfaces:**
- Produces:
  - `calculate_monthly_payment(principal: float, annual_rate_pct: float, term_months: int) -> float`
  - `generate_amortization_schedule(principal: float, annual_rate_pct: float, monthly_payment: float, max_months: int, monthly_overpayment: float = 0.0, lump_sum: float = 0.0) -> list[dict[str, Any]]`
  - `calculate_mortgage_summary(principal: float, annual_rate_pct: float, monthly_payment: float, term_months: int, monthly_overpayment: float = 0.0, lump_sum: float = 0.0) -> dict[str, Any]`
  - `calculate_annual_allowance(current_balance: float, allowance_pct: float = 10.0) -> float`

- [ ] **Step 1: Write the failing unit tests for mortgage math**

Create `tests/test_mortgage_utils.py` with tests for:
- Standard monthly repayment calculation (e.g. £200,000 at 4.0% over 25 years = 300 months -> £1,055.67).
- 0% interest rate repayment calculation ($200,000 / 300 = £666.67).
- Overpayment schedule projection verifying reduced term and positive interest savings.
- Overpayment exceeding balance terminating cleanly at £0 balance.
- 10% annual allowance calculation.

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_mortgage_utils.py -v`
Expected: FAIL with ModuleNotFoundError or ImportError for `backend.mortgage_utils`.

- [ ] **Step 3: Implement `backend/mortgage_utils.py`**

Implement amortization math, term reduction loops, interest aggregation, and allowance helper functions.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_mortgage_utils.py -v`
Expected: PASS with 100% assertions passing.

- [ ] **Step 5: Format & Lint**

Run: `./venv/bin/ruff check backend/mortgage_utils.py tests/test_mortgage_utils.py`
Expected: 0 errors.

---

### Task 2: Backend Scoped Storage for Mortgages

**Files:**
- Modify: `backend/storage.py`
- Test: `tests/test_mortgage_storage.py`

**Interfaces:**
- Consumes: `resolve_scope_paths`, `load_json_file`, `atomic_write_json`, `clean_string` from `backend/storage.py`.
- Produces:
  - `load_mortgage(scope: str) -> dict[str, Any]`
  - `save_mortgage(scope: str, data: dict[str, Any]) -> None`
  - `update_mortgage_profile(scope: str, profile: dict[str, Any]) -> dict[str, Any]`
  - `add_mortgage_overpayment(scope: str, overpayment: dict[str, Any]) -> dict[str, Any]`
  - `delete_mortgage_overpayment(scope: str, overpayment_id: str) -> bool`

- [ ] **Step 1: Write the failing unit tests for mortgage storage**

Create `tests/test_mortgage_storage.py` testing:
- Default empty mortgage structure when no file exists (`{"profile": None, "overpayments": []}`).
- Saving and loading mortgage profile with Personal and Joint scope isolation.
- Adding an overpayment generating a unique ID and decrementing `current_balance`.
- Deleting an overpayment restoring the balance.

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_mortgage_storage.py -v`
Expected: FAIL with AttributeError (`load_mortgage` not found in `backend.storage`).

- [ ] **Step 3: Implement mortgage storage functions in `backend/storage.py`**

Add `"mortgage"` key to `resolve_scope_paths` returning `mortgage.json` (or `mortgage_joint.json`).
Implement `load_mortgage`, `save_mortgage`, `update_mortgage_profile`, `add_mortgage_overpayment`, and `delete_mortgage_overpayment`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_mortgage_storage.py -v`
Expected: PASS.

- [ ] **Step 5: Format & Lint**

Run: `./venv/bin/ruff check backend/storage.py tests/test_mortgage_storage.py`
Expected: 0 errors.

---

### Task 3: Backend API Endpoints in FastAPI

**Files:**
- Modify: `backend/main.py`
- Test: `tests/test_mortgage_api.py`

**Interfaces:**
- Consumes: `load_mortgage`, `save_mortgage`, `update_mortgage_profile`, `add_mortgage_overpayment`, `delete_mortgage_overpayment` from `backend.storage`, and calculation functions from `backend.mortgage_utils`.
- Produces:
  - `GET /api/mortgage`
  - `POST /api/mortgage/profile`
  - `POST /api/mortgage/overpayments`
  - `DELETE /api/mortgage/overpayments/{id}`
  - `POST /api/mortgage/calculate`

- [ ] **Step 1: Write failing API route tests**

Create `tests/test_mortgage_api.py` using `TestClient` from FastAPI to test:
- `GET /api/mortgage` returns default profile payload when authenticated.
- `POST /api/mortgage/profile` saves profile and validates required fields.
- `POST /api/mortgage/overpayments` adds an entry and returns updated balance.
- `DELETE /api/mortgage/overpayments/{id}` removes an entry.
- `POST /api/mortgage/calculate` returns simulated baseline vs overpayment comparison.
- Unauthenticated requests return 401 Unauthorized.

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_mortgage_api.py -v`
Expected: FAIL with 404 Not Found.

- [ ] **Step 3: Implement mortgage endpoints in `backend/main.py`**

Define Pydantic models: `MortgageProfileRequest`, `MortgageOverpaymentRequest`, `MortgageCalculationRequest`.
Add endpoints under `/api/mortgage` with auth checks and scope normalization.

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_mortgage_api.py -v`
Expected: PASS.

- [ ] **Step 5: Format & Lint**

Run: `./venv/bin/ruff check backend/main.py tests/test_mortgage_api.py`
Expected: 0 errors.

---

### Task 4: Frontend Types, API Client, and Math Utility

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/utils/mortgageMath.ts`

**Interfaces:**
- Produces:
  - Types: `MortgageProfile`, `MortgageOverpayment`, `MortgageDataResponse`, `MortgageCalculationResult`.
  - API methods: `api.getMortgage()`, `api.saveMortgageProfile()`, `api.addMortgageOverpayment()`, `api.deleteMortgageOverpayment()`, `api.calculateMortgage()`.
  - Math helpers in `mortgageMath.ts`: `computeMortgageSchedule()` for instant zero-latency slider calculations.

- [ ] **Step 1: Add Mortgage types in `frontend/src/types.ts`**

Add `mortgage` to `NavPage` union: `export type NavPage = 'dashboard' | 'transactions' | 'intelligence' | 'wealth' | 'settings' | 'mortgage';`
Define `MortgageProfile`, `MortgageOverpayment`, and simulation result structures.

- [ ] **Step 2: Add API methods in `frontend/src/api.ts`**

Add `getMortgage`, `saveMortgageProfile`, `addMortgageOverpayment`, `deleteMortgageOverpayment`, and `calculateMortgage`.

- [ ] **Step 3: Implement client-side math utility `frontend/src/utils/mortgageMath.ts`**

Implement formula and schedule simulation loop mirroring backend logic for high-performance slider dragging.

- [ ] **Step 4: Typecheck frontend**

Run: `npm --prefix frontend run build`
Expected: Successful compile or zero TypeScript errors in modified files.

---

### Task 5: Frontend UI — Mortgage Tracker Page & Components

**Files:**
- Create: `frontend/src/pages/MortgagePage.tsx`
- Modify: `frontend/src/components/TopNav.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api`, `types`, `mortgageMath`, Lucide icons (`Home`, `Calculator`, `TrendingDown`, `Plus`, `Trash2`, `Calendar`, `ShieldCheck`), Recharts (`ResponsiveContainer`, `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ReferenceLine`).

- [ ] **Step 1: Create `MortgagePage.tsx`**

Build:
1. **Header & Profile Summary Card**: Current balance, interest rate, monthly payment, remaining term, fixed deal countdown pill, and "Edit Details" button.
2. **Profile Edit Modal**: Form to set original balance, current balance, interest rate, monthly payment, remaining term (years/months), fixed rate expiry date, and mortgage type ("Fixed Rate").
3. **Interactive Overpayment Simulator**:
   - Monthly slider (£0 to £1,000/mo) + custom input.
   - Lump sum input (£0 to £50,000).
   - Dynamic KPIs: Years & months shaved off, total interest saved, projected mortgage-free date.
4. **Trajectory Comparison Graph**:
   - Recharts dual-line chart comparing Standard Plan (Blue) vs Accelerated Plan (Green).
   - Vertical ReferenceLine at the fixed-rate deal expiry date.
   - Rich tooltip comparing projected balances at each future year.
5. **10% Annual Allowance Indicator**:
   - Shows penalty-free limit and progress bar of current calendar year overpayments.
6. **Logged Overpayments Table**:
   - Date, Type badge (Monthly / Lump Sum), Amount, Notes, and Delete button.
   - "+ Log Overpayment" modal dialog.

- [ ] **Step 2: Update `TopNav.tsx` and Navigation**

- Add `Mortgage` navigation tab with `Home` icon.
- Rebrand header title from "UK Expense Tracker" to "UK Finance Tracker".

- [ ] **Step 3: Integrate into `App.tsx`**

- Render `<MortgagePage scope={scope} />` when `activePage === 'mortgage'`.

- [ ] **Step 4: Build & Validate Frontend**

Run: `npm --prefix frontend run build`
Expected: Build passes with no TypeScript or bundling errors.

---

### Task 6: Rebranding, App Titles, Version Bump & Changelog

**Files:**
- Modify: `frontend/index.html`
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

- [ ] **Step 1: Update app title in `frontend/index.html`**

Update title tag from `UK Expense Tracker` to `UK Finance Tracker`.

- [ ] **Step 2: Bump version and add Changelog entry in `backend/changelog.py`**

Bump `APP_VERSION` from `0.6.6` to `0.7.0`.
Prepend entry for `0.7.0` detailing:
- Added dedicated Mortgage Tracker with profile storage and deal expiry countdown.
- Added interactive Overpayment Calculator with payoff trajectory graph.
- Added standalone overpayment history ledger.
- Rebranded application to UK Finance Tracker.

- [ ] **Step 3: Sync version in `frontend/package.json`**

Update `"version": "0.7.0"` in `frontend/package.json`.

---

### Task 7: Full Verification & Quality Assurance

**Files:**
- Test suite: `tests/`
- Frontend build: `frontend/dist`

- [ ] **Step 1: Run complete backend test suite**

Run: `./venv/bin/pytest`
Expected: 100% test pass rate across all existing and new tests.

- [ ] **Step 2: Run linter and formatter**

Run: `./venv/bin/ruff check .`
Run: `./venv/bin/ruff format --check .`
Expected: Clean with zero violations.

- [ ] **Step 3: Run frontend production build**

Run: `npm --prefix frontend run build`
Expected: Build passes cleanly.

- [ ] **Step 4: Run pre-commit checks**

Run: `./venv/bin/pre-commit run --all-files`
Expected: All pre-commit hooks pass.

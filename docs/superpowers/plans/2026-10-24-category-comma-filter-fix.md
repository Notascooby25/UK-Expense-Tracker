# Category Comma Filter Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix transaction filtering, CSV export, and dashboard analytics when categories contain commas (e.g. "Coffee, Drink & Snacks").

**Architecture:** Update query parameter serialization in `frontend/src/api.ts` to append list parameters individually (`q.append('categories', cat)`) instead of joining with commas (`.join(',')`). Update `backend/main.py` to parse repeated `categories` (as well as `months`, `include_categories`, and `exclude_categories`) while intelligently preserving master category names that contain commas, with fallback for legacy comma-separated requests.

**Tech Stack:** Python (FastAPI, Pandas, Pytest), TypeScript (React, Vite).

## Global Constraints

- Follow PEP 8 for Python code and existing formatting for TypeScript.
- All existing tests in `pytest` must continue to pass (including legacy `categories=Bills,Groceries`).
- Linters and pre-commit checks (`ruff check`, `ruff format`, `pytest`, `pre-commit run --all-files`) must pass with zero errors.
- Version bump from `0.7.6` to `0.7.7` in `backend/changelog.py` and `frontend/package.json`.

## Review Focus

- Categories containing commas like `"Coffee, Drink & Snacks"` must match transactions in `/api/transactions` and `/api/transactions/export`.
- Multi-category filtering combining a category with commas and a category without commas (e.g. `"Coffee, Drink & Snacks"` and `"Bills"`) must return transactions for both.
- Legacy comma-separated queries without commas in names (e.g. `categories=Bills,Groceries`) must continue to work for backwards compatibility.
- Dashboard analytics and drilldown with `include_categories` and `exclude_categories` containing commas must work without splitting.
- Empty or missing category parameters must not filter out all transactions.

---

### Task 1: Backend Category Parsing & Tests

**Files:**
- Modify: `backend/main.py:440-520` and `backend/main.py:380-438`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- Produces: `_parse_category_param(raw: list[str] | str | None, master: set[str] | None) -> list[str]`
- Produces: `_parse_list_param(raw: list[str] | str | None) -> list[str]`

- [ ] **Step 1: Write failing test in `tests/test_backend_api.py`**
Add a test `test_transactions_filter_category_with_commas` verifying `/api/transactions` and `/api/transactions/export` return transactions when filtered by `"Coffee, Drink & Snacks"`.

- [ ] **Step 2: Run test to verify it fails**
Run: `./venv/bin/pytest tests/test_backend_api.py -k test_transactions_filter_category_with_commas -v`
Expected: FAIL (total == 0 instead of matching transaction).

- [ ] **Step 3: Implement category parsing helpers and endpoint query parameter updates in `backend/main.py`**
Implement `_parse_category_param` and `_parse_list_param`. Update `/api/transactions`, `/api/transactions/export`, `/api/dashboard`, and `/api/dashboard/drilldown` to receive `list[str] = Query(default=[])` and parse them safely against master categories.

- [ ] **Step 4: Run test to verify it passes**
Run: `./venv/bin/pytest tests/test_backend_api.py -k test_transactions_filter_category_with_commas -v`
Expected: PASS

- [ ] **Step 5: Run full pytest suite**
Run: `./venv/bin/pytest`
Expected: All tests pass.

---

### Task 2: Frontend API Serialization

**Files:**
- Modify: `frontend/src/api.ts:80-205`

**Interfaces:**
- Updates: `getTransactions`, `getExportUrl`, `getDashboardData`, `getCategoryDrilldown` to use `q.append(...)` for array fields instead of `.join(',')`.

- [ ] **Step 1: Update `frontend/src/api.ts`**
Change `getTransactions`, `getExportUrl`, `getDashboardData`, and `getCategoryDrilldown` to append each element of `categories`, `months`, `include_categories`, and `exclude_categories` to `URLSearchParams`.

- [ ] **Step 2: Build frontend to verify TypeScript compilation**
Run: `cd frontend && npm run build`
Expected: Build succeeds with 0 errors.

---

### Task 3: Version Bump, Verification, Review & Deployment

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

- [ ] **Step 1: Bump `APP_VERSION` to `0.7.7` and add changelog entry**
Prepend v0.7.7 release note in `backend/changelog.py` and set `"version": "0.7.7"` in `frontend/package.json`.

- [ ] **Step 2: Run linters, formatters, and pre-commit**
Run:
- `./venv/bin/ruff format .`
- `./venv/bin/ruff check .`
- `./venv/bin/pytest`
- `./venv/bin/pre-commit run --all-files`
- `cd frontend && npm run build`

- [ ] **Step 3: Differential review and commit**
Perform differential security review, commit, and push to trigger GitHub Actions build.

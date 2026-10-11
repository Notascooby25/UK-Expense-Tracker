# Dashboard Session Filter Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Dashboard defaulting to the current month on initial app load while remembering any filter or category inspection changes across page navigations during the active browser session.

**Architecture:**
- Store Dashboard filter state (`timeMode`, `selectedPeriod`, `selectedMonths`, `bank`, `hideInternal`, `netSpendMode`, `ignoreLegacy`, `excludeExceptional`, `includeCategories`, `excludeCategories`, `inspectCategory`) in `sessionStorage` keyed by account scope (`uk_expense_dashboard_state_${scope}`).
- Pass `key={scope}` to `<DashboardPage />` in `frontend/src/App.tsx` so each scope maintains independent session state.
- Bump version to `0.6.1` in `backend/changelog.py`, `frontend/package.json`, and `tests/test_backend_api.py`.

**Tech Stack:** React 18, TypeScript, FastAPI, Pytest.

---

### Task 1: Persist Dashboard Filter State in `sessionStorage` (`DashboardPage.tsx` & `App.tsx`)

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add `sessionStorage` loader and sync effect in `frontend/src/pages/DashboardPage.tsx`**
  - Create helper `loadSavedDashboardState(scope, currentYear, currentMonthName)` that reads `sessionStorage.getItem(\`uk_expense_dashboard_state_\${scope}\`)` and falls back to the current-month defaults when no session state exists yet.
  - Initialize the Dashboard filter `useState` hooks from this helper.
  - Save the current filter state and `inspectCategory` to `sessionStorage` whenever they change.
  - Ensure `handleResetFilters` also resets `excludeExceptional` to `true` and updates `sessionStorage`.

- [ ] **Step 2: Add `key={scope}` to `<DashboardPage />` in `frontend/src/App.tsx`**
  - Ensure switching between `Personal` and `Joint` cleanly mounts the target scope's saved session state.

---

### Task 2: Bump Version to `v0.6.1` & Update Changelog (`backend/changelog.py`, `frontend/package.json`, `tests/test_backend_api.py`)

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`
- Modify: `tests/test_backend_api.py`

- [ ] **Step 1: Bump `APP_VERSION` to `"0.6.1"` and add `0.6.1` entry to `CHANGELOG` in `backend/changelog.py`**
- [ ] **Step 2: Bump `"version"` to `"0.6.1"` in `frontend/package.json` and `frontend/src/App.tsx` fallback**
- [ ] **Step 3: Update `test_version_and_changelog_exposed_in_auth_and_bootstrap` in `tests/test_backend_api.py`**
- [ ] **Step 4: Run `npm --prefix frontend run build`, Impeccable detector, Ruff, Pytest, Pre-commit, and Differential Review**

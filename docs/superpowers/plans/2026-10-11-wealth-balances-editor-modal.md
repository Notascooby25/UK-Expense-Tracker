# Wealth Balances & Accounts Editor Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an **Edit History** button and scrollable popup modal on the Wealth page so the user can view, edit, and delete recorded monthly balance snapshots or remove/rename mistyped accounts.

**Architecture:**
- Add backend endpoints in `backend/main.py` to delete a month snapshot (`DELETE /api/wealth/balances/{month}`), delete or rename an account across all months (`POST /api/wealth/accounts`), and clean up empty month dicts in `POST /api/wealth/balances`.
- Add client methods in `frontend/src/api.ts`.
- Add the **Edit History** button, scrollable popup modal, and per-row remove buttons in `frontend/src/pages/WealthPage.tsx`.
- Bump version to `0.6.2` in `backend/changelog.py` and `frontend/package.json`.

**Tech Stack:** Python 3.12, FastAPI, Pytest, React 18, TypeScript, Tailwind CSS.

---

### Task 1: Backend Wealth Delete & Account Management Endpoints (`backend/main.py` & `tests/test_backend_api.py`)

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_backend_api.py`

- [ ] **Step 1: Write failing backend tests in `tests/test_backend_api.py`**
  Test deleting a specific month snapshot (`DELETE /api/wealth/balances/2026-02`) and deleting/renaming an account across months (`POST /api/wealth/accounts`).

- [ ] **Step 2: Implement endpoints in `backend/main.py`**
  - Update `POST /api/wealth/balances` so saving an empty `cleaned_balances` removes `month_str` from `assets_data`.
  - Add `DELETE /api/wealth/balances/{month}` to delete `month` from `assets_data` and return updated `build_wealth_data`.
  - Add `POST /api/wealth/accounts` (`action: "delete" | "rename"`, `account: str`, `new_name?: str`) to remove or rename an account across all months in `assets_data`.

- [ ] **Step 3: Run `./venv/bin/pytest tests/test_backend_api.py`**
  Verify all backend tests pass.

---

### Task 2: Frontend Wealth Edit History Modal (`frontend/src/api.ts` & `frontend/src/pages/WealthPage.tsx`)

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/pages/WealthPage.tsx`

- [ ] **Step 1: Add `deleteWealthMonth` and `manageWealthAccount` to `frontend/src/api.ts`**
- [ ] **Step 2: Add the "Edit History" button and scrollable popup modal in `frontend/src/pages/WealthPage.tsx`**
  - Show a scrollable list of all recorded months (`YYYY-MM`, newest first) where the user can edit any balance, remove an account from that month, save changes for that month, or click **Delete Month** to remove the entire month snapshot.
  - Include a **Tracked Accounts** section in the modal (and a delete icon next to each account row in the logger) so the user can delete or rename an account across all months with one click.

---

### Task 3: Version Bump (`v0.6.2`), Quality Gates & Differential Review

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`
- Modify: `frontend/src/App.tsx`
- Modify: `tests/test_backend_api.py`

- [ ] **Step 1: Bump `APP_VERSION` to `"0.6.2"` and prepend `0.6.2` changelog entry**
- [ ] **Step 2: Run `npm --prefix frontend run build`, Impeccable detector, Ruff, Pytest, Pre-commit, and Differential Review**

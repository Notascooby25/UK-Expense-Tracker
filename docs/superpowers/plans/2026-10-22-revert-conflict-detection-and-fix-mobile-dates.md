# Revert Sync Conflict Detection & Fix Mobile Date Clipping Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revert the intrusive sync category conflict resolution to restore rock-solid, silent imports (preserving existing categories without difference popups), and fix the date column clipping to '202' on mobile/minimized windows.

**Architecture:**
1. In `backend/storage.py`, `parse_and_merge_import` will treat existing transactions in `existing_df` as the source of truth. When a transaction matches an existing row with a category, it is preserved silently without generating conflicts.
2. In `frontend/src/pages/TransactionsPage.tsx`, enforce `min-w-[110px]` and `whitespace-nowrap` on the Date column header and cells so narrow viewports never compress the date.
3. Bump version to `0.7.4` in `backend/changelog.py` and `frontend/package.json`.

**Tech Stack:** Python (FastAPI, Pandas, Pytest), React (TypeScript, Tailwind CSS, Vite).

---

### Task 1: Revert Conflict Detection in Backend Import Engine
**Files:**
- Modify: `backend/storage.py`
- Test: `tests/test_backend_storage.py`

- [ ] **Step 1: Write/update tests for silent category preservation**
Verify that importing a transaction with a different category than existing silently retains the existing category and generates zero conflicts.
- [ ] **Step 2: Run tests to see expected failure**
Run: `./venv/bin/pytest tests/test_backend_storage.py -k "conflict"`
- [ ] **Step 3: Update `parse_and_merge_import` in `backend/storage.py`**
Remove `conflicts_list.append(...)` when `old_cat != ""`. Existing categories are left untouched.
- [ ] **Step 4: Run tests to verify they pass**
Run: `./venv/bin/pytest tests/test_backend_storage.py -k "conflict"`

---

### Task 2: Fix Date Column Compression on Mobile in `TransactionsPage.tsx`
**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`

- [ ] **Step 1: Enforce minimum width and nowrap on Date column**
In `TransactionsPage.tsx`, add `min-w-[110px] whitespace-nowrap` to `<th className="... w-28 ...">Date</th>` and `<td className="... min-w-[110px] whitespace-nowrap">`.
- [ ] **Step 2: Verify frontend build**
Run: `npm --prefix frontend run build`

---

### Task 3: Clean up Sync Modal UI & Version Bump
**Files:**
- Modify: `frontend/src/components/AddSyncModal.tsx`
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

- [ ] **Step 1: Clean up AddSyncModal.tsx**
Ensure no empty/broken conflict UI appears.
- [ ] **Step 2: Bump version to 0.7.4**
In `backend/changelog.py` and `frontend/package.json`.
- [ ] **Step 3: Run full verification suite**
Run: `./venv/bin/pytest`, `./venv/bin/ruff check .`, `./venv/bin/ruff format --check .`, `npm --prefix frontend run build`.

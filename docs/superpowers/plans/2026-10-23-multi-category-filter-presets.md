# Multi-Category Filter Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to filter by multiple categories simultaneously on the Transactions page, save multiple selected categories inside filter presets, and automatically restore those category selections when loading presets (e.g. for self-assessment tax returns).

**Architecture:** Upgrade the single `<select>` Category filter on the Transactions page to a multi-select checkbox dropdown with search and quick actions. Connect the multi-category state to the existing `categories` query parameter in the backend API and CSV export, and persist the array of selected categories (`cats`) in `FilterPreset` when saving or loading presets.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, FastAPI (Python 3.14), Pandas, Pytest.

**Spec:** In-conversation spec approved by user: multi-select category dropdown on Transactions page, preset saving and loading of multiple categories aligned with financial years for tax returns, and backward compatibility with existing single-category presets.

## Global Constraints

- Never commit local data files (`data/expense_database.csv`, `data/settings.json`, `data/saved_filters.json`).
- Run `./venv/bin/ruff check .`, `./venv/bin/ruff format .`, and `./venv/bin/pytest` after changes.
- Ensure `npm run build` succeeds in `frontend/` without TypeScript or bundle errors.
- Version bump: Increment `APP_VERSION` in `backend/changelog.py` and `version` in `frontend/package.json`.
- Do not remove or alter existing filter behaviors (merchant search, bank, financial year, dates, months, transaction type).

## Review Focus

1. **Empty category selection behavior:** When no categories are checked (`selectedCategories = []`), the system must treat this as "All Categories" (unfiltered by category) instead of returning 0 transactions.
2. **Backward compatibility with single-category presets:** Older saved presets with `cats: ["Groceries"]` or `cats: []` must load correctly into the new multi-select state without runtime exceptions.
3. **Preset switching resets row pagination and selection:** Switching between presets must reset `currentPage` to 1 and clear row selections (`selectedIds`), preventing out-of-range pagination errors.
4. **CSV Export synchronization:** Exporting CSV while multiple categories are selected must include only transactions matching the chosen categories.
5. **Dashboard drill-down compatibility:** Navigating from Dashboard drill-down to Transactions with an initial category filter must properly populate `selectedCategories` with that single category.

---

### Task 1: Add Backend Tests for Multi-Category Filtering and Preset Persistence

**Files:**
- Modify: `tests/test_backend_api.py:399-425`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- Consumes: `/api/transactions?categories=...`, `/api/transactions/export?categories=...`, `/api/filters` (PUT and GET).
- Produces: Test suite validating that comma-separated `categories` queries accurately filter transactions, CSV exports, and roundtrip via `/api/filters`.

- [ ] **Step 1: Write tests for multi-category query and preset roundtrip in `tests/test_backend_api.py`**

Add `test_transactions_multi_category_filter_and_preset_persistence` verifying:
1. Querying `/api/transactions?scope=Personal&categories=Bills,Subscriptions` returns only transactions matching either of those categories.
2. Querying `/api/transactions/export?scope=Personal&categories=Bills,Subscriptions` produces a CSV containing rows only for those categories.
3. Saving a preset with `cats: ["Bills", "Subscriptions", "Software"]` via `PUT /api/filters` persists and returns the preset correctly.

- [ ] **Step 2: Run pytest to verify the tests pass against current backend logic**

Run: `./venv/bin/pytest tests/test_backend_api.py -k test_transactions_multi_category -v`
Expected: PASS (since backend `_filter_transactions_df` and `/api/filters` already support `categories` and `cats`).

- [ ] **Step 3: Commit backend test additions**

```bash
git add tests/test_backend_api.py
git commit -m "test: add verification for multi-category transaction filtering and preset persistence"
```

---

### Task 2: Implement Multi-Select Category Dropdown & Preset Integration on Transactions Page

**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`
- Test: `frontend/` (`npm run build`)

**Interfaces:**
- Consumes: `masterCategories: string[]`, `savedFilters: Record<string, FilterPreset>`, `api.getTransactions`, `api.getExportUrl`, `api.updateFilterPresets`.
- Produces: Multi-select category filter UI, `selectedCategories: string[]` state, preset save/load with `cats: string[]`, and CSV export url integration.

- [ ] **Step 1: Update state and helpers in `TransactionsPage.tsx`**

1. Replace single-string `category` state with `selectedCategories: string[]`:
   - Initialize with `initialFilters?.category && initialFilters.category !== 'All' ? [initialFilters.category] : []`.
2. Add dropdown popover state:
   - `categoryDropdownOpen: boolean`
   - `categorySearchQuery: string`
   - `categoryDropdownRef: React.RefObject<HTMLDivElement>` with outside-click listener.
3. Add helper handlers:
   - `toggleCategory(cat: string)`
   - `selectAllCategories()`
   - `clearAllCategories()`
4. Update `initialFilters` effect:
   - If `initialFilters.category && initialFilters.category !== 'All'`, set `selectedCategories([initialFilters.category])`, else `selectedCategories([])`.
5. Update `handleResetFilters`:
   - Reset `selectedCategories([])`, `setCategorySearchQuery('')`, `setCategoryDropdownOpen(false)`.

- [ ] **Step 2: Update `loadTransactions` and `exportCsvUrl` to pass `categories: selectedCategories`**

1. In `loadTransactions`, pass `categories: selectedCategories` and `category: 'All'` into `api.getTransactions(...)`.
2. In `exportCsvUrl`, pass `categories: selectedCategories` and `category: 'All'` into `api.getExportUrl(...)`.
3. Update dependency arrays of `loadTransactions` and `exportCsvUrl` to depend on `selectedCategories`.

- [ ] **Step 3: Update `handleSavePreset` and `handleSelectPreset`**

1. In `handleSavePreset`:
   ```typescript
   cats: selectedCategories,
   ```
2. In `handleSelectPreset`:
   ```typescript
   if (p.cats && Array.isArray(p.cats)) {
     setSelectedCategories(p.cats);
   } else {
     setSelectedCategories([]);
   }
   ```
   Reset `currentPage` to 1 and clear `selectedIds`.

- [ ] **Step 4: Replace single `<select>` with custom searchable multi-select dropdown in `TransactionsPage.tsx`**

1. Replace the `<select>` in the Category filter section with:
   - A trigger button showing:
     - "All Categories" if `selectedCategories.length === 0`
     - The category name if `selectedCategories.length === 1`
     - `${selectedCategories.length} categories selected` with a badge if `> 1`
     - Clear ("x") button when categories are selected to quickly reset to All
     - Chevron indicator (`ChevronDown`)
   - An absolute dropdown menu when open:
     - Search input field to filter category list
     - Quick action buttons: "Select All" and "Clear All"
     - Scrollable list of categories with checkboxes
     - Inclusion of any selected categories that might not be in `masterCategories` (custom/preset categories).

- [ ] **Step 5: Verify frontend compiles cleanly**

Run: `npm run build` in `frontend/`
Expected: Build passes with 0 errors.

- [ ] **Step 6: Commit frontend multi-category filter changes**

```bash
git add frontend/src/pages/TransactionsPage.tsx
git commit -m "feat: add multi-category filter and preset save/load to transactions page"
```

---

### Task 3: Bump Version, Update Changelog, and Verify End-to-End

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`
- Test: Full verification suite (`ruff`, `pytest`, `npm run build`, `pre-commit`)

**Interfaces:**
- Consumes: Release notes for multi-category filter preset support.
- Produces: Synchronized app version `0.7.6` and changelog entry.

- [ ] **Step 1: Bump version and add changelog entry**

1. Update `APP_VERSION = "0.7.6"` in `backend/changelog.py` and prepend changelog entry:
   - Version: `0.7.6`
   - Highlights: Multi-category filter presets on the Transactions page for tax returns and multi-category expense analysis.
2. Update `"version": "0.7.6"` in `frontend/package.json`.

- [ ] **Step 2: Run linter, formatter, tests, and build**

Run:
```bash
./venv/bin/ruff check .
./venv/bin/ruff format .
./venv/bin/pytest
npm --prefix frontend run build
./venv/bin/pre-commit run --all-files
```
Expected: All checks PASS with 0 errors.

- [ ] **Step 3: Commit version update**

```bash
git add backend/changelog.py frontend/package.json
git commit -m "chore: bump version to 0.7.6 and update changelog for multi-category presets"
```

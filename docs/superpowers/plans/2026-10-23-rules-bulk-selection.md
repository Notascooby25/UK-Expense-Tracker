# Auto-Rules Bulk Selection & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bulk selection checkboxes, master "Select All", Shift+Click range selection, and bulk deletion with safety confirmation to the Auto-Categorisation Rules table in Settings.

**Architecture:**
1. In `frontend/src/pages/SettingsPage.tsx`, introduce React state for `selectedRuleIndices: Set<number>` and `lastClickedIndex: number | null`.
2. Add range-selection logic to handle Shift+Click across rows, standard toggle on normal click, and master Select All in the table header.
3. Render an action toolbar above the table when 1 or more rules are selected, providing selected count, "Deselect All", and a red "Delete Selected" button that prompts for user confirmation before calling `persistSettings`.
4. Bump version to `0.7.5` in `backend/changelog.py` and `frontend/package.json`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, Vite, FastAPI (backend).

---

### Task 1: Implement Bulk Selection and Deletion in `SettingsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Details:**
- **State:**
  - `const [selectedRuleIndices, setSelectedRuleIndices] = useState<Set<number>>(new Set());`
  - `const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);`
- **Selection Handlers:**
  - `handleToggleRule(index: number, shiftKey: boolean)`:
    - If `shiftKey && lastClickedIndex !== null`: select/deselect the inclusive range between `lastClickedIndex` and `index`.
    - Otherwise toggle the index in `selectedRuleIndices`.
    - Set `lastClickedIndex = index`.
  - `handleSelectAllRules(checked: boolean)`:
    - If `checked`, populate set with all indices `0` to `rules.length - 1`.
    - If `false`, clear set.
  - `handleDeselectAllRules()`:
    - Clear set and reset `lastClickedIndex = null`.
- **Bulk Deletion Handler:**
  - `handleBulkDeleteRules()`:
    - Check if `selectedRuleIndices.size === 0` -> return.
    - Confirm with `window.confirm(\`Are you sure you want to delete ${selectedRuleIndices.size} selected rule(s)? This cannot be undone.\`)`.
    - Filter rules: `const updatedRules = rules.filter((_, idx) => !selectedRuleIndices.has(idx));`
    - Update state: `setRules(updatedRules); setSelectedRuleIndices(new Set()); setLastClickedIndex(null);`
    - Call `await persistSettings({ auto_rules: updatedRules });`
    - Display confirmation status: `triggerSaveStatus(\`${count} rules removed\`);`
- **UI Elements:**
  - Action toolbar above table when `selectedRuleIndices.size > 0`:
    - Shows badge: `<span className="px-2.5 py-0.5 rounded-full bg-cyan-900/60 border border-cyan-700/60 text-cyan-200 text-xs font-semibold">{selectedRuleIndices.size} selected</span>`
    - Deselect All button: `<button type="button" onClick={handleDeselectAllRules} className="...">Deselect All</button>`
    - Delete Selected button: `<button type="button" onClick={handleBulkDeleteRules} className="... bg-red-600 hover:bg-red-500 text-white ..."><Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedRuleIndices.size})</button>`
  - Checkbox in table header with indeterminate support (`ref={(el) => { if (el) el.indeterminate = ...; }}`).
  - Checkbox in each table row with `onClick={(e) => handleToggleRule(idx, e.shiftKey)}`.
  - Row highlight: `selectedRuleIndices.has(idx) ? 'bg-cyan-950/25 dark:bg-cyan-950/35' : ''`.
  - Update empty state `colSpan` from 7 to 8.

- [ ] **Step 1: Update `SettingsPage.tsx` with bulk selection and deletion**
- [ ] **Step 2: Verify frontend builds with zero TypeScript errors**
Run: `npm --prefix frontend run build`

---

### Task 2: Bump Version, Update Changelog, and Verify Full Suite

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

**Details:**
- Bump version to `0.7.5`.
- Prepend release notes for `0.7.5` in `CHANGELOG` (`backend/changelog.py`):
  - "Bulk Selection & Deletion for Auto-Rules: Added multi-select checkboxes, Select All, and Shift+Click range selection to the Auto-Categorisation Rules table in Settings for rapid cleanup."
- Run test suite, linters, formatters, and frontend build.

- [ ] **Step 1: Bump version to 0.7.5 in `backend/changelog.py` and `frontend/package.json`**
- [ ] **Step 2: Run backend tests and linters**
Run: `./venv/bin/pytest`
Run: `./venv/bin/ruff check .`
Run: `./venv/bin/ruff format --check .`
- [ ] **Step 3: Run frontend build**
Run: `npm --prefix frontend run build`

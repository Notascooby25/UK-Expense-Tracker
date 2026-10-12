# Category Conflict Protection on Monzo Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Monzo sync and bank imports from silently overwriting user-edited categories on existing transactions, and provide a user review interface to either keep app categories or apply incoming Monzo categories.

**Architecture:** Update `parse_and_merge_import` in `backend/storage.py` to preserve existing non-empty categories by default and return detected category differences as conflicts. Expose a new `POST /api/sync/resolve-conflicts` endpoint in `backend/main.py` for atomic batch resolution. Enhance `AddSyncModal.tsx` in React to display a Conflict Review section with per-row and bulk "Keep All in App" / "Update All to Monzo" actions.

**Tech Stack:** FastAPI, Pandas, Pytest, React 18, TypeScript, Tailwind CSS

**Spec:** Chat consultation on 2026-10-12 (conflict detection on sync with safe default of keeping app changes and user prompt for resolution)

## Global Constraints

- Preserve PEP 8 and Ruff formatting on Python backend files (`./venv/bin/ruff check .`, `./venv/bin/ruff format .`).
- Preserve TypeScript strict typing in `frontend/src/` (`npm --prefix frontend run build`).
- Never modify runtime data files in `data/`.
- Bump `APP_VERSION` and update `CHANGELOG` in `backend/changelog.py` and `frontend/package.json` per `GEMINI.md`.

## Review Focus

- Empty/blank category in existing database row (`old_cat == ""`): incoming non-empty category should populate the blank field without flagging as a conflict.
- Conflict detection with multiple matching rows: matched index tracking must ensure one-to-one matching between incoming rows and existing database rows without duplicate conflict emissions.
- Safe default preservation: if the user ignores or closes the modal without resolving conflicts, the database must already retain the user's existing app categories (no data loss).
- Bulk "Update All to Monzo": must execute atomically in a single write pass on `expense_database.csv` rather than multiple serial writes.
- Streamlit fallback in `app.py`: ensure Streamlit sync also preserves existing non-empty categories rather than overwriting them.

---

### Task 1: Backend Conflict Detection in `backend/storage.py`

**Files:**
- Modify: `backend/storage.py:532-680`
- Modify: `app.py:725-735`
- Test: `tests/test_backend_storage.py`

**Interfaces:**
- Consumes: `existing_df: pd.DataFrame`, `raw_df: pd.DataFrame`, `rules: list[dict]`, `source_format: str`
- Produces: `parse_and_merge_import(...) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, list[dict[str, Any]]]`
  - `merged_df`: contains existing rows + new rows; existing rows with non-empty categories are NEVER overwritten
  - `new_rows_df`: newly added rows
  - `updated_rows_df`: rows where an empty existing category was filled
  - `conflicts_list`: list of dicts with keys `_row_id`, `Date`, `Date_Display`, `Name`, `Amount`, `current_category`, `incoming_category`

- [ ] **Step 1: Write failing test in `tests/test_backend_storage.py`**

```python
def test_parse_and_merge_preserves_existing_category_and_flags_conflict():
    existing = pd.DataFrame(
        [
            {
                "Date": pd.to_datetime("2026-05-13").normalize(),
                "Name": "Tesco Express",
                "Amount": 15.50,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",  # User modified in app
                "Notes": "",
                "Financial_Year": "2026-2027",
                "Is_Subscription": False,
            }
        ]
    )
    incoming_raw = pd.DataFrame(
        [
            {
                "Date": "13/05/2026",
                "Name": "Tesco Express",
                "Amount": "-15.50",
                "Category": "Shopping",  # Default Monzo category
            }
        ]
    )
    merged, new_rows, updated_rows, conflicts = parse_and_merge_import(
        existing, incoming_raw, rules=[], source_format="Monzo"
    )
    # Existing category Groceries MUST be preserved in merged_df
    assert merged.loc[0, "Category"] == "Groceries"
    assert new_rows.empty
    assert len(conflicts) == 1
    assert conflicts[0]["_row_id"] == 0
    assert conflicts[0]["current_category"] == "Groceries"
    assert conflicts[0]["incoming_category"] == "Shopping"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_storage.py -k test_parse_and_merge_preserves_existing_category_and_flags_conflict`
Expected: FAIL (too many values to unpack or category overwritten)

- [ ] **Step 3: Implement conflict preservation in `backend/storage.py` and `app.py`**

In `backend/storage.py`:
- In `parse_and_merge_import`:
  - Initialize `conflicts_list: list[dict[str, Any]] = []`
  - In loop over `new_df`:
    ```python
    if matches:
        idx = matches[0]
        matched_indexes.add(idx)
        old_cat = clean_string(merged_df.loc[idx, "Category"])
        new_cat = clean_string(row["Category"])
        if old_cat == "" and new_cat != "":
            merged_df.loc[idx, "Category"] = new_cat
            updated_list.append(row[COLS])
        elif old_cat != "" and new_cat != "" and old_cat != new_cat:
            conflicts_list.append(
                {
                    "_row_id": int(idx),
                    "Date": str(pd.to_datetime(merged_df.loc[idx, "Date"]).strftime("%Y-%m-%d")),
                    "Date_Display": str(
                        pd.to_datetime(merged_df.loc[idx, "Date"]).strftime("%d/%m/%Y")
                    ),
                    "Name": str(merged_df.loc[idx, "Name"]),
                    "Amount": float(merged_df.loc[idx, "Amount"]),
                    "current_category": old_cat,
                    "incoming_category": new_cat,
                }
            )
    ```
  - Return `(merged_df.reset_index(drop=True), new_rows_df.reset_index(drop=True), updated_rows_df.reset_index(drop=True), conflicts_list)`
- In `app.py`:
  - When updating matches, only set `st.session_state.df.loc[idx, "Category"] = row["Category"]` if `old_cat == ""`.

- [ ] **Step 4: Update existing tests in `tests/test_backend_storage.py` to unpack the 4-tuple and verify all tests pass**

Run: `./venv/bin/pytest tests/test_backend_storage.py`
Expected: PASS

---

### Task 2: Backend API Endpoints in `backend/main.py`

**Files:**
- Modify: `backend/main.py`
- Test: `tests/test_backend_api.py`

**Interfaces:**
- Consumes: `parse_and_merge_import` returning 4-tuple
- Produces:
  - Updated responses for `/api/sync/gsheets`, `/api/sync/import-file`, `/api/sync/import-paste` containing `"conflicts": conflicts_list`
  - New endpoint: `POST /api/sync/resolve-conflicts` taking `{ "resolutions": [{ "row_id": int, "category": str }] }`

- [ ] **Step 1: Write failing test in `tests/test_backend_api.py`**

```python
def test_resolve_sync_conflicts_endpoint(api_env):
    client = TestClient(app)
    client.post(
        "/api/auth/login", json={"username": "admin", "password": DUMMY_CRED, "remember_me": False}
    )

    # Resolve conflict for row 0
    resp = client.post(
        "/api/sync/resolve-conflicts?scope=Personal",
        json={"resolutions": [{"row_id": 0, "category": "Shopping"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["saved"] is True
    assert resp.json()["applied_count"] == 1

    # Verify transaction row 0 category was updated
    tx_resp = client.get("/api/transactions?scope=Personal")
    assert tx_resp.json()["rows"][0]["Category"] == "Shopping"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_api.py -k test_resolve_sync_conflicts_endpoint`
Expected: FAIL (404 or missing endpoint)

- [ ] **Step 3: Implement endpoints in `backend/main.py`**

- Unpack 4-tuple in `/api/sync/gsheets`, `/api/sync/import-file`, and `/api/sync/import-paste` and include `"conflicts": conflicts`.
- Define request models:
  ```python
  class ConflictResolutionItem(BaseModel):
      row_id: int
      category: str


  class ResolveConflictsRequest(BaseModel):
      resolutions: list[ConflictResolutionItem]
  ```
- Implement `POST /api/sync/resolve-conflicts`:
  Load transactions, validate row IDs, update `Category`, save transactions once atomically, return `{"saved": True, "applied_count": len(valid)}`.

- [ ] **Step 4: Run backend tests**

Run: `./venv/bin/pytest tests/test_backend_api.py`
Expected: PASS

---

### Task 3: Frontend API Client & Types

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Consumes: FastAPI endpoints
- Produces: `SyncConflict`, updated `SyncResponse`, `api.resolveSyncConflicts(scope, resolutions)`

- [ ] **Step 1: Add types to `frontend/src/types.ts`**

Define `SyncConflict` and extend `SyncResponse` with `conflicts?: SyncConflict[]`.

- [ ] **Step 2: Add API method to `frontend/src/api.ts`**

Add `resolveSyncConflicts(scope: AccountScope, resolutions: { row_id: number; category: string }[]): Promise<{ saved: boolean; applied_count: number }>` to `api`.

- [ ] **Step 3: Run TypeScript compiler check**

Run: `npm --prefix frontend run build`
Expected: PASS

---

### Task 4: Frontend Conflict Review UI in `AddSyncModal.tsx`

**Files:**
- Modify: `frontend/src/components/AddSyncModal.tsx`

**Interfaces:**
- Consumes: `conflicts` from `SyncResponse`
- Produces:
  - Visual Conflict Review section with clear comparison: Current App Category vs Incoming Monzo Category
  - Per-row "Keep Mine" / "Use Monzo" action buttons
  - Bulk "Keep All in App" / "Update All to Monzo" action buttons
  - Safe default behavior: app categories remain preserved if modal is closed

- [ ] **Step 1: Implement state and handlers in `AddSyncModal.tsx`**

- Add `conflicts` state: `const [conflicts, setConflicts] = useState<SyncConflict[]>([])`.
- In `handleGoogleSheetsSync`, `handleImportSubmit`:
  Set `setConflicts(res.conflicts || [])`.
- Implement `handleResolveSingle(rowId: number, category: string, keepMine: boolean)`:
  - If `keepMine`: simply remove from `conflicts` list with toast "Kept app category".
  - If `!keepMine`: call `api.resolveSyncConflicts(scope, [{ row_id: rowId, category }])`, remove from `conflicts`, call `onDataChanged(...)`.
- Implement `handleKeepAllConflicts()`:
  - Clear `conflicts` list with toast "Kept all app categories".
- Implement `handleApplyAllIncomingConflicts()`:
  - Call `api.resolveSyncConflicts(scope, conflicts.map(c => ({ row_id: c.row_id, category: c.incoming_category })))`.
  - Clear `conflicts`, call `onDataChanged(...)`.

- [ ] **Step 2: Render Conflict Review UI in `AddSyncModal.tsx`**

- Render amber/warning styled banner when `conflicts.length > 0`.
- Display table showing Date, Merchant, Amount, "In App" badge, "Monzo" badge, and action buttons.
- Ensure accessible and responsive layout in modal.

- [ ] **Step 3: Run TypeScript build**

Run: `npm --prefix frontend run build`
Expected: PASS

---

### Task 5: Version Bump, Changelog, and Verification

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

- [ ] **Step 1: Bump version in `backend/changelog.py` and `frontend/package.json`**

Bump from `0.6.3` to `0.6.4` and prepend release note to `CHANGELOG`.

- [ ] **Step 2: Run all linters and tests**

Run:
- `./venv/bin/ruff check .`
- `./venv/bin/ruff format --check .`
- `./venv/bin/pytest`
- `npm --prefix frontend run build`

- [ ] **Step 3: Run `differential-review` skill before commit**

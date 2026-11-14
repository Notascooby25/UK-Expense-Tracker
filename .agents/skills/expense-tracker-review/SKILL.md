---
name: expense-tracker-review
description: >-
  Perform a high-signal code review for the UK Expense Tracker app.
  Checks for FastAPI concurrency bugs, CSV file safety, stale row index protection,
  Streamlit session state issues, zero-handling, and React frontend build integrity.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# UK Expense Tracker — Code Review Skill

You are a code reviewer. Your job is to surface real defects in the UK Expense Tracker — a dual-architecture system (FastAPI + React web app on port 8502, legacy Streamlit on port 8501) backed by flat CSV/JSON files. Every finding must be verified before it is reported.

---

## Step 1: Determine the Diff Scope

Use these exact commands in order:
1. **Check for uncommitted changes** — run `git status --porcelain`. Review the union of staged and unstaged files if present.
2. **Branch diff** — if working tree is clean, use: `git diff --name-only $(git merge-base HEAD main)...HEAD`
3. **Always filter** by these globs: ignore `*.csv`, `*.json`, `logs/`, `__pycache__/`, and `.example` templates.

---

## Step 2: Mandatory Verification Pass

For every candidate finding:
1. **Construct a concrete failure scenario**: e.g., "Two concurrent requests call PATCH `/api/transactions/1`; without `@serialized`, the second write overwrites the first," or "Entering an asset balance of 0 is dropped by `val > 0`, leaving the stale balance intact."
2. **Trace the actual code path**: Follow the request execution flow and data lifecycle.
3. If you cannot produce a concrete scenario, discard the finding. Do not report speculative bugs.

---

## Step 3: Project-Specific Checklist

Apply this checklist to all modified lines according to the touched subsystems:

### 1. FastAPI & CSV Storage Safety (Critical)
- **Concurrency Serialization:** Does every new or modified mutating endpoint (POST, PUT, PATCH, DELETE) have `@serialized` or use `storage_txn()`? Unserialized read-modify-write cycles lead to silent data loss under concurrency.
- **Positional Row ID Guards:** Do transaction edit/delete endpoints accept and check an expected row fingerprint (`expect` / `expects`)? If row IDs can shift, a stale client could edit or delete the wrong transaction.
- **Data File Modes & Backups:** Does `atomic_write_bytes` preserve the existing file's permissions and ownership? (Using raw `NamedTemporaryFile` resets permissions to `0600`, breaking backup cron jobs).
- **Safety Copies:** Does `save_transactions` retain the `.bak` copy and check for unexpected row shrinkage?

### 2. Data Integrity & Financial Domain Logic
- **Zero vs Falsey / Absent:** Is `0` properly treated as a valid value? Check balance inputs, wealth tracking, and transaction amounts. Never use `if val:` or `> 0` if `0` is meaningful (e.g., closing an account).
- **Sign & Cash-Flow Direction:** Do split transactions inherit the parent transaction's sign/direction? Never use `abs()` blindly on amounts without tracking debit/credit or expense/income type.
- **Lossless Parsing & Quarantine:** Does CSV or date parsing gracefully handle alternative formats (e.g. ISO, DD/MM/YYYY)? Never silently drop unreadable rows during load/save cycles — quarantine them to `.rejected.csv` and alert in health status.
- **Account Scope Isolation:** Ensure all read/write paths respect `ACCOUNT_SCOPE_PERSONAL` vs `ACCOUNT_SCOPE_JOINT`. Never hardcode `expense_database.csv`.

### 3. Web Security & FastAPI Routing
- **Static File Containment:** Any file-serving route must strictly use `resolve_spa_file` (with `realpath` and `commonpath` checks). Never concatenate unvalidated user paths onto filesystem directories.
- **Authentication & Throttling:** Are comparisons done with constant-time byte checks (`compare_text`)? Does login enforce rate-limiting lockout? Are session cookies marked `Secure` when appropriate?
- **Production Exposure:** Ensure `/docs`, `/redoc`, and `/openapi.json` remain disabled in production mode (`EXPENSE_TRACKER_ENV=production`).

### 4. React Frontend Integrity
- **Typechecking & Build:** Does `npm run build` pass without TypeScript or Vite bundle errors?
- **Stale Screen Handling:** Does the frontend send row fingerprints and gracefully handle `409 Conflict` (alerting the user and refreshing the data)?

### 5. Streamlit App (Legacy)
- **Unsaved Sync Wipeout:** If an interaction triggers `st.rerun()`, ensure persistent data is stored in `st.session_state`.
- **Pandas Copy Warnings:** Ensure modified Pandas slices use `.copy()` to avoid `SettingWithCopyWarning`.

---

## Step 4: Output Format

1. Present findings in a ranked list, most-severe first (Critical / Should-fix / Minor).
2. Cap at **10 findings total**.
3. For each finding:
   - **Severity**
   - **File & location**: `[filename](file:///absolute/path/to/file#L10-L20)`
   - **Concrete failure scenario**
   - **Suggested fix**
4. If no findings survive the verification pass, state: "No verifiable defects found in the diff scope."

---

## Hard Constraints (Non-Destructive by Construction)
- Do not run `git commit`, `git push`, or modify files.
- Do not interact with the production NUC host or run Docker commands.

# Set-up answers
- **What it is and who uses it:** a personal finance tracker for the owner's household.
- **GitHub:** public, by the owner's decision. **Real data:** on the production server only, never in this repo.
- **How it goes live:** merging to `main` builds images and production updates. **Master copy:** GitHub.
- **Preview:** `scripts/preview.sh`. **Process:** full (`safe-change` skill).

# AI Agent Instructions

- **Architecture**: This project is a dual-application personal finance suite:
  - **Web App (Primary)**: React 18 + TypeScript frontend (`frontend/`) and FastAPI backend (`backend/`) running on port 8502.
  - **Streamlit App (Legacy)**: Python Streamlit application (`app.py`) running on port 8501.
  - **Storage**: Flat-file CSV and JSON persistence in `data/` (`expense_database.csv`, `wealth_history.json`, etc.) with Personal and Joint account scopes.
- **Coding Standard and Style**: Follow **PEP 8** for Python. Follow idiomatic React / TypeScript for the frontend.
- **Linters, Formatters, and Tests**:
  - Run linter: `./venv/bin/ruff check .`
  - Run auto-formatter: `./venv/bin/ruff format .`
  - Run test suite: `./venv/bin/pytest`
  - Run pre-commit checks: `./venv/bin/pre-commit run --all-files`
  - Run frontend build/typecheck: `cd frontend && npm run build` (whenever modifying `frontend/`)
  - After every change, run the linter and test commands, verify changes, and explicitly report the results in your response.
- **Secrets Handling**: Passwords, API keys, and credentials must never be committed to version control. Use environment variables or place them in `.streamlit/secrets.toml` (which is git-ignored).
- **Core Invariants & Lessons Learned (v0.8.2–v0.8.6)**:
  - *Concurrency & Write Locking*: All mutating FastAPI endpoints that read-modify-write CSV/JSON data MUST use `@serialized` or `storage_txn()` to prevent concurrent write clobbering.
  - *Stale-Row Fingerprint Protection*: Because CSV transaction IDs are positional line indices, any update, bulk action, or delete MUST validate row fingerprints (`expect` / `expects`) to reject stale edits (HTTP 409 Conflict) when rows shift.
  - *Zero vs None / Falsey*: `0` is a valid financial quantity (e.g. closed bank account, zero net spend). NEVER use truthiness checks (`if val:`) or `> 0` filters where 0 is a legitimate value.
  - *No Silent Data Loss / Quarantine Policy*: Never silently drop unparseable rows or non-standard dates during data loading, as saving overwrites the file and permanently destroys them. Unparseable rows must be quarantined (`.rejected.csv`) and surfaced to the user.
  - *Financial Direction & Sign Integrity*: Split transactions must inherit their parent's cash-flow sign and direction. NEVER blindly apply `abs()` to transaction amounts.
  - *File Permissions & Backup Safety*: File writes via `atomic_write_bytes` must preserve existing file modes and ownership (avoid forcing `0600`) so external backup crons can read `data/`. Always maintain `.bak` safety copies before modifying databases.
  - *Web Security*: Catch-all SPA or static file routes must use strict `realpath` + `commonpath` containment (`resolve_spa_file`) to prevent path traversal. Disable API documentation (`/docs`, `/redoc`) in production. Use constant-time byte comparisons and rate-limiting lockout on auth endpoints.
- **Security Risks**: This is a personal finance tracker handling sensitive financial data.
  - *Data Corruption*: Prevent errors that could overwrite or corrupt the local CSV database.
  - *Unauthorized Access*: Do not bypass or weaken FastAPI or Streamlit authentication checks.
  - *XSS (Cross-Site Scripting)*: Validate and sanitize any user-provided transaction data before displaying it.
- **Review Requirement**: You must run the `differential-review` skill before any changes are committed.
- **How to work here**: Follow the shared `safe-change` skill for every change. Commit and push to a working branch, never to `main`; the owner merges, or gives the go-ahead for that specific merge. Bump the version and changelog once per release, just before the go-ahead.
- **Preview**: `scripts/preview.sh up` runs a private copy of the branch with a copy of live data (`--phone` opens it to home Wi-Fi); `scripts/preview.sh down` stops it and deletes the copy.
- **Public repo**: never commit real figures, IP addresses, hostnames, account IDs, secrets or unfixed weaknesses, including as examples in docs.
- **Do Not Edit**: Never manually edit `.git/`, `venv/`, `__pycache__/`, or the local runtime data files in `data/` (like `expense_database.csv`, `settings.json`, and `saved_filters.json`).

# Differential Security Review: write safety v0.8.3

**Date:** 2026-10-31
**Scope:** uncommitted changes on `release/0.8.3-write-safety`, base `main` at `a8424bf` (v0.8.2)
**Strategy:** FOCUSED. The diff is small, but it changes how every data file is written, so it is HIGH risk for data corruption.

# 1. Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 MEDIUM | 1 |
| 🟢 LOW | 3 |

**Overall risk:** LOW to MEDIUM. It removes a data-loss bug and adds a safety copy.
**Recommendation:** APPROVE for a local commit. Deploy after a fresh NUC backup (see section 7).

**Key metrics**
- Files analysed: 5 of 5 changed source files (100%), plus 2 new test files and 1 new script.
- Security regressions detected: 0.
- Highest blast radius: `atomic_write_bytes`, which every JSON and CSV write passes through (3 direct callers, reached from all 13 `save_transactions` and 5 `atomic_write_json` call sites).
- Test gaps: none open.

# 2. What Changed

| File | Change | Risk | Blast radius |
|------|--------|------|--------------|
| backend/storage.py | New `storage_txn` / `serialized`; `atomic_write_bytes` rewritten (mode and owner preserved, temp file cleaned on error); `.bak` copy and shrink warning on every transactions save | HIGH | HIGH (all writes) |
| backend/main.py | `@serialized` on 13 mutating handlers; Google sync split so the network fetch is outside the lock; `import_csv_file` changed from `async def` to `def` | MEDIUM | MEDIUM |
| scripts/check_backup_fresh.sh (new) | Read-only freshness and checksum check | LOW | none |
| .gitignore, .dockerignore | Ignore `expense_database*.csv.bak` | LOW | none |
| changelog, package.json, README | Version 0.8.3 and docs | LOW | none |

# 3. Findings

### 🟡 MEDIUM: the write lock only protects a single process
**File:** backend/storage.py:28 (`_WRITE_LOCK`)
`threading.RLock` serialises requests inside one Python process. Today `Dockerfile.web` runs one uvicorn process with no `--workers`, so it holds. If anyone later adds workers (or runs a second container on the same `data/` folder), overlapping saves would be possible again with no error.
**Recommendation:** document the constraint (done in the code comment and changelog) and, if workers are ever needed, add an `fcntl.flock` lock file. Not needed now.

### 🟢 LOW: `.bak` keeps only one generation
A bad bulk delete followed by any other edit overwrites the good `.bak` with the post-delete state. Wording in the README and changelog says this plainly. The nightly archives are the real safety net, which is why the backup job fix matters.
**Recommendation (follow-up):** keep the first save of each day as a dated copy and retain 7.

### 🟢 LOW: `.bak` files are not tracked by git but are included in backups
Added to `.gitignore` and `.dockerignore` during this review (a dev run without `EXPENSE_TRACKER_DATA_DIR` writes next to the code, where the old ignore pattern `expense_database*.csv` did not match `.csv.bak`). They also land in the nightly archive, adding about 0.7 MB. Accepted.

### 🟢 LOW: ownership is preserved only when running as root
`os.fchown` is attempted and ignored on `OSError`. In the container the app runs as root, so ownership is preserved; as a normal user the file keeps that user as owner, which is the existing behaviour.

### Behavioural notes (no finding)
- `import_csv_file` is now synchronous and reads `file.file`. FastAPI runs it in the thread pool, as for every other handler. It previously did blocking pandas work on the event loop, so this is no worse.
- A request that waits for the write lock holds one thread-pool worker (default 40) while it waits. Writes are tens of milliseconds, so the queue is short.

# 4. Test Coverage Analysis

**Coverage of changed code: 100% of changed functions have direct tests.** Suite: 102 passed (90 before plus 12 new). Shell: 14 new fixture checks plus the 41 existing backup-script checks pass.

| Function | Risk | Tests |
|----------|------|-------|
| `atomic_write_bytes` | HIGH | existing mode preserved (0640 round-trip); new file follows umask (0644); no temp file left behind |
| `_keep_previous_version` / `save_transactions` | HIGH | no `.bak` on first save; `.bak` equals the previous bytes after each save; scoped per account; shrink warns; normal growth and a 1-row delete do not warn |
| `storage_txn` / `serialized` | HIGH | 16 threads doing load-modify-save keep all 16 rows; reentrant; 24 parallel API creates keep all 24; 30 parallel PATCHes keep all 30 notes |
| `check_backup_fresh.sh` | LOW | fresh, stale, newest-wins, empty, missing dir, bad checksum, missing checksum, corrupt archive, bad arguments |

**Reproduced before the fix:** 24 parallel creates left 1 row; 30 parallel PATCHes left blank notes. After: all rows kept, and six consecutive runs of the new test file passed (no flakiness).
**Live check:** the real-server script went from 2 of 40 rows saved to 40 of 40.

# 5. Blast Radius Analysis

| Function | Callers | Risk | Notes |
|----------|---------|------|-------|
| `atomic_write_bytes` | 3 direct; all writes | HIGH | Same temp-file plus `os.replace` approach; adds fchmod/fchown and cleanup on error |
| `save_transactions` | 13 | HIGH | Adds one read of the old file and one extra atomic write per save |
| `serialized` handlers | 13 routes | MEDIUM | Lock order is always `_WRITE_LOCK` then `_STORAGE_LOCK`. `storage.py` never takes `_WRITE_LOCK`, so no inversion or deadlock is possible. |

# 6. Historical Context

`atomic_write_bytes` with `NamedTemporaryFile` comes from `a5ef119` (the React app's first commit, 2026-10-11). That is the commit after which the data files became root-owned and 0600, matching the backup log failing from around that date. No security-related code is removed.

# 7. Recommendations

### Before deploying
- [ ] Fresh NUC backup the same day (`sudo ./scripts/data_backup.sh`), then deploy.
- [ ] After deploy, `ls -l /srv/UK-Expense-Tracker/data` to confirm files keep their mode, and make an edit to confirm `expense_database.csv.bak` appears.
- [ ] Install the nightly job in root's crontab (still outstanding) and run `check_backup_fresh.sh` the next morning.

### Technical debt
- [ ] Dated daily `.bak` copies (7 retained).
- [ ] `flock` lock file if multiple workers are ever used.

# 8. Analysis Methodology

**Strategy:** FOCUSED. Git history on every replaced line, caller counts by grep, lock-order inspection, test-gap check per changed function, before/after reproduction of the lost-write bug (unit, API, and live server).
**Limitations:** Python 3.14 locally versus 3.11 in the container; only standard-library APIs are used. Behaviour of `os.fchown` as root was reasoned about, not run (tests do not run as root).
**Confidence:** HIGH for the analysed scope.

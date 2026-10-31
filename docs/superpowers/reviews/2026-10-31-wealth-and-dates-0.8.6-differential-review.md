# Differential Security Review: wealth zeros and date handling v0.8.6

**Date:** 2026-10-31
**Scope:** uncommitted changes on `release/0.8.6-wealth-and-dates`, base `release/0.8.5-stale-row-guard` (`7c6fd19`)
**Strategy:** FOCUSED. The date change sits in `load_transactions`, which every request uses, so it was treated as HIGH risk for data correctness.

# 1. Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 MEDIUM | 0 |
| 🟢 LOW | 4 |

**Overall risk:** LOW.
**Recommendation:** APPROVE for a local commit.

**Key metrics**
- Files analysed: 4 of 4 changed source files (100%), plus 1 new test file.
- Security regressions detected: 0.
- Highest blast radius: `load_transactions` (21 references), which every request calls.
- Test gaps: none open.

# 2. What Changed

| File | Change | Risk | Blast radius |
|------|--------|------|--------------|
| backend/storage.py | `parse_db_dates`: strict DD/MM/YYYY first, then ISO, then loose day-first; `_set_aside_unreadable_rows` appends rows with an unreadable date to `<db>.rejected.csv` before a save replaces the file; startup-health note; `load_assets` keeps 0 | HIGH | HIGH (load path) |
| backend/main.py | `save_wealth_balances` accepts a 0 asset balance | LOW | LOW |
| frontend/src/pages/WealthPage.tsx | Two asset payload builders accept 0 (debts already did) | LOW | LOW |
| changelog, package.json | Version 0.8.6 | LOW | none |

# 3. Findings

### 🟢 LOW: set-aside failure does not block the save
If writing the `.rejected.csv` file fails (for example a full disk), the error is logged and the save continues. Refusing to save would be safer for the rows but would also make every edit fail if the problem were persistent or caused by a bug in this new code. The rows are still in the one-generation `.bak` copy and the nightly archives until the next save. Accepted trade-off.

### 🟢 LOW: the first save after upgrading rewrites non-standard dates
Rows in ISO or other formats now load (they were dropped before), and the next save writes them as DD/MM/YYYY. The meaning of the date does not change, but the file text does for those rows. Your 31 Oct backup has none.

### 🟢 LOW: an explicit 0 is now stored
Typing 0 used to be ignored; it is now recorded, which is the intent. Accounts already at 0 are prefilled as 0 on the next snapshot and stay at 0. A blank field still means "carry forward", and negative balances are still ignored.

### 🟢 LOW: the rejected file is never cleaned up automatically
It grows only when unreadable rows appear and is included in the nightly archive. It is meant to be read and dealt with by the owner; the Settings note makes it visible.

# 4. Test Coverage Analysis

Suite: 147 passed (131 before plus 16 new). Eleven of the 16 failed on the previous code.

| Function | Risk | Tests |
|----------|------|-------|
| `parse_db_dates` / `load_transactions` | HIGH | day-first dates unchanged, including the ambiguous 03/04/2026 (3 April) and unpadded 5/1/2026; ISO, two-digit-year and text dates are read; a non-standard date survives an unrelated PATCH |
| `_set_aside_unreadable_rows` | HIGH | bad rows hidden from the app, then kept verbatim in the rejected file with the original header; not duplicated by repeated saves; accumulate across saves; never created for clean files; scoped per account |
| `get_startup_health` | LOW | note appears with the file name and row count |
| `load_assets`, `save_wealth_balances` | MEDIUM | 0 kept and negatives and nulls dropped; closing an account lowers net worth (150 to 50); a zero-only snapshot is recorded; an omitted account still carries forward; negatives still ignored |

**Real-data verification (temporary copy of the 31 Oct backup, removed afterwards):**
- New date parsing is identical to the old strict parsing on all 15,785 rows.
- 0 rows unreadable in either account; no rejected file created.
- `load, save, load` round-trips identically for both accounts (7,755 and 8,030 rows).

# 5. Blast Radius Analysis

| Function | Callers | Notes |
|----------|---------|-------|
| `load_transactions` | 21 references | strict parse is still attempted first on every value, so well-formed data takes the same path as before |
| `save_transactions` | 13 references | one extra in-memory parse of the previous file's dates per save (about 8,000 rows) |
| `load_assets` | 2 | now returns zero entries, which `build_wealth_data` handles (the account stays in `known_assets`) |

# 6. Historical Context

The `> 0` filters and the strict-only date parse both come from `a5ef119` (the React port). The Streamlit loader also dropped unparseable dates; this release makes that loss visible and recoverable. No security-related code is removed.

# 7. Recommendations

- [ ] Deploy after a fresh NUC backup.
- [ ] After deploying, check Settings health for any "set aside" note (none expected).
- [ ] When you next close an account, enter 0 for it on the Wealth page.

# 8. Analysis Methodology

**Strategy:** FOCUSED. Caller counts, before/after reproduction of each bug, real-data equivalence check for the load path, warnings-as-errors run of the date fallback.
**Limitations:** The Wealth page change is two comparison operators; it was verified by the build and the backend tests, not by clicking through the UI.
**Confidence:** HIGH.

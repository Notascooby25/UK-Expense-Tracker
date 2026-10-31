# Differential Security Review: stale-row guard v0.8.5

**Date:** 2026-10-31
**Scope:** uncommitted changes on `release/0.8.5-stale-row-guard`, base `release/0.8.4-import-correctness` (`c7a1447`)
**Strategy:** FOCUSED. Backend plus frontend; the change only adds a refusal path, so it cannot widen access, but it sits on every edit and delete.

# 1. Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 MEDIUM | 1 |
| 🟢 LOW | 3 |

**Overall risk:** LOW. The new code can only refuse a request; it never performs an action the old code would not.
**Recommendation:** APPROVE for a local commit.

**Key metrics**
- Files analysed: 7 of 7 changed source files (100%), plus 1 new test file.
- Security regressions detected: 0. Authentication, validation and the write lock are unchanged.
- Highest blast radius: `bulk_update_transactions` (6 call sites on the Transactions page) and `patch_transaction` (3 pages).
- Test gaps: none open.

# 2. What Changed

| File | Change | Risk | Blast radius |
|------|--------|------|--------------|
| backend/storage.py | `transaction_fingerprint(date, name, amount)` | LOW | none (pure function) |
| backend/main.py | Optional `expect` on PATCH and `expects` on bulk; optional `signature` check on `mark_one_off`; `_require_fresh_row` raises 409 | MEDIUM | HIGH (all row edits), but optional and backward compatible |
| frontend/src/api.ts | `ApiError` (carries HTTP status), `rowFingerprint`, optional arguments | LOW | MEDIUM (every API call now throws `ApiError`, a subclass of `Error`) |
| TransactionsPage, DashboardPage, AddSyncModal, IntelligencePage | Send fingerprints; on 409 show a message, change nothing, refresh | MEDIUM | MEDIUM |
| changelog, package.json | Version 0.8.5 | LOW | none |

# 3. Findings

### 🟡 MEDIUM: protection is opt-in, so an old cached page is unguarded
The server only checks when the client sends a fingerprint. A browser or phone still running the previous JavaScript bundle, or any other API client, behaves exactly as before. Existing clients keep working, which was the aim, but the protection only applies after a page refresh. Called out in the changelog.
**Recommendation:** none needed for a single-user app; reconsider making it mandatory after a release or two.

### 🟢 LOW: a stale screen can still overwrite a *field* changed elsewhere
The fingerprint covers date, name and amount only. If two devices both edit the same row's category, the last save wins. What is prevented is the damaging case: editing or deleting a different transaction than the one on screen.

### 🟢 LOW: identical twin rows cannot be told apart
Rows with the same date, name and amount share a fingerprint. The 31 Oct backup has 129 extra copies of such rows. If ids shift so that an id points at an identical twin, the guard passes and the twin is edited. The result is indistinguishable from editing the original, so nothing is lost.

### 🟢 LOW: a spurious refusal is possible during very fast successive edits
Two edits to the same row's name/date/amount fired before the first request completes could each be checked against a fingerprint the other has just changed. The outcome is a harmless message and a refresh, with no data change.

### Behavioural notes (no finding)
- A bulk selection that includes rows no longer shown on the current page gets no fingerprint for those rows (they are simply unguarded, as before).
- A stale request with an out-of-range id now returns 409 (refresh) instead of 404, but only when a fingerprint was sent.

# 4. Test Coverage Analysis

Suite: 131 passed (115 before plus 16 new). The new file failed to import before the change.

| Function | Risk | Tests |
|----------|------|-------|
| `transaction_fingerprint` | LOW | format (trim, two decimals, ISO date), blank name |
| `patch_transaction` | HIGH | matching expect succeeds; no expect still works; `expect` never written into the data; shifted row (after another device deleted a row) refused with nothing changed; reused fingerprint refused after a rename |
| `bulk_update_transactions` | HIGH | matching expects succeed; **all or nothing** when one row is stale; delete of a stale selection deletes nothing; expect for a missing row refused; no expects behaves as before; unrelated expects ignored |
| `mark_one_off` | MEDIUM | candidate signature accepted (and equals the row fingerprint); shifted row refused and not flagged; no signature still works |

**Real-data parity check:** the server-side fingerprint and the browser-side function were compared on all 15,785 rows of the 31 Oct backup (7,755 personal, 8,030 joint) with 0 mismatches, so legitimate edits will not be wrongly refused. A copy was used; the backup was untouched.
**Frontend:** `npm run build` (which type-checks) passes. There are no frontend unit tests in this project.

# 5. Blast Radius Analysis

| Function | Callers | Notes |
|----------|---------|-------|
| `patch_transaction` | 3 pages (Transactions inline edit, Dashboard drill-down, sync review) | all three now send `expect` |
| `bulk_update_transactions` | 6 handlers | all now send `expects` and handle 409 |
| `executeIntelligenceAction('mark_one_off')` | 1 | sends the candidate signature already present in the payload |
| `requestJson` | every API call | now throws `ApiError extends Error`; every existing `instanceof Error` check keeps working |

# 6. Historical Context

Positional row ids were introduced in the React port (`a5ef119`) and are documented in its design as stable "from index". No security-related code is removed.

# 7. Recommendations

- [ ] After deploying, refresh the app once on every device.
- [ ] Take a fresh NUC backup the day of deploying.

### Technical debt
- [ ] Longer term, a stored transaction id would remove the positional-id problem entirely, but it needs a CSV schema change and was deliberately not part of this release.

# 8. Analysis Methodology

**Strategy:** FOCUSED. Caller enumeration across frontend and backend, test-gap check per changed function, real-data parity test between the Python and JavaScript fingerprint implementations.
**Limitations:** The browser-side function was executed under Node, not in a browser; the code is plain string/number operations. No frontend unit tests exist, so UI behaviour on a 409 (alert, refresh) was reviewed by reading, not executed.
**Confidence:** HIGH for the backend; MEDIUM-HIGH for the frontend handling.

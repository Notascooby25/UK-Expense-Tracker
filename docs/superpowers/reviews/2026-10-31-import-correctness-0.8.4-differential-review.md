# Differential Security Review: import correctness v0.8.4

**Date:** 2026-10-31
**Scope:** uncommitted changes on `release/0.8.4-import-correctness`, base `release/0.8.3-write-safety` (`9fe645f`)
**Strategy:** FOCUSED. Small diff, but it changes how every imported transaction is typed, so it is HIGH risk for financial-data correctness.

# 1. Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 MEDIUM | 1 |
| 🟢 LOW | 3 |

**Overall risk:** LOW. No security surface changes; the change corrects financial classification.
**Recommendation:** APPROVE for a local commit.

**Key metrics**
- Files analysed: 2 of 2 changed source files (100%), plus 1 new test file.
- Security regressions detected: 0.
- Highest blast radius: `parse_and_merge_import` (3 import endpoints plus the Monzo sync).
- Test gaps: none open. Before this release no test asserted `Transaction_Type` on split rows.

# 2. What Changed

| File | Change | Risk | Blast radius |
|------|--------|------|--------------|
| backend/storage.py `process_monzo_splits` | Split rows get `Transaction_Type` from the parent's signed amount (or the parent's explicit type, or the split's own sign if the parent amount is blank/zero) | HIGH | MEDIUM (Monzo imports only) |
| backend/storage.py `parse_and_merge_import` | Type inference now fills *blank* types when the column exists, instead of only when the column is absent | MEDIUM | HIGH (all import formats pass through it) |
| backend/main.py | New `_serialize_new_rows` replaces three copies of the `iloc[pre_len:]` slice; unused `pre_len` removed | LOW | MEDIUM (3 endpoints) |
| changelog, package.json | Version 0.8.4 | LOW | none |

# 3. Findings

### 🟡 MEDIUM: rows already saved wrongly are not repaired by this release
The fix applies to new imports only. Re-syncing does not correct existing rows, because the duplicate check matches on date, name and amount and keeps the stored version. In the 31 Oct backup there are 12 Income-only split-like groups worth about £985 (some may be genuine refunds), so those stay as they are until the reviewed repair step (Phase 3), which is deliberately manual. No duplicates are created by this release.

### 🟢 LOW: sign convention is an assumption
Negative means spend and positive means money in, the same convention the pre-existing inference already used for Monzo. A source using the opposite convention would have been misread before and still is. Unchanged risk.

### 🟢 LOW: ambiguous input resolves to the split's own sign
If the parent amount is blank or zero and the split text is written without a minus sign, the rows are classed as Income. A negative-written split with a blank parent is classed as Expense (tested). The old behaviour was Income in both cases.

### 🟢 LOW: blank-type fill is a small behaviour change for every format
A source with a `Transaction_Type` column that has empty cells previously produced rows with an empty type (which the dashboard then treats as an expense by default, since it only tests for the string "Income"). Those rows now get Income or Expense from the sign. Values already present are never overridden (tested).

# 4. Test Coverage Analysis

Suite: 115 passed (102 before plus 13 new). Nine of the 13 failed on the previous code, including the original bug.

| Function | Risk | Tests |
|----------|------|-------|
| `process_monzo_splits` | HIGH | positive-, negative- and no-space split text for a spend; split of a refund; blank parent amount; explicit parent type inherited; amounts still sum to the parent; non-split rows left untouched |
| `parse_and_merge_import` | HIGH | splits mixed with ordinary expense and income rows all get a type, and none stay blank; partly filled type column; retrospective replacement of an unsplit parent (existing test plus a new type assertion) |
| `_serialize_new_rows` | MEDIUM | retrospective split returns all 2 new rows with row ids that point at the right stored rows; a plain import still returns only its new rows at the correct id |

**Live check (real server, fake data):** splits stored as Expense; dashboard net expenses went from -£71.50 to £79.50 (correct); review list 2 of 2 (was 1 of 2).

# 5. Blast Radius Analysis

| Function | Callers | Notes |
|----------|---------|-------|
| `parse_and_merge_import` | 3 endpoints, ~10 tests | HSBC and Barclaycard branches set every type before the changed block, so they are unaffected; verified by the existing storage tests |
| `process_monzo_splits` | 1 (inside `parse_and_merge_import`) | exception behaviour kept: a malformed parent amount still leaves the row unsplit |
| `_serialize_new_rows` | 3 | relies on the documented invariant that new rows are appended last |

# 6. Historical Context

The abs() on split amounts and the absent direction come from `a5ef119` (the React port). The older Streamlit code kept the split's sign, which is why 21 of the 30 split-like groups in the backup are correctly typed Expense. No security-related code is removed.

# 7. Recommendations

- [ ] Deploy, then run the Phase 3 diagnostic on a copy of the data to list rows needing repair.
- [ ] Make a fresh NUC backup the day of deploying.

# 8. Analysis Methodology

**Strategy:** FOCUSED. Git history on changed lines, caller counts, test-gap check per changed function, before/after reproduction at unit, API and live-server level.
**Limitations:** I have not seen the real Monzo sheet's split format; tests cover positive, negative and unspaced variants. Existing stored data was not touched.
**Confidence:** HIGH for the analysed scope.

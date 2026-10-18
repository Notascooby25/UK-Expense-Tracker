# Wealth Date-Level Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable recording wealth account balance snapshots by specific calendar day (DD/MM/YYYY) rather than only by month, allowing multiple balance checkpoints within the same month while preserving full backward compatibility with historical monthly records.

**Architecture:**
Support ISO `YYYY-MM-DD` date keys alongside existing `YYYY-MM` keys in `assets.json` and backend endpoints (`/api/wealth/balances`). Update frontend Wealth page date picker from `<input type="month">` to `<input type="date">` with a quick "Today" button, and enhance chart axes, tooltips, and modal history views to format date snapshots cleanly for UK locale (`DD/MM/YYYY`).

**Tech Stack:** FastAPI, Pydantic, Python 3.14, React 18, TypeScript, Tailwind CSS, Recharts.

**Spec:** User request: replace month/year balance entry with day/month/year entry to record multiple snapshots in a month (e.g., 30 Oct and 4 Nov) with visual companion mockup at `.superpowers/brainstorm/35-1792266227/content/wealth-date-entry.html`.

## Global Constraints
- Only read, create, edit or delete files inside the current project's folder.
- Follow PEP 8 style guide for Python and ESLint/TypeScript standards for React.
- Run ruff linter, ruff formatter, pytest, and frontend build after changes.
- Never edit runtime database files in `data/` directly.
- Maintain backward compatibility for existing `YYYY-MM` records.
- Bump `APP_VERSION` to `0.6.5` in `backend/changelog.py` and `frontend/package.json`.

## Review Focus
1. Backward compatibility: Existing `YYYY-MM` entries must remain readable, editable, and properly sorted alongside `YYYY-MM-DD` entries.
2. Lexicographical sorting: Ensure ISO format `YYYY-MM-DD` and `YYYY-MM` sort correctly in charts and net worth progression curves.
3. Input validation: The API should validate date strings in either `YYYY-MM-DD` or `YYYY-MM` formats and reject empty or invalid strings.
4. Empty snapshot deletion: Clearing all balances for a specific date must clean up the entry from `assets_data`.
5. Mobile / UI accessibility: The date picker input must display cleanly across desktop and mobile browsers with clear labels and touch targets.

---

### Task 1: Backend API & Analytics Support for Exact Date Snapshots

**Files:**
- Modify: `backend/main.py:825-868`
- Modify: `backend/analytics.py:645-666`
- Modify: `tests/test_backend_api.py`

**Interfaces:**
- Consumes: `assets_data: dict[str, dict[str, float]]`
- Produces: `WealthBalanceSaveRequest` accepting `date` (or `month`), `/api/wealth/balances` returning sorted net worth series supporting `YYYY-MM-DD`.

- [ ] **Step 1: Write failing tests in `tests/test_backend_api.py` for day-level snapshot saving and deletion**

```python
def test_wealth_day_level_snapshots(api_env):
    """Verify logging balances on specific dates (YYYY-MM-DD) and mixed date/month sorting."""
    client = api_env["client"]
    # Save a snapshot for 2026-10-30
    r1 = client.post(
        "/api/wealth/balances?scope=Personal",
        json={"date": "2026-10-30", "balances": {"Trading 212": 15000.0, "Cash ISA": 5000.0}},
    )
    assert r1.status_code == 200
    # Save another snapshot for 2026-11-04
    r2 = client.post(
        "/api/wealth/balances?scope=Personal",
        json={"date": "2026-11-04", "balances": {"Trading 212": 15200.0, "Cash ISA": 5050.0}},
    )
    assert r2.status_code == 200
    w_data = r2.json()["wealth"]
    assert "2026-10-30" in w_data["assets_by_month"]
    assert "2026-11-04" in w_data["assets_by_month"]
    # Verify chronological ordering in net_worth_series
    months_in_series = [entry["month"] for entry in w_data["net_worth_series"]]
    assert "2026-10-30" in months_in_series
    assert "2026-11-04" in months_in_series
    assert months_in_series.index("2026-10-30") < months_in_series.index("2026-11-04")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_backend_api.py::test_wealth_day_level_snapshots -v`
Expected: FAIL (because `date` is not accepted or required `month` validation fails)

- [ ] **Step 3: Update `WealthBalanceSaveRequest` and endpoints in `backend/main.py` and `backend/analytics.py`**

- In `backend/main.py`: Update `WealthBalanceSaveRequest` to accept either `date: str = ""` or `month: str = ""`. Extract `snapshot_key = clean_string(payload.date or payload.month)`. Validate that `snapshot_key` matches regex `^\d{4}-\d{2}(-\d{2})?$`.
- In `backend/analytics.py`: Maintain `latest_date` / `latest_month` and ensure sorted timeline handles mixed `YYYY-MM` and `YYYY-MM-DD` gracefully.

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `./venv/bin/pytest tests/test_backend_api.py -v`
Expected: PASS

---

### Task 2: Frontend Types, API Client, and Wealth Logger Date Picker

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/pages/WealthPage.tsx`

**Interfaces:**
- Consumes: `/api/wealth` payload with daily date strings
- Produces: WealthPage component with `<input type="date">`, formatted UK date display, and snapshot management.

- [ ] **Step 1: Update TypeScript types and api client in `frontend/src/types.ts` and `frontend/src/api.ts`**

Update `saveWealthBalances` to accept `dateOrMonth: string` and pass `{ date: dateOrMonth, month: dateOrMonth, balances }`.

- [ ] **Step 2: Update WealthPage state and logger input**

- Replace `selectedMonth` state with `selectedDate` defaulting to today's date in `YYYY-MM-DD` format.
- Add a "Today" quick button next to the date input.
- Replace `<input type="month">` with `<input type="date">`.
- Update button copy: "Save Balances for {formattedDate}".

- [ ] **Step 3: Update history modal and chart axis formatters**

- Add helper function `formatSnapshotDate(key: string): string` to convert `YYYY-MM-DD` to `DD/MM/YYYY` (or `DD MMM YYYY`), while displaying `YYYY-MM` as `MMM YYYY`.
- In the "Recorded Snapshots" modal tab, render human-friendly date badges with formatted date and raw key in tooltip.
- In `AreaChart` and `LineChart`, format X-axis ticks and tooltip labels using `formatSnapshotDate`.

- [ ] **Step 4: Verify frontend build passes**

Run: `npm run build` in `frontend/`
Expected: PASS with 0 TypeScript and build errors.

---

### Task 3: Version Bump, Changelog, Verification & Deployment Readiness

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: version `0.6.4`
- Produces: version `0.6.5` with changelog entry.

- [ ] **Step 1: Bump version in `backend/changelog.py` and `frontend/package.json`**

Update `APP_VERSION = "0.6.5"` and prepend changelog entry for day-level wealth recording.

- [ ] **Step 2: Run linter, formatting, and full test suite**

Run:
- `./venv/bin/ruff check .`
- `./venv/bin/ruff format .`
- `./venv/bin/pytest`
- `npm run build` in `frontend/`

- [ ] **Step 3: Commit and push changes**

- Run differential-review skill.
- Commit with descriptive message.
- Push to `origin/main`.
- Provide user with exact docker commands for their NUC.

# Rectify Differential Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 5 findings (MEDIUM-1, MEDIUM-2, LOW-1, LOW-2, LOW-3) identified in the 2026-10-10 Differential Security & Code Review Report.

**Architecture:**
1. Extract pure, side-effect-free helper functions into `cashflow_utils.py` (`escape_markdown`, `compute_committed_breakdown`, `compute_variable_breakdown`, `compute_income_breakdown`, `compute_savings_breakdown`) because importing `app.py` directly runs top-level Streamlit UI/auth commands (`st.set_page_config`, `CookieController`, `st.stop`).
2. Update `tests/test_basic.py` to import and test `cashflow_utils.py` directly, covering refund subtraction, negative/zero filtering, and Markdown character escaping.
3. Update `app.py` to use `cashflow_utils.py`, persist the layout toggle (`dash_cf_view_mode`) across sidebar page transitions via `st.session_state.cf_view_mode_pref`, and make the 4 mobile tab headers wrap/fit cleanly on a 375px phone screen.
4. Add `.git-blame-ignore-revs` with commit `df3ddc8aa7de601619a3874ca1414002a988722e` so `git blame` ignores the full-file formatting pass.

**Tech Stack:** Python 3, Streamlit, Pandas, Pytest, Ruff.

**Spec:** `UK_Expense_Tracker_DIFFERENTIAL_REVIEW_2026-10-10.md`

## Global Constraints

- Follow PEP 8 and keep changes small and focused; do not reformat unrelated code.
- Never modify runtime data files in `data/`.
- Validate, sanitise, and escape all user-provided transaction strings before displaying in Markdown.
- Run `./venv/bin/ruff check .` and `./venv/bin/pytest` after every change.

## Review Focus

- Merchant names containing asterisks, underscores, dollar signs, or brackets (e.g., `PAYPAL *SELLER_UK`, `$100 Bonus`, `[link](https://example.com)`) must be escaped so Streamlit does not render unintended italics, KaTeX math, or external links/images.
- Committed and Variable breakdown calculations must subtract refunds (`Committed Refund` / `Variable Refund`) from expenses before dividing by `months_in_period`.
- Variable breakdown must exclude categories where net spend is `<= 0`, while Committed breakdown excludes categories where net spend is `== 0`.
- `months_in_period` of `0` or negative must be guarded (`max(1, months_in_period)`) to prevent `ZeroDivisionError`.
- Switching from `"📊 Dashboard"` to `"📝 Add & Sync"` and back must preserve the user's selected `"📱 Mobile (Tabs)"` layout mode.

---

### Task 1: Create `cashflow_utils.py` and Unit Tests (MEDIUM-1 & MEDIUM-2)

**Files:**
- Create: `cashflow_utils.py`
- Modify: `tests/test_basic.py:1-52`
- Test: `tests/test_basic.py`

**Interfaces:**
- Produces in `cashflow_utils.py`:
  - `escape_markdown(text: object) -> str`
  - `compute_committed_breakdown(df_v: pd.DataFrame, months_in_period: int | float) -> pd.DataFrame`
  - `compute_variable_breakdown(df_v: pd.DataFrame, months_in_period: int | float) -> pd.DataFrame`
  - `compute_income_breakdown(df_v: pd.DataFrame, months_in_period: int | float) -> tuple[float, list[tuple[str, float, list[tuple[str, float]]]]]`
  - `compute_savings_breakdown(df_v: pd.DataFrame, months_in_period: int | float) -> list[tuple[str, float, list[tuple[str, float]]]]`

- [ ] **Step 1: Write failing tests in `tests/test_basic.py` importing from `cashflow_utils`**

```python
from cashflow_utils import (
    compute_committed_breakdown,
    compute_income_breakdown,
    compute_savings_breakdown,
    compute_variable_breakdown,
    escape_markdown,
)


def test_escape_markdown_sanitizes_special_chars():
    assert escape_markdown("PAYPAL *EBAY_UK") == r"PAYPAL \*EBAY\_UK"
    assert escape_markdown("![x](https://evil.tld)") == r"\!\[x\]\(https://evil\.tld\)"
    assert escape_markdown("$100 Bonus") == r"\$100 Bonus"


def test_cashflow_breakdown_calculations_with_refunds():
    data = {
        "Category": ["Bills", "Bills", "Groceries", "Holidays", "Holidays", "Salary"],
        "Name": ["British Gas", "British Gas", "Tesco", "EasyJet", "EasyJet", "Employer"],
        "Amount": [120.0, 20.0, 50.0, 80.0, 100.0, 500.0],
        "Transaction_Type": ["Expense", "Income", "Expense", "Expense", "Income", "Income"],
        "Spend_Type": [
            "Committed Expense",
            "Committed Refund",
            "Committed Expense",
            "Variable Expense",
            "Variable Refund",
            "True Income",
        ],
    }
    df = pd.DataFrame(data)

    com_df = compute_committed_breakdown(df, months_in_period=2)
    assert list(com_df["Category"]) == ["Bills", "Groceries"]
    assert com_df["Avg P/M (£)"].tolist() == [50.0, 25.0]  # (120-20)/2=50, 50/2=25

    # Holidays has net -20.0 (80 expense - 100 refund), so Variable (> 0) drops it
    var_df = compute_variable_breakdown(df, months_in_period=2)
    assert var_df.empty

    inc_total, inc_cats = compute_income_breakdown(df, months_in_period=2)
    assert inc_total == 250.0
    assert inc_cats == [("Salary", 250.0, [("Employer", 250.0)])]


def test_savings_breakdown_calculations():
    data = {
        "Category": ["Savings", "Savings"],
        "Name": ["Monzo Pot", "Monzo Pot"],
        "Amount": [300.0, 100.0],
        "Transaction_Type": ["Expense", "Income"],
        "Spend_Type": ["Internal Transfer", "Internal Transfer"],
    }
    df = pd.DataFrame(data)
    sav_cats = compute_savings_breakdown(df, months_in_period=2)
    assert sav_cats == [("Savings", 100.0, [("Monzo Pot", 100.0)])]
```

- [ ] **Step 2: Run pytest to verify the new tests fail**

Run: `./venv/bin/pytest tests/test_basic.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'cashflow_utils'`

- [ ] **Step 3: Implement `cashflow_utils.py`**

Implement the 5 functions in `cashflow_utils.py`, escaping `\\`, `` ` ``, `*`, `_`, `{`, `}`, `[`, `]`, `(`, `)`, `#`, `+`, `-`, `.`, `!`, and `$` in `escape_markdown`, and guarding `months = max(1, months_in_period)` in all breakdown functions.

- [ ] **Step 4: Run pytest and ruff to verify Task 1 passes**

Run: `./venv/bin/pytest tests/test_basic.py -v` and `./venv/bin/ruff check cashflow_utils.py tests/test_basic.py`
Expected: PASS (5 passed) and `All checks passed!`

---

### Task 2: Update `app.py` for Markdown Escaping, Persistent View Mode, and Mobile Tab Layout (MEDIUM-1, MEDIUM-2, LOW-1, LOW-2)

**Files:**
- Modify: `app.py:33-55`, `app.py:141-147`, `app.py:1294-1305`, `app.py:1520-1675`
- Test: `tests/test_basic.py`

**Interfaces:**
- Consumes: `escape_markdown`, `compute_committed_breakdown`, `compute_variable_breakdown`, `compute_income_breakdown`, `compute_savings_breakdown` from `cashflow_utils.py`.

- [ ] **Step 1: Update mobile tab CSS in `app.py:33-55`**

Allow tabs to wrap cleanly with compact mobile padding so all 4 tabs remain visible on 375px viewports without off-screen clipping:
```css
button[data-baseweb="tab"] {
    font-size: 0.95rem !important;
    padding: 6px 10px !important;
}
div[data-baseweb="tab-list"] {
    gap: 4px;
    flex-wrap: wrap;
}
```

- [ ] **Step 2: Initialize persistent `cf_view_mode_pref` in `st.session_state` (`app.py:141-147`) and sync in Dashboard (`app.py:1528-1535`)**

Initialize `st.session_state.setdefault("cf_view_mode_pref", "🖥️ Desktop (Grid)")` during session state setup, use it to compute the `index` of the `st.radio` widget in `app.py:1528-1535`, and update `st.session_state.cf_view_mode_pref = cf_view_mode` so navigating away from `"📊 Dashboard"` and back retains the user's choice.

- [ ] **Step 3: Wire `cashflow_utils` functions into `render_cf_income`, `render_cf_committed`, `render_cf_variable`, and `render_cf_savings` (`app.py:1536-1675`)**

Use `escape_markdown(cat)` and `escape_markdown(m)` in `st.markdown` and `st.caption`, call the `compute_*_breakdown` helpers from `cashflow_utils`, and shorten the mobile tab labels to `["💰 Income", "🔒 Bills", "🍕 Variable", "🏦 Savings"]`.

- [ ] **Step 4: Run pytest and ruff check**

Run: `./venv/bin/ruff check .` and `./venv/bin/pytest -v`
Expected: `All checks passed!` and all tests pass.

---

### Task 3: Add `.git-blame-ignore-revs` and Clean Up Review Report (LOW-3)

**Files:**
- Create: `.git-blame-ignore-revs`
- Modify: `UK_Expense_Tracker_DIFFERENTIAL_REVIEW_2026-10-10.md`

- [ ] **Step 1: Create `.git-blame-ignore-revs` with `df3ddc8aa7de601619a3874ca1414002a988722e`**
- [ ] **Step 2: Verify `git blame --ignore-revs-file .git-blame-ignore-revs app.py` works cleanly**
- [ ] **Step 3: Run full verification suite (`ruff check`, `ruff format --check`, `pytest`)**

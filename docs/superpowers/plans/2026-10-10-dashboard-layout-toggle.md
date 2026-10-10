# Fix Dashboard Breakdown Layout Toggle (Option A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a clean view toggle ("Layout: 🖥️ Desktop (Grid) vs. 📱 Mobile (Tabs)") for the Detailed Cash Flow Breakdown section on the Dashboard page, defaulting to 🖥️ Desktop (Grid), so desktop users enjoy the full 4-column overview while mobile users can switch to full-width tabs on demand.

**Architecture:**
1. Extract the 4 sections of the cashflow breakdown (Income, Committed, Variable, Savings) into helper renderer functions so both Grid mode (`st.columns(4)`) and Tab mode (`st.tabs(...)`) share the exact same clean logic without code duplication.
2. Add a layout mode radio button toggle (`dash_cf_layout`) right above or beside the section header, defaulting to `"🖥️ Grid (Desktop)"`.
3. If `"🖥️ Grid (Desktop)"` is selected, render via `st.columns(4)`.
4. If `"📱 Tabs (Mobile)"` is selected, render via `st.tabs(...)`.

**Tech Stack:** Python, Streamlit, Pandas.

## Global Constraints
- PEP 8 formatting and clean Ruff linter checks.
- Differential review must be run before commit.
- Verification before completion.

---

### Task 1: Implement Grid vs Tabs Toggle in app.py

**Files:**
- Modify: `app.py:1520-1640`
- Test: `tests/test_basic.py`

- [ ] **Step 1: Write helper renderers for the 4 cash flow categories to avoid duplication**
- [ ] **Step 2: Add `st.radio` toggle for `[ "🖥️ Grid (Desktop)", "📱 Tabs (Mobile)" ]`**
- [ ] **Step 3: Render either in 4 columns or 4 tabs based on toggle value**
- [ ] **Step 4: Verify with pytest and ruff check**

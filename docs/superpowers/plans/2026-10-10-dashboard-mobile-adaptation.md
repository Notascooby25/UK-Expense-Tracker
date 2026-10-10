# Dashboard Mobile Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the UK Expense Tracker Dashboard page for mobile screens, replacing squeezed 4-column layouts with responsive tabs for Detailed Cash Flow Breakdown and ensuring full legibility across devices.

**Architecture:**
1. Use `st.tabs` for the 4 cash flow breakdown sections (💰 Income Streams, 🔒 Committed Bills, 🍕 Variable Spend, 🏦 Savings & Transfers) so each section occupies the full screen width with un-truncated table values.
2. Injected responsive CSS ensures metrics, charts, and tables display cleanly without awkward clipping on mobile viewports while preserving desktop wide layout.

**Tech Stack:** Streamlit, Python, Pandas, CSS.

**Spec:** Responsive layout redesign for Dashboard view.

## Global Constraints
- PEP 8 formatting and clean Ruff linter checks.
- Do not break existing data calculations or session state persistence.
- Differential review must be run before commit.

## Review Focus
- Category names and currency figures in tables must be completely legible on mobile screens without ellipsis truncation.
- Drill-down selector and companion tables remain fully accessible.
- Tab selection works seamlessly across browser reruns and filters.

---

### Task 1: Refactor Detailed Cash Flow Breakdown to use Tabs

**Files:**
- Modify: `app.py:1120-1198`
- Test: `tests/test_basic.py`

**Interfaces:**
- Consumes: `df_v` filtered DataFrame and `months_in_period`.
- Produces: `st.tabs(["💰 Income Streams", "🔒 Committed Bills", "🍕 Variable Spend", "🏦 Savings & Transfers"])` container.

- [ ] **Step 1: Write a unit test ensuring cashflow breakdown data functions remain consistent**
- [ ] **Step 2: Run pytest to verify test passes**
- [ ] **Step 3: Update `app.py` replacing `st.columns(4)` with `st.tabs(...)` in the Cash Flow Breakdown section**
- [ ] **Step 4: Add responsive container styling for data tables within tabs**
- [ ] **Step 5: Run ruff check and pytest to verify syntax, style, and behavior**

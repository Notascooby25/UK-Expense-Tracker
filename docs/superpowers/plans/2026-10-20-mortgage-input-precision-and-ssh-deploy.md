# Mortgage Input Precision Fix & NUC SSH Auto-Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow exact figures (including pence) for all mortgage balance, payment, and overpayment inputs and displays, and configure automated NUC deployment over SSH via GitHub Actions.

**Architecture:**
- **Frontend Input & Display Precision**: Switch modal form states in `MortgagePage.tsx` from raw numbers to string state while editing (preventing React from stripping decimal points), set input `step="0.01"`, format currency displays with two decimal places (`£X,XXX.XX`), and provide intuitive Years + Months term selectors.
- **CI/CD Deployment Job**: Add an automated `deploy` job in `.github/workflows/publish-ghcr.yml` using `appleboy/ssh-action` guarded by `secrets.NUC_HOST != '' && secrets.NUC_SSH_KEY != ''` so pushing to `main` immediately updates the NUC container stack without manual SSH intervention.
- **Versioning**: Increment `APP_VERSION` to `0.7.1` in `backend/changelog.py` and `frontend/package.json`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, GitHub Actions, Appleboy SSH Action, FastAPI.

## Global Constraints
- Do not edit `.git/`, `venv/`, or runtime data files in `data/`.
- Run frontend build (`npm --prefix frontend run build`), backend linter (`./venv/bin/ruff check .`), and tests (`./venv/bin/pytest`).
- Perform differential review before final push.

---

### Task 1: Fix Mortgage Number Precision & Input UX in Frontend

**Files:**
- Modify: `frontend/src/pages/MortgagePage.tsx`

**Root Causes Addressed:**
1. HTML5 `<input type="number">` had restrictive `step="1000"`, `step="100"`, and `step="1"` attributes that rejected or rounded decimals.
2. React state storing raw numbers immediately converts `"150000."` to `150000` during typing, erasing the decimal point before pence could be typed.
3. `formatCurrency` was configured with `maximumFractionDigits: 0`, rounding all displayed figures to whole pounds.

**Steps:**
- [ ] **Step 1: Update form state to handle string inputs during editing**
  Ensure modal inputs maintain string values so typing `.` and decimal values works without interruption.
- [ ] **Step 2: Configure `step="0.01"` and `min="0.01"` across all currency inputs**
  Set `step="0.01"` on original balance, current balance, interest rate, monthly payment, overpayment amount, and lump sum simulator inputs.
- [ ] **Step 3: Update `formatCurrency` to display two decimal places**
  Verify `formatCurrency` uses `minimumFractionDigits: 2, maximumFractionDigits: 2`.
- [ ] **Step 4: Verify frontend build compiles without errors**
  Run: `npm --prefix frontend run build`

---

### Task 2: Configure Automated SSH Deployment in GitHub Actions (Option 1)

**Files:**
- Modify: `.github/workflows/publish-ghcr.yml`

**Steps:**
- [ ] **Step 1: Add `deploy` job to `.github/workflows/publish-ghcr.yml`**
  Add a job dependent on `publish` that connects to the NUC using `appleboy/ssh-action@v1.2.0` and runs:
  ```bash
  cd ${{ secrets.NUC_DEPLOY_PATH || '~/expense_tracker' }}
  docker pull ghcr.io/notascooby25/uk-expense-tracker-web:latest
  docker pull ghcr.io/notascooby25/uk-expense-tracker:latest
  docker compose -f docker-compose.prod.yml up -d
  ```
  Guard with `if: ${{ secrets.NUC_HOST != '' && secrets.NUC_SSH_KEY != '' }}` so builds succeed even before the user inputs GitHub secrets.
- [ ] **Step 2: Verify YAML syntax and workflow validity**

---

### Task 3: Version Bump, Verification, Differential Review, and Push

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

**Steps:**
- [ ] **Step 1: Bump version to `0.7.1` in `backend/changelog.py` and `frontend/package.json`**
  Document the exact input precision fix and GitHub Actions SSH auto-deployment.
- [ ] **Step 2: Run linter and tests**
  Run: `./venv/bin/ruff check .`
  Run: `./venv/bin/pytest`
- [ ] **Step 3: Run differential security review**
  Review git diff for any potential risks or regressions.
- [ ] **Step 4: Commit and push to `origin/main`**
- [ ] **Step 5: Provide plain English summary and GitHub secrets setup instructions to the user**

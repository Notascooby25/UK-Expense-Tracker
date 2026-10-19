# Loan Tracking & True Net Worth in Wealth Tab Design

**Date:** 2026-10-19
**Status:** Approved for Implementation

## 1. Intent & Why
The user recently took out a personal loan from Monzo. Currently, the Wealth tab (`WealthPage.tsx`) tracks only positive asset balances (e.g. Trading 212 ISAs, savings pots, crypto) and sums them up as "Total Net Worth".

Because debt is not tracked against assets, the reported "Total Net Worth" gives an inflated picture of personal wealth while a loan is active. The user wants to:
1. Track the outstanding loan balance directly within the Wealth tab.
2. Display a dedicated, matching KPI card for "Outstanding Loan" underneath or alongside Total Net Worth with a visual payoff progress indicator.
3. Factor the loan liability into the headline Net Worth calculation (`Net Worth = Assets - Liabilities`) with a clear breakdown (`Total Assets: £X — Debt: £Y`).
4. Allow logging and updating the loan balance on specific dates via the Wealth Balance Logger and Edit History modal.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Liabilities / Loan Data Storage:** Support storing loan debts and balances by date (`debts.json` and `debts_joint.json`) with backward compatibility when no debts exist.
- **Accurate Net Worth Calculation:** Update backend analytics and frontend state so Net Worth equals Total Assets minus Total Outstanding Debt for any given date snapshot.
- **Dedicated Outstanding Loan Card:** Display a styled card matching the app's aesthetic showing the current loan balance, original loan amount, amount repaid, and percentage progress bar.
- **Dual Wealth Logger:** In the Wealth Balance Logger, allow the user to record/update both asset balances and loan/debt balances for the selected snapshot date.
- **History & Account Management:** Allow editing/deleting debt snapshots and managing (renaming/deleting) loan accounts in the Edit History popup modal.
- **Streamlit Parity & Resilience:** Ensure backend API and Streamlit app (`app.py`) handle `debts.json` gracefully without crashing if the file is absent.

### Non-Goals
- Automated amortization schedule calculators (interest compounding, variable rates, APR calculations). The user will simply log the actual balance reported by Monzo.
- Changing transaction cash-flow categorization. Cash flow rules (e.g., tagging monthly direct debits as `Loan Repayment` committed bills, and initial deposit as `Transfers`) remain user transaction workflow conventions.

### Anti-Goals
- Breaking existing `assets.json` structures or requiring migrations that could corrupt user savings data.
- Cluttering the UI when a user has no active loans. If total debt is £0 or unconfigured, the layout should gracefully fall back to assets-only net worth.

---

## 3. Constraints
- **Platform & Stack:** Python (FastAPI backend + Streamlit app), React / TypeScript / Tailwind CSS / Recharts frontend, local JSON flat files.
- **Scoped Storage:** Support both `Personal` and `Joint` scopes (`debts.json` vs `debts_joint.json`).
- **Security & Permissions:** Run under existing `require_auth` session token protection. Sanitize and validate all user inputs.
- **Mobile-First UX:** Cards must stack seamlessly on narrow mobile viewports (e.g., 360–400px width) matching the provided mobile UI screenshot.

---

## 4. Architectural & Implementation Decisions

### 4.1 Data Storage (`backend/storage.py`)
- Define `debts.json` (and `debts_joint.json`) resolved via `resolve_scope_paths(scope)`:
  ```json
  {
    "loans": {
      "Monzo Loan": {
        "original_amount": 5000.0
      }
    },
    "balances": {
      "2026-10-18": {
        "Monzo Loan": 4850.0
      }
    }
  }
  ```
- If `original_amount` is not explicitly set, default it to the maximum recorded balance in `balances` for that loan.
- Provide atomic read/write helpers: `load_debts(scope: str) -> dict` and `save_debts(scope: str, debts: dict) -> None`.

### 4.2 Backend Analytics & Timeline Alignment (`backend/analytics.py`)
- **Forward-Fill Timeline Alignment:** When calculating `net_worth_series` across dates where assets and debts might have been recorded on different days, carry forward the latest known balance of each asset and loan. This prevents sudden false £0 swings if a user records a loan update on the 18th and asset balances on the 31st.
- `build_wealth_data(df, assets_data, debts_data, ...)`:
  - Calculate `total_assets = sum(latest_assets.values())`
  - Calculate `total_debts = sum(latest_debts.values())`
  - `net_worth = total_assets - total_debts`
  - Include `latest_debts`, `total_debt`, `latest_assets_total`, `loans_summary` (original amount, remaining balance, repaid amount, % repaid) in the returned payload.
  - In `net_worth_series`, provide `assets`, `debts`, and `net_worth` per snapshot date.

### 4.3 Backend API Endpoints & Safe Deletion (`backend/main.py`)
- `GET /api/wealth`: Returns updated `WealthPayload` including assets, debts, and net worth calculations.
- `POST /api/wealth/balances`: Accepts `asset_balances` and `debt_balances` for the snapshot date, along with optional `loan_metadata`. Supports partial saving without overwriting other accounts.
- `DELETE /api/wealth/balances/{date}`: Accepts an optional query parameter `target=assets|debts|all` (defaults to `all`). When deleting a debt snapshot in the debts tab, `target=debts` ensures the asset snapshot for that same date is preserved intact.
- `POST /api/wealth/accounts`: Allows managing/renaming/deleting accounts in either assets or debts (`account_type="asset"|"debt"`).

### 4.4 Frontend UI (`frontend/src/pages/WealthPage.tsx`)
1. **Headline Metric Cards (`grid-cols-1 md:grid-cols-4` or stacked on mobile):**
   - **Total Net Worth:** Displays true net worth (`£ Assets - £ Debt`). Subtitle shows `Total Assets: £X — Debt: £Y`.
   - **Outstanding Loan (Shown when debts exist):** Styled in slate container with warm accent for the balance. Shows `£4,850.00`, a progress bar, and subtitle `Original: £5,000 • Repaid: £150 (3%)`. If multiple loans exist, aggregates to total debt with percentage repaid.
   - **Monthly Change:** Delta vs previous recorded snapshot.
   - **Accounts Tracked:** Count of active asset and debt accounts.
2. **Wealth Balance Logger:**
   - Section for **Assets** (existing input list).
   - Section for **Debts & Loans** with inputs for loan balances, plus an option to set or update the original loan amount.
3. **Edit History Modal:**
   - Sub-sections or tabs for managing recorded date balances for both assets and debts safely.

### 4.5 Versioning & Changelog
- Bump `APP_VERSION` to `0.6.6` in `backend/changelog.py` and `frontend/package.json`.
- Add release notes for `v0.6.6` detailing personal loan & liability tracking in the Wealth tab.

---

## 5. Architectural Calls Made
- **Carry-forward Timeline:** Timeline calculations will forward-fill the last known asset and debt values across chronological snapshot dates to ensure the net worth graph remains smooth.
- **Granular Deletion:** Deleting a loan entry on a date will never accidentally wipe out the asset balances recorded on that same date.
- **Rollup Card with Details:** If multiple loans are ever added, the KPI card rolls them up cleanly into an overall debt card with total progress, while individual loans are listed in the logger.
- **Primary UI & Resilience:** All UI enhancements target the React app (`WealthPage.tsx`), while `app.py` is verified to handle the new debt schema safely.

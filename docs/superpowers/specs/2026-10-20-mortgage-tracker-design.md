# Design Document: Mortgage Tracker & Overpayment Simulator (UK Finance Tracker)

**Date:** 2026-10-20
**Status:** In Review
**Topic:** Mortgage Tracker, Overpayment Calculator & Trajectory Graph, App Rebranding

---

## 1. Intent & Context

The user wants a dedicated, hassle-free way to manage their mortgage and explore overpayment scenarios within their tracker application. Currently, checking mortgage payoff options requires entering loan balances, rates, and terms repeatedly into external calculators.

Furthermore, because household bills are split in the user's personal setup, mortgage payments and overpayments do not tally with day-to-day expense transactions and must remain strictly isolated.

With the addition of expenses, net worth/wealth tracking, and now mortgages, the app is also being rebranded from **UK Expense Tracker** to **UK Finance Tracker** to better represent the complete personal finance hub.

---

## 2. Goals & Success Criteria

1. **Saved Mortgage Profile**:
   - Persistently store core mortgage parameters per account scope (Personal vs Joint): Current Balance, Interest Rate (%), Standard Monthly Payment (£), Remaining Term (Years & Months), and Fixed-Rate Deal Expiry Date.
   - **Mortgage Type Selector**: Includes "Fixed Rate" (active v1 implementation) and "Variable Rate" (reserved for future enhancement).
   - **Fixed-Term Automated Pre-population**: For the duration of the fixed rate deal (e.g. 2, 3, or 5-year fixed offer), the schedule automatically pre-populates and advances month-to-month based on the known fixed rate and monthly payment, eliminating manual entry for regular monthly payments.
   - Clean profile editor modal/card to update details when remortgaging, with ability to adjust the balance at any point against a lender statement.
   - Fixed-rate deal expiration badge showing countdown in months/days, signaling when to shop for a new rate.

2. **Interactive Overpayment Simulator & Calculator**:
   - Dynamic simulation controls:
     - Monthly ongoing overpayment input/slider (e.g., +£25 to +£1,000/mo).
     - One-off lump sum overpayment field (e.g., +£2,000 bonus).
   - Instant calculation outputs:
     - Exact time shaved off the mortgage (e.g., "3 years 8 months earlier").
     - Total interest saved over the life of the loan (e.g., "£18,450 saved").
     - New mortgage-free milestone date.
   - UK 10% annual allowance helper: displays standard penalty-free overpayment limit based on current balance.

3. **Payoff Trajectory Graph (Visual Comparison)**:
   - Interactive line/area chart built with Recharts comparing two paths:
     - **Standard Course**: Remaining balance over time without overpayments.
     - **Accelerated Course (With Overpayments)**: Accelerated balance payoff line declining to £0 earlier.
   - Tooltip displaying projected balances at any given year.
   - Visual milestone markers for the early payoff point and current deal expiry.

4. **Dedicated Overpayment History Log**:
   - Ability to record actual overpayments made: Date, Type (Monthly regular or Lump sum), Amount (£), Notes.
   - Automatically updates remaining mortgage balance upon recording.
   - Independent history table with ability to edit or delete logged overpayments.

5. **App Rebranding & Navigation**:
   - Rebrand header and titles across the app from "UK Expense Tracker" to "UK Finance Tracker".
   - Add a top-level **Mortgage** navigation tab in `TopNav.tsx` with a fitting icon (`Home` / `Landmark`).

---

## 3. Non-Goals & Anti-Goals

- **No Expense Database Coupling**: Do NOT mix mortgage overpayment entries into `expense_database.csv`. The user's bills are split and do not match the raw mortgage ledger.
- **No Complex Multi-Part Tiered Rates**: Standard fixed-rate repayment mortgage calculation is the primary focus; complex split-tier tracker/offset multi-sub-account mortgages are out of scope for v1.
- **No Disruption to Existing Services**: Do not modify existing transaction categorization, wealth asset tracking, or authentication logic.

---

## 4. Architectural & Data Model Design

### Data Storage (`data/mortgage_data.json`)
Mortgage data is stored in a clean JSON structure partitioned by account scope (`Personal` and `Joint`):

```json
{
  "Joint": {
    "profile": {
      "original_balance": 240000.0,
      "current_balance": 214500.0,
      "interest_rate": 4.25,
      "monthly_payment": 1180.0,
      "remaining_term_months": 268,
      "deal_expiry_date": "2027-08-31",
      "updated_at": "2026-10-20T11:00:00Z"
    },
    "overpayments": [
      {
        "id": "op_01",
        "date": "2026-10-15",
        "amount": 150.0,
        "type": "monthly",
        "notes": "Regular monthly standing order overpayment"
      }
    ]
  },
  "Personal": {
    "profile": null,
    "overpayments": []
  }
}
```

### Backend API Endpoints (FastAPI)
- `GET /api/mortgage?scope=Joint` — Retrieves mortgage profile, overpayments list, and precalculated summary.
- `POST /api/mortgage/profile` — Upserts the mortgage profile for the given scope.
- `POST /api/mortgage/overpayments` — Adds a new overpayment record and decrements `current_balance`.
- `DELETE /api/mortgage/overpayments/{id}` — Removes an overpayment record and restores the balance.
- `POST /api/mortgage/calculate` — Helper endpoint (or pure frontend utility) calculating amortization schedules:
  - Standard monthly repayment: $M = P \frac{r(1+r)^n}{(1+r)^n - 1}$
  - Simulation loop projecting year-by-year remaining balances with and without extra payments.

### Frontend Component Architecture (React + Vite + Tailwind + Lucide)
- `frontend/src/pages/MortgagePage.tsx`: Main page layout containing:
  - **MortgageProfileCard**: Key stats, rate, term countdown, deal expiry badge, and "Edit Details" modal.
  - **OverpaymentCalculatorCard**: Monthly overpayment slider, lump-sum input, time saved, and interest saved KPIs.
  - **MortgageTrajectoryChart**: Recharts LineChart comparing standard vs overpayment balance curves over time.
  - **OverpaymentLogCard**: Data table of logged overpayments with "Add Overpayment" modal and delete action.
- `frontend/src/components/TopNav.tsx`: Updated with `UK Finance Tracker` branding and `Mortgage` navigation tab.

---

## 5. Architectural Decisions & Calculation Engine (Builder Review Calls)

1. **Term Reduction (Shaving Years Off)**:
   - As requested, all overpayment calculations and simulations operate under the **Term Reduction** model: standard monthly payments remain the same, while extra payments directly reduce principal and shorten the total mortgage term.

2. **Payoff Trajectory Graph Scope (Forward-Looking Simulation)**:
   - The trajectory graph and simulator project forward from today's `current_balance` over the `remaining_term_months`.
   - Compares:
     - **Baseline Curve (Blue)**: Paying standard monthly payments with £0 extra until the original payoff date.
     - **Accelerated Curve (Green)**: Applying the simulated monthly overpayment and/or lump sum, visually curving down to £0 years earlier.
   - The interest rate is modeled flat across the remaining term to isolate the exact savings from overpaying, while the fixed-rate deal expiry date is rendered as a distinct vertical milestone on the chart.

3. **10% Annual Allowance Display**:
   - Informational helper displaying the 10% penalty-free annual limit ($10\% \times \text{balance}$) alongside a lightweight progress bar of total overpayments logged in the current calendar year.

4. **Overpayment Log Semantics**:
   - The log records discrete payment events (date, type, amount, notes) so you have an exact record of real payments made.

---

## 6. What's Left to the Builder

- Exact layout details and responsive styling adhering to the Impeccable skill standards (polished dark/light mode tokens, proper spacing, accessible contrast).
- Amortization calculation engine: implemented both in backend Python (for unit-tested verification) and in frontend TypeScript (for instant, zero-latency slider updates).
- Unit and integration tests covering mortgage calculation edge cases (e.g., zero interest rate, overpayment exceeding remaining balance, deal expiry date in the past).
- Changelog entry and version bump per `GEMINI.md`.

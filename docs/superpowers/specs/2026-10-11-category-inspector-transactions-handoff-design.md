# Category Inspector Inline Edit & Transactions Time-Period Handoff Design

## Intent & Why
When inspecting a category on the Dashboard (for example, clicking **Entertainment** while viewing a single month or year), the Category Inspector displays only the transactions for the selected Dashboard time period. Previously:
1. Users could not change a transaction's category directly inside the Category Inspector table on the Dashboard.
2. Clicking **Open in Transactions Editor** only passed the category name (`Entertainment`) to the Transactions page, leaving all time filters reset (`All` financial years, empty date range), which displayed every transaction in that category across all history and forced the user to manually search for the transaction they were just looking at.

## Goals
1. **Inline Category Editing in Dashboard Category Inspector**:
   - Add a `Category` dropdown column to the transactions table inside the Dashboard's Category Inspector.
   - Changing a transaction's category immediately persists via `PATCH /api/transactions/{row_id}` and refreshes the Dashboard metrics, breakdowns, and Category Inspector.
2. **Time-Period & Bank Handoff to Transactions Editor**:
   - Clicking **Open in Transactions Editor** passes not only `category`, but also the active Dashboard time period (`financial_year`, `date_from`, `date_to`, and optional `months` when non-contiguous months are selected) and `bank` filter to `TransactionsPage`.
   - `TransactionsPage` initializes and synchronizes its filter controls (`category`, `bank`, `financialYear`, `dateFrom`, `dateTo`, and `months` if applicable) from this handoff object so only transactions matching the inspected period are shown.
   - Clicking **Reset Filters** on `TransactionsPage` clears all pre-filled filters (including any month filter) back to default all-time view.

## Non-Goals
- Full inline editing of every field (Date, Merchant, Amount, Notes, Delete) inside the compact Dashboard Category Inspector preview table — only `Category` is editable inline there; full row editing remains in the Transactions Editor.
- Changing how standalone navigation via the top navbar `Transactions` tab works when not triggered from the Dashboard drill-down.

## Constraints
- Preserve PEP 8 and Ruff formatting on Python backend files (`./venv/bin/ruff check .`, `./venv/bin/ruff format .`).
- Preserve TypeScript strict typing in `frontend/src/`.
- Never modify runtime data files in `data/`.

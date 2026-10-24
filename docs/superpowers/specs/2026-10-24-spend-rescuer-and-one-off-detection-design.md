# Design Document: Automated Spend Rescuer & One-Off Expense Detection

- **Date:** 2026-10-24
- **Topic:** Automated helper for identifying one-off spikes, rescuing monthly spend, and flagging discretionary leaks
- **Status:** Ready for Approval

---

## 1. Intent and Context

The user needs to reduce monthly spending and gain clarity on where money is actually leaking. A major challenge in tracking day-to-day spending is that occasional large, irregular expenses (such as buying a replacement phone for £600 after a breakage, or buying materials for a home DIY project) are filed under routine categories (like `Shopping` or `Home`).

Currently, the application only supports excluding entire categories from monthly averages (via `exceptional_categories` in `settings.json`). As a result, when an essential one-off purchase is made in a normal category, it inflates that category and the entire monthly living run-rate, creating false alarms and obscuring true day-to-day lifestyle spending. Furthermore, credit card purchases (e.g., Barclaycard payments cleared and split via Monzo) often contain these one-offs without immediate tagging.

This project introduces:
1. **Transaction-level Exceptional / One-Off tagging** (`Is_Exceptional` flag on individual transactions).
2. **Automated Spike & One-Off Detection** in the Intelligence audit suite to spot large, out-of-character expenses and offer 1-click classification.
3. **Time Horizon Selector** for the Spike Detector (defaulting to the current year 2026, with options to review 2025, 2024, or All Time for historical baseline cleanup).
4. **Automated Spend Rescuer Insights** to highlight controllable recurring leaks (e.g., daily coffees, frequent takeaways) and creeping category spend.
5. **Interactive UI integrations** across the Transactions table, Intelligence page, and Dashboard.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Transaction-Level Tagging:** Allow any individual transaction to be flagged as `Is_Exceptional` (one-off / project spend), regardless of its category.
- **Backward-Compatible Storage & Dual-App Safety:**
  - Update CSV schema handling in `backend/storage.py` and defensively update `COLS` in `app.py` so that transactions loaded and saved in either app always preserve the `Is_Exceptional` column without silent data loss.
- **Configurable Time Horizon for Spike Detection:**
  - Provide a time period dropdown/selector in Intelligence (options: *Current Year (2026)*, *Last 6 Months*, *Last 12 Months*, *2025*, *2024*, *All Time*) defaulting to 2026.
- **Automated Spike Detection:**
  - Scan variable spending categories (e.g., `Shopping`, `Home`, `General`, `Holiday`, etc.) within the selected time horizon for transactions that significantly exceed typical spend thresholds (e.g., >£150 and >2.5x the category median) that are not yet marked as `Is_Exceptional`.
- **1-Click Intelligence Actions:**
  - *“Mark as One-Off”*: Sets `Is_Exceptional = True` on the target transaction.
  - *“Keep Regular”*: Adds the transaction's deterministic signature (`date|name|amount`) to ignored candidates so it won't prompt again.
- **Spend Rescuer Recommendations:**
  - **Frequent Small Leaks (Habit Grouping):** Group recurring discretionary spending by lifestyle themes (*Coffee & Cafes*, *Takeaways & Fast Food*, *Convenience & Snacks*) requiring at least 3 transactions in the active period to filter out one-off noise, showing monthly average + annualized cost (e.g., *"£75/mo on coffee = £900/year"*).
  - **Category Creep Alerts:** Flag non-committed categories where the last 3 completed months have grown by >20% versus the preceding 6-month baseline (avoiding mid-month prorating distortion).
- **Dashboard Run-Rate Purity:**
  - Ensure the Dashboard's "Exclude Exceptional Spend" toggle removes both category-level exceptional items AND rows where `Is_Exceptional == True`.
  - The callout banner summarizes total one-offs excluded with an action to inspect them pre-filtered in the Transactions Editor.
- **Transactions Editor Support:**
  - Add a clear `One-Off` toggle/badge directly in the Transactions table in the React web frontend (and Streamlit editor) for easy manual tagging during routine reviews.

### Non-Goals
- Automated direct bank sync or Open Banking scraping (app strictly maintains its local flat-file Monzo/Barclaycard CSV workflow).
- Automatically modifying transaction amounts or deleting rows (transactions remain fully preserved for net worth and audit trails).
- Hard budget enforcement or blocking transactions.

### Anti-Goals
- **Alert Spam:** Do not flag regular committed bills (e.g. Mortgage, Council Tax, Energy, Insurance) as one-off spikes.
- **Data Corruption:** Zero risk of CSV schema mismatch, data loss during atomic save, or silent overwrite of untagged rows.
- **Clutter on Mobile:** Ensure intelligence prompts and table toggles remain clean and thumb-friendly on mobile screens.

---

## 3. User Experience & Workflow

### 3.1 Transactions Editor (`TransactionsPage.tsx`)
- A new column and toggle badge `One-Off` appears alongside `Subscription`.
- Clicking the toggle switches the transaction between Regular and One-Off (`Is_Exceptional`).
- An orange/amber pill badge indicates an exceptional one-off transaction.
- When navigating from the Dashboard's "Inspect One-Offs" banner, the table automatically filters to show only transactions where `Is_Exceptional == True`.

### 3.2 Intelligence & Auditing Page (`IntelligencePage.tsx`)
A new top-level section: **Spend Helper & One-Off Audit**:
1. **Time Horizon Selector:**
   - Dropdown or pill selector: `Current Year (2026)` (default), `Last 6 Months`, `Last 12 Months`, `2025`, `2024`, `All Time`.
2. **Spike & One-Off Candidates:**
   - Cards showing detected anomalies in the chosen period: e.g. *“Currys — £549.00 (Shopping, 12 Oct) — Unusually high for this category”*.
   - Action buttons:
     - `Mark as One-Off`: Flags the transaction as `Is_Exceptional = True`.
     - `Keep Regular`: Dismisses the candidate using its unique signature (`date|name|amount`).
3. **Monthly Spend Rescuer (Savings Opportunities):**
   - **Discretionary Habit Highlights:** Grouped recurring non-subscription spends (e.g. *Coffee & Cafes*, *Takeaways & Fast Food*) showing frequency, monthly average, and projected annual savings if reduced by 25% or 50%.
   - **Spend Creep Warnings:** Notifications when a variable category (e.g. Groceries or Dining Out) has increased significantly in the last 3 completed months compared to the prior 6-month baseline.

### 3.3 Dashboard Page (`DashboardPage.tsx`)
- When `Exclude Exceptional Spend` is enabled in the filter bar, transactions flagged with `Is_Exceptional == True` are automatically filtered out from the monthly spend metrics, run rates, and category distribution charts.
- The exceptional spend banner at the top of the dashboard displays both category-level and individual one-off items:
  - *“Excluded £650.00 in one-off project / replacement costs this month (e.g. Currys £549.00)”*.
  - An **"Inspect One-Offs"** button takes the user directly to the Transactions Editor with the `One-Off` filter applied.

---

## 4. Architecture & Technical Design

### 4.1 Data Layer (`backend/storage.py` and `app.py`)
- **Schema Update in `backend/storage.py`:** Add `Is_Exceptional` to standard `COLS`:
  ```python
  COLS = [
      "Date",
      "Name",
      "Amount",
      "Transaction_Type",
      "Bank",
      "Category",
      "Notes",
      "Financial_Year",
      "Is_Subscription",
      "Is_Exceptional",
  ]
  ```
- **Defensive Update in `app.py`:**
  - Update `COLS` in `app.py` to match, ensuring that saving or editing in the Streamlit app never drops `Is_Exceptional`.
- **Backward Compatibility:**
  - When loading CSV:
    ```python
    if "Is_Exceptional" not in df.columns:
        df["Is_Exceptional"] = False
    else:
        df["Is_Exceptional"] = df["Is_Exceptional"].fillna(False).astype(bool)
    ```
- **Settings Extensions in `settings.json`:**
  - `ignore_exceptional_candidates: list[str]` (storing stable composite signatures `f"{date}|{name}|{amount}"` of dismissed candidates).
  - `discretionary_leak_taxonomies: dict[str, list[str]]` with standard UK vendor keywords:
    - `"Coffee & Cafes"`: `["coffee", "cafe", "costa", "starbucks", "pret", "caffe", "nero"]`
    - `"Takeaways & Fast Food"`: `["deliveroo", "just eat", "ubereats", "mcdonald", "kfc", "greggs", "domino", "pizza"]`
    - `"Convenience & Snacks"`: `["co-op", "tesco express", "sainsbury's local", "spar", "whsmith"]`

### 4.2 Analytics Engine (`backend/analytics.py`)
1. **Prepare Filtered Dashboard DataFrame:**
   - In `prepare_filtered_dashboard_df`:
     ```python
     if bool(filters.get("exclude_exceptional", True)) and not df_v.empty:
         # Exclude whole exceptional categories
         if exceptional_cats:
             df_v = df_v[~df_v["Category"].isin(exceptional_cats)]
         # Exclude individual rows flagged Is_Exceptional
         if "Is_Exceptional" in df_v.columns:
             df_v = df_v[~df_v["Is_Exceptional"].astype(bool)]
     ```
   - Aggregate both category-level and individual one-off transactions into `exceptional_summary`.

2. **Spike Detection Logic (`build_intelligence_data`):**
   - Filter transactions based on the selected `horizon` parameter (e.g. `2026`, `2025`, `2024`, `last_6_months`, `all`).
   - Group by `Category` to calculate median and interquartile range (or standard deviation) of transaction amounts.
   - Flag transactions where:
     - `Is_Exceptional` is `False`.
     - Transaction amount > £150 (configurable) AND transaction amount > 2.5x category median.
     - Composite signature `f"{date}|{name}|{amount}"` not in `ignore_exceptional_candidates`.
   - Returns `one_off_candidates: list[dict[str, Any]]`.

3. **Spend Rescuer & Leak Detector (`build_intelligence_data`):**
   - Evaluates variable expense transactions across the active evaluation period.
   - Matches against `discretionary_leak_taxonomies`.
   - Filters out rare occurrences (requiring >= 3 transactions in the period).
   - Computes:
     - Habit group name, merchant list, total spend, monthly average, and annual projected savings if reduced by 25% or 50%.
   - Category Creep:
     - Compares the last 3 completed calendar months to the preceding 6 completed months.
     - Flags categories with >20% increase and absolute increase > £50/month.
   - Returns `spend_rescue_opportunities: list[dict[str, Any]]` and `category_creep_warnings: list[dict[str, Any]]`.

### 4.3 API Endpoints (`backend/main.py`)
- Extend `GET /api/intelligence` to accept `horizon: str = Query("2026")`.
  - Returns `one_off_candidates`, `spend_rescue_opportunities`, and `category_creep_warnings`.
- Extend `POST /api/intelligence/action`:
  - `action == "mark_one_off"`: Accepts `row_id` or transaction signature, sets `Is_Exceptional = True`, persists to disk.
  - `action == "dismiss_one_off"`: Accepts signature string `f"{date}|{name}|{amount}"`, appends to `ignore_exceptional_candidates` in settings.
- Extend `PATCH /api/transactions/{row_id}` and `POST /api/transactions/bulk`:
  - Support updating `Is_Exceptional: bool`.

### 4.4 Frontend Implementation (`frontend/src/`)
- **`types.ts`:**
  - Update `TransactionRow` interface to include `Is_Exceptional: boolean`.
  - Update `IntelligencePayload` to include `one_off_candidates`, `spend_rescue_opportunities`, and `category_creep_warnings`.
- **`TransactionsPage.tsx`:**
  - Add `One-Off` toggle column and filter toggle for viewing one-off transactions.
- **`IntelligencePage.tsx`:**
  - Add time horizon selector (`2026`, `2025`, `2024`, etc.).
  - Render **Spike & One-Off Candidates** card with 1-click `Mark as One-Off` and `Keep Regular` buttons.
  - Render **Monthly Spend Rescuer** card with grouped habit savings calculations and category creep alerts.
- **`DashboardPage.tsx`:**
  - Update Exceptional Spend Banner to link directly to the filtered Transactions Editor.

---

## 5. Security and Operational Standards

- **Differential Review:** Mandatory run before any commit.
- **Data Protection:** No personal financial transactions sent outside the local environment.
- **File System Safety:** Strict adherence to project-local paths (`BASE_DIR` / `data/`). No direct editing of production CSV outside atomic helpers.
- **Testing Requirements:**
  - Unit tests in `tests/test_storage.py` verifying backward-compatible schema reading and writing of `Is_Exceptional`.
  - Unit tests in `tests/test_analytics.py` verifying spike detection with horizons, habit grouping, and dashboard run-rate exclusion.
  - Ruff linting and formatting passing.

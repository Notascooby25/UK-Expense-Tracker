"""Analytics calculations for Dashboard, Category Drill-Down, Intelligence, and Wealth."""

from __future__ import annotations

import difflib
from typing import Any

import pandas as pd

from backend.storage import (
    INTERNAL_CATEGORIES,
    SMART_SUBSCRIPTION_KEYWORDS,
    TRUE_INCOME_CATEGORIES,
    clean_string,
    get_pure_monzo_categories,
)
from cashflow_utils import (
    compute_committed_breakdown,
    compute_income_breakdown,
    compute_savings_breakdown,
    compute_variable_breakdown,
)

ROLLING_OPTIONS = {
    "This Month": 1,
    "Last 3 Months": 3,
    "Last 6 Months": 6,
    "Last 12 Months": 12,
    "Last 18 Months": 18,
    "Last 2 Years": 24,
}


def assign_spend_type(row: pd.Series, committed_cats: set[str]) -> str:
    """Classify a transaction row into True Income, Refund, Committed/Variable Expense, or Internal."""
    cat = str(row.get("Category", "")).strip()
    if cat in INTERNAL_CATEGORIES:
        return "Internal Transfer"

    if row.get("Transaction_Type") == "Income":
        if cat not in TRUE_INCOME_CATEGORIES:
            if cat in committed_cats:
                return "Committed Refund"
            return "Variable Refund"
        return "True Income"

    if cat in committed_cats:
        return "Committed Expense"
    return "Variable Expense"


def prepare_filtered_dashboard_df(
    df: pd.DataFrame, settings: dict[str, Any], filters: dict[str, Any]
) -> tuple[pd.DataFrame, int, dict[str, list[str]]]:
    """Apply dashboard filters and return (filtered_df, months_in_period, available_options)."""
    if df.empty:
        return (
            pd.DataFrame(),
            1,
            {"financial_years": ["All"], "calendar_years": ["All"], "banks": ["All Banks"]},
        )

    df_v = df.copy()
    if "_row_id" not in df_v.columns:
        df_v["_row_id"] = df_v.index

    df_v["Category"] = df_v["Category"].astype(str).str.strip()
    df_v = df_v.sort_values("Date")
    df_v["Calendar_Year"] = df_v["Date"].dt.year.astype(str)
    df_v["Month_Year"] = df_v["Date"].dt.to_period("M").astype(str)

    ignore_legacy = bool(filters.get("ignore_legacy", True))
    if ignore_legacy:
        df_v = df_v[df_v["Date"] >= pd.Timestamp("2021-01-01")]

    committed_cats = set(settings.get("committed_categories", []))
    df_v["Spend_Type"] = (
        df_v.apply(lambda r: assign_spend_type(r, committed_cats), axis=1)
        if not df_v.empty
        else pd.Series(dtype=str)
    )

    available_fys = ["All"] + sorted(
        [str(x) for x in df_v["Financial_Year"].dropna().unique() if str(x).strip()]
    )
    available_cys = ["All"] + sorted(
        [str(x) for x in df_v["Calendar_Year"].dropna().unique() if str(x).strip()]
    )
    available_banks = ["All Banks"] + sorted(
        [str(x) for x in df_v["Bank"].dropna().unique() if str(x).strip()]
    )

    hide_internal = bool(filters.get("hide_internal", True))
    if hide_internal and not df_v.empty:
        cats_to_hide = [c for c in INTERNAL_CATEGORIES if c not in committed_cats]
        df_v = df_v[~df_v["Category"].isin(cats_to_hide)]

    net_spend_mode = bool(filters.get("net_spend_mode", False))
    if net_spend_mode and not df_v.empty:
        df_v = df_v[df_v["Transaction_Type"] == "Expense"]

    time_mode = str(filters.get("time_mode", "Financial Year"))
    selected_period = str(filters.get("selected_period", "All"))

    if time_mode == "Rolling Period":
        if selected_period == "This Month":
            now = pd.Timestamp.now().normalize()
            cutoff = now.replace(day=1)
            if not df_v.empty:
                df_v = df_v[df_v["Date"] >= cutoff]
        else:
            months_back = ROLLING_OPTIONS.get(selected_period, 3)
            cutoff = pd.Timestamp.now().normalize() - pd.DateOffset(months=months_back)
            if not df_v.empty:
                df_v = df_v[df_v["Date"] >= cutoff]
    else:
        target_col = "Calendar_Year" if time_mode == "Calendar Year" else "Financial_Year"
        if selected_period and selected_period != "All" and not df_v.empty:
            df_v = df_v[df_v[target_col] == selected_period]

    selected_bank = str(filters.get("bank", "All Banks"))
    if selected_bank and selected_bank not in {"All Banks", "All"} and not df_v.empty:
        df_v = df_v[df_v["Bank"] == selected_bank]

    selected_months = filters.get("months") or []
    if time_mode == "Calendar Year" and selected_months and not df_v.empty:
        df_v = df_v[
            df_v["Date"].dt.strftime("%B").isin(selected_months)
            | df_v["Date"].dt.strftime("%b").isin(selected_months)
        ]

    incl = filters.get("include_categories") or []
    if incl and not df_v.empty:
        df_v = df_v[df_v["Category"].isin(incl)]

    excl = filters.get("exclude_categories") or []
    if excl and not df_v.empty:
        df_v = df_v[~df_v["Category"].isin(excl)]

    if time_mode == "Rolling Period":
        months_in_period = int(
            ROLLING_OPTIONS.get(
                selected_period, max(1, df_v["Month_Year"].nunique() if not df_v.empty else 1)
            )
        )
    elif time_mode == "Calendar Year" and selected_months:
        months_in_period = int(max(1, len(selected_months)))
    else:
        months_in_period = int(max(1, df_v["Month_Year"].nunique() if not df_v.empty else 1))

    return (
        df_v,
        months_in_period,
        {
            "financial_years": available_fys,
            "calendar_years": available_cys,
            "banks": available_banks,
            "rolling_periods": list(ROLLING_OPTIONS.keys()),
        },
    )


def build_dashboard_data(
    df: pd.DataFrame, settings: dict[str, Any], filters: dict[str, Any]
) -> dict[str, Any]:
    """Compute complete Dashboard payload including KPIs, breakdowns, deltas, and charts."""
    df_v, months_in_period, filter_options = prepare_filtered_dashboard_df(df, settings, filters)

    if df_v.empty:
        return {
            "filter_options": filter_options,
            "metrics": {
                "total_income": 0.0,
                "committed_expenses": 0.0,
                "variable_expenses": 0.0,
                "net_expenses": 0.0,
                "net_flow": 0.0,
                "months_in_period": 1,
                "avg_income": 0.0,
                "avg_baseline": 0.0,
                "spare_cash": 0.0,
                "avg_monthly_spend": 0.0,
            },
            "recent_delta": None,
            "cashflow_breakdown": {
                "income_total": 0.0,
                "income": [],
                "committed_total": 0.0,
                "committed": [],
                "variable_total": 0.0,
                "variable": [],
                "savings": [],
            },
            "charts": {
                "monthly_cashflow": [],
                "cumulative_wealth": [],
                "top_categories": [],
                "top_merchants": [],
                "bank_category_breakdown": [],
            },
        }

    inc = float(df_v[df_v["Spend_Type"] == "True Income"]["Amount"].sum())
    gross_com = float(df_v[df_v["Spend_Type"] == "Committed Expense"]["Amount"].sum())
    gross_var = float(df_v[df_v["Spend_Type"] == "Variable Expense"]["Amount"].sum())
    ref_com = float(df_v[df_v["Spend_Type"] == "Committed Refund"]["Amount"].sum())
    ref_var = float(df_v[df_v["Spend_Type"] == "Variable Refund"]["Amount"].sum())

    exp_com = round(gross_com - ref_com, 2)
    exp_var = round(gross_var - ref_var, 2)
    exp_total = round(exp_com + exp_var, 2)

    avg_monthly = round(exp_total / months_in_period, 2)
    avg_baseline = round(exp_com / months_in_period, 2)
    avg_income = round(inc / months_in_period, 2)
    spare_cash = round(avg_income - avg_baseline, 2)

    # Recent month delta analysis
    recent_delta = None
    distinct_months = df_v["Month_Year"].nunique()
    if distinct_months >= 2:
        last_month = str(df_v["Month_Year"].max())
        df_last = df_v[df_v["Month_Year"] == last_month]
        df_prev = df_v[df_v["Month_Year"] != last_month]

        last_m_com = float(
            df_last[df_last["Spend_Type"] == "Committed Expense"]["Amount"].sum()
            - df_last[df_last["Spend_Type"] == "Committed Refund"]["Amount"].sum()
        )
        last_m_var = float(
            df_last[df_last["Spend_Type"] == "Variable Expense"]["Amount"].sum()
            - df_last[df_last["Spend_Type"] == "Variable Refund"]["Amount"].sum()
        )
        prev_m_count = max(1, df_prev["Month_Year"].nunique())
        avg_m_com = float(
            (
                df_prev[df_prev["Spend_Type"] == "Committed Expense"]["Amount"].sum()
                - df_prev[df_prev["Spend_Type"] == "Committed Refund"]["Amount"].sum()
            )
            / prev_m_count
        )
        avg_m_var = float(
            (
                df_prev[df_prev["Spend_Type"] == "Variable Expense"]["Amount"].sum()
                - df_prev[df_prev["Spend_Type"] == "Variable Refund"]["Amount"].sum()
            )
            / prev_m_count
        )
        recent_delta = {
            "month": last_month,
            "committed_actual": round(last_m_com, 2),
            "committed_avg": round(avg_m_com, 2),
            "committed_diff": round(last_m_com - avg_m_com, 2),
            "variable_actual": round(last_m_var, 2),
            "variable_avg": round(avg_m_var, 2),
            "variable_diff": round(last_m_var - avg_m_var, 2),
        }

    # Cashflow breakdown via cashflow_utils
    inc_total, inc_cats = compute_income_breakdown(df_v, months_in_period)
    com_df = compute_committed_breakdown(df_v, months_in_period)
    var_df = compute_variable_breakdown(df_v, months_in_period)
    sav_cats = compute_savings_breakdown(df_v, months_in_period)

    com_records = [
        {"category": str(r["Category"]), "avg_monthly": round(float(r["Avg P/M (£)"]), 2)}
        for _, r in com_df.iterrows()
    ]
    var_records = [
        {"category": str(r["Category"]), "avg_monthly": round(float(r["Avg P/M (£)"]), 2)}
        for _, r in var_df.iterrows()
    ]

    # Monthly cashflow chart series
    ms = (
        df_v.groupby(["Month_Year", "Spend_Type"])["Amount"]
        .sum()
        .unstack(fill_value=0)
        .reset_index()
    )
    for col in ("True Income", "Committed Expense", "Variable Expense"):
        if col not in ms.columns:
            ms[col] = 0.0
    monthly_cashflow = [
        {
            "month": str(r["Month_Year"]),
            "income": round(float(r["True Income"]), 2),
            "committed": round(float(r["Committed Expense"]), 2),
            "variable": round(float(r["Variable Expense"]), 2),
            "total_expense": round(float(r["Committed Expense"]) + float(r["Variable Expense"]), 2),
        }
        for _, r in ms.iterrows()
    ]

    # Cumulative wealth chart series
    daily_records = []
    for dt_val, grp in df_v.groupby("Date"):
        day_inc = float(grp[grp["Spend_Type"] == "True Income"]["Amount"].sum())
        day_exp = float(grp[grp["Spend_Type"].str.contains("Expense")]["Amount"].sum())
        daily_records.append({"date": dt_val.strftime("%Y-%m-%d"), "net": day_inc - day_exp})
    running = 0.0
    cumulative_wealth = []
    for item in daily_records:
        running = round(running + item["net"], 2)
        cumulative_wealth.append({"date": item["date"], "cumulative": running})

    # Top 10 Categories & Top 10 Merchants
    exp_only = df_v[df_v["Spend_Type"].str.contains("Expense")]
    top_cats_s = (
        exp_only.groupby("Category")["Amount"].sum().nlargest(10).reset_index()
        if not exp_only.empty
        else pd.DataFrame(columns=["Category", "Amount"])
    )
    top_merch_s = (
        exp_only.groupby("Name")["Amount"].sum().nlargest(10).reset_index()
        if not exp_only.empty
        else pd.DataFrame(columns=["Name", "Amount"])
    )

    # Bank > Category breakdown
    bank_cat_breakdown = []
    if not exp_only.empty:
        bc_grp = (
            exp_only.assign(
                Category=exp_only["Category"].replace("", "Uncategorized").fillna("Uncategorized")
            )
            .groupby(["Bank", "Category"])["Amount"]
            .sum()
            .reset_index()
        )
        for _, r in bc_grp[bc_grp["Amount"] > 0].sort_values("Amount", ascending=False).iterrows():
            bank_cat_breakdown.append(
                {
                    "bank": str(r["Bank"]),
                    "category": str(r["Category"]),
                    "amount": round(float(r["Amount"]), 2),
                }
            )

    return {
        "filter_options": filter_options,
        "metrics": {
            "total_income": round(inc, 2),
            "committed_expenses": exp_com,
            "variable_expenses": exp_var,
            "net_expenses": exp_total,
            "net_flow": round(inc - exp_total, 2),
            "months_in_period": months_in_period,
            "avg_income": avg_income,
            "avg_baseline": avg_baseline,
            "spare_cash": spare_cash,
            "avg_monthly_spend": avg_monthly,
        },
        "recent_delta": recent_delta,
        "cashflow_breakdown": {
            "income_total": round(float(inc_total), 2),
            "income": [
                {
                    "category": cat,
                    "avg_monthly": round(cat_sum, 2),
                    "merchants": [
                        {"name": m, "avg_monthly": round(val, 2)} for m, val in merchants
                    ],
                }
                for cat, cat_sum, merchants in inc_cats
            ],
            "committed_total": round(sum(x["avg_monthly"] for x in com_records), 2),
            "committed": com_records,
            "variable_total": round(sum(x["avg_monthly"] for x in var_records), 2),
            "variable": var_records,
            "savings": [
                {
                    "category": cat,
                    "avg_monthly": round(cat_net, 2),
                    "merchants": [
                        {"name": m, "avg_monthly": round(val, 2)} for m, val in merchants
                    ],
                }
                for cat, cat_net, merchants in sav_cats
            ],
        },
        "charts": {
            "monthly_cashflow": monthly_cashflow,
            "cumulative_wealth": cumulative_wealth,
            "top_categories": [
                {"category": str(r["Category"]), "amount": round(float(r["Amount"]), 2)}
                for _, r in top_cats_s.iterrows()
            ],
            "top_merchants": [
                {"merchant": str(r["Name"]), "amount": round(float(r["Amount"]), 2)}
                for _, r in top_merch_s.iterrows()
            ],
            "bank_category_breakdown": bank_cat_breakdown,
        },
    }


def build_category_drilldown(
    df: pd.DataFrame, settings: dict[str, Any], filters: dict[str, Any], category: str
) -> dict[str, Any]:
    """Compute merchant summary and individual transactions for a clicked category."""
    target = clean_string(category)
    drill_filters = dict(filters)
    if target in INTERNAL_CATEGORIES:
        drill_filters["hide_internal"] = False
    drill_filters["net_spend_mode"] = False

    df_v, months_in_period, _ = prepare_filtered_dashboard_df(df, settings, drill_filters)
    if df_v.empty or not target:
        return {
            "category": target,
            "total_expenditure": 0.0,
            "total_refunds": 0.0,
            "net_cost": 0.0,
            "monthly_average": 0.0,
            "merchants": [],
            "transactions": [],
        }

    drill_df = df_v[df_v["Category"] == target].copy()
    if drill_df.empty:
        return {
            "category": target,
            "total_expenditure": 0.0,
            "total_refunds": 0.0,
            "net_cost": 0.0,
            "monthly_average": 0.0,
            "merchants": [],
            "transactions": [],
        }

    cat_exp = float(drill_df[drill_df["Transaction_Type"] == "Expense"]["Amount"].sum())
    cat_inc = float(drill_df[drill_df["Transaction_Type"] == "Income"]["Amount"].sum())
    cat_net = round(cat_exp - cat_inc, 2)

    merch_drill = (
        drill_df.groupby(["Name", "Transaction_Type"])
        .agg(
            Total_Amount=("Amount", "sum"),
            Transactions=("Amount", "count"),
            Last_Date=("Date", "max"),
            Is_Subscription=("Is_Subscription", "any"),
        )
        .reset_index()
        .sort_values(by="Total_Amount", ascending=False)
    )

    merchants = [
        {
            "Name": str(r["Name"]),
            "Transaction_Type": str(r["Transaction_Type"]),
            "Total_Amount": round(float(r["Total_Amount"]), 2),
            "Transactions": int(r["Transactions"]),
            "Last_Date": r["Last_Date"].strftime("%d/%m/%Y") if pd.notna(r["Last_Date"]) else "",
            "Is_Subscription": bool(r["Is_Subscription"]),
        }
        for _, r in merch_drill.iterrows()
    ]

    tx_sorted = drill_df.sort_values(by="Date", ascending=False)
    transactions = [
        {
            "row_id": int(r["_row_id"]),
            "Date": r["Date"].strftime("%Y-%m-%d"),
            "Date_Display": r["Date"].strftime("%d/%m/%Y"),
            "Name": str(r["Name"]),
            "Amount": round(float(r["Amount"]), 2),
            "Transaction_Type": str(r["Transaction_Type"]),
            "Bank": str(r["Bank"]),
            "Category": str(r["Category"]),
            "Notes": str(r["Notes"]),
            "Is_Subscription": bool(r["Is_Subscription"]),
        }
        for _, r in tx_sorted.iterrows()
    ]

    return {
        "category": target,
        "total_expenditure": round(cat_exp, 2),
        "total_refunds": round(cat_inc, 2),
        "net_cost": cat_net,
        "monthly_average": round(cat_net / max(1, months_in_period), 2),
        "merchants": merchants,
        "transactions": transactions,
    }


def build_intelligence_data(df: pd.DataFrame, settings: dict[str, Any]) -> dict[str, Any]:
    """Run all three Intelligence scans (Recurring Bills, Unflagged Subscriptions, Category Cleanup)."""
    ignore_recurring = [str(x) for x in settings.get("ignore_recurring", [])]
    committed_cats = set(settings.get("committed_categories", []))
    recurring_candidates: list[dict[str, Any]] = []

    if not df.empty:
        df_exp = df[df["Transaction_Type"] == "Expense"].copy()
        if not df_exp.empty:
            df_exp["Month_Year"] = df_exp["Date"].dt.to_period("M")
            total_months = int(df_exp["Month_Year"].nunique())
            if total_months >= 2:
                merchant_stats = (
                    df_exp.groupby("Name")
                    .agg(
                        frequency=("Month_Year", "nunique"),
                        avg_amount=("Amount", "mean"),
                        std_amount=("Amount", "std"),
                        category=("Category", "first"),
                    )
                    .reset_index()
                )
                merchant_stats["std_amount"] = merchant_stats["std_amount"].fillna(0.0)

                for _, row in merchant_stats.iterrows():
                    m_name = str(row["Name"])
                    if not m_name or m_name in ignore_recurring:
                        continue
                    freq = int(row["frequency"])
                    avg_amt = float(row["avg_amount"])
                    std_amt = float(row["std_amount"])
                    freq_ratio = freq / total_months
                    cv = std_amt / avg_amt if avg_amt > 0 else 0.0
                    is_frequent = freq_ratio > 0.6 or (freq >= 3 and total_months >= 3)
                    is_stable = cv < 0.20
                    cat = str(row["category"])
                    if (
                        cat not in committed_cats
                        and cat not in INTERNAL_CATEGORIES
                        and is_frequent
                        and is_stable
                    ):
                        recurring_candidates.append(
                            {
                                "Merchant": m_name,
                                "Category": cat,
                                "Freq_Months": freq,
                                "Avg_Monthly": round(avg_amt, 2),
                            }
                        )
                recurring_candidates.sort(key=lambda x: x["Freq_Months"], reverse=True)

    # 2. Unflagged Subscriptions
    subscription_candidates: list[dict[str, Any]] = []
    if not df.empty:
        unflagged = df[~df["Is_Subscription"].astype(bool)]
        matched_rows = []
        for idx, row in unflagged.iterrows():
            name_l = str(row.get("Name", "")).lower()
            notes_l = str(row.get("Notes", "")).lower()
            if any(kw in name_l or kw in notes_l for kw in SMART_SUBSCRIPTION_KEYWORDS):
                matched_rows.append(idx)
        if matched_rows:
            cand_df = df.loc[matched_rows]
            for merch, grp in cand_df.groupby("Name"):
                if str(merch).strip():
                    subscription_candidates.append(
                        {
                            "merchant": str(merch),
                            "count": int(len(grp)),
                            "total_amount": round(float(grp["Amount"].sum()), 2),
                            "category": str(grp["Category"].iloc[0]),
                        }
                    )
            subscription_candidates.sort(key=lambda x: x["merchant"])

    # 3. Category Standardisation
    standardisation_suggestions: list[dict[str, Any]] = []
    if not df.empty:
        pure_monzo_cats = get_pure_monzo_categories(df)
        other_bank_df = df[df["Bank"] != "Monzo"]
        ignore_suggestions = {
            str(x).lower().strip() for x in settings.get("ignore_suggestions", [])
        }
        sim_cache: dict[str, str | None] = {}
        seen_pairs: set[tuple[str, str, str]] = set()

        for _, row in other_bank_df.iterrows():
            m_name = str(row["Name"]).strip()
            if not m_name or m_name.lower() in ignore_suggestions:
                continue
            curr_cat = clean_string(row["Category"])
            if curr_cat and curr_cat not in pure_monzo_cats:
                if curr_cat not in sim_cache:
                    matches = difflib.get_close_matches(
                        curr_cat, list(pure_monzo_cats), n=1, cutoff=0.5
                    )
                    sim_cache[curr_cat] = matches[0] if matches else None
                suggested = sim_cache[curr_cat]
                if suggested:
                    key = (m_name, curr_cat, suggested)
                    if key not in seen_pairs:
                        seen_pairs.add(key)
                        standardisation_suggestions.append(
                            {
                                "Merchant": m_name,
                                "From": curr_cat,
                                "Suggested": suggested,
                            }
                        )

    return {
        "recurring_candidates": recurring_candidates,
        "ignored_recurring": sorted(ignore_recurring),
        "subscription_candidates": subscription_candidates,
        "standardisation_suggestions": standardisation_suggestions,
    }


def build_wealth_data(
    df: pd.DataFrame,
    assets_data: dict[str, dict[str, float]],
    ignore_legacy: bool = True,
    timeframe: str = "All Time",
) -> dict[str, Any]:
    """Compute Net Worth series, Asset Balance timeline, and Internal Wealth Movements."""
    default_assets = [
        "Trading 212 S&S ISA",
        "Trading 212 Cash ISA",
        "Crypto",
        "Monzo savings",
    ]
    known_set: set[str] = set()
    for _, month_map in assets_data.items():
        if isinstance(month_map, dict):
            known_set.update(month_map.keys())
    known_assets = sorted(known_set) if known_set else default_assets

    sorted_months = sorted(assets_data.keys())
    latest_balances: dict[str, float] = {}
    if sorted_months:
        latest_balances = {k: round(float(v), 2) for k, v in assets_data[sorted_months[-1]].items()}

    net_worth_series: list[dict[str, Any]] = []
    asset_timeline: list[dict[str, Any]] = []
    for m in sorted_months:
        m_data = assets_data.get(m, {})
        total = round(sum(float(v) for v in m_data.values()), 2)
        net_worth_series.append({"month": m, "total": total})
        entry: dict[str, Any] = {"month": m}
        for a_name in known_assets:
            entry[a_name] = round(float(m_data.get(a_name, 0.0)), 2)
        asset_timeline.append(entry)

    latest_nw = net_worth_series[-1]["total"] if net_worth_series else 0.0
    prev_nw = net_worth_series[-2]["total"] if len(net_worth_series) >= 2 else latest_nw
    nw_delta = round(latest_nw - prev_nw, 2)

    # Internal movements
    internal_timeline: list[dict[str, Any]] = []
    internal_transactions: list[dict[str, Any]] = []
    if not df.empty:
        int_df = df[df["Category"].isin(INTERNAL_CATEGORIES)].copy()
        if ignore_legacy:
            int_df = int_df[int_df["Date"] >= pd.Timestamp("2020-01-01")]

        if timeframe != "All Time" and not int_df.empty:
            today = pd.Timestamp.now().normalize()
            offsets = {
                "Last 12 Months": pd.DateOffset(months=12),
                "Last 2 Years": pd.DateOffset(years=2),
                "Last 3 Years": pd.DateOffset(years=3),
                "Last 4 Years": pd.DateOffset(years=4),
            }
            if timeframe in offsets:
                int_df = int_df[int_df["Date"] >= (today - offsets[timeframe])]

        if not int_df.empty:
            int_df["Month_Year"] = int_df["Date"].dt.to_period("M").astype(str)
            piv = (
                int_df.groupby(["Month_Year", "Category"])["Amount"]
                .sum()
                .unstack(fill_value=0.0)
                .reset_index()
            )
            for _, r in piv.iterrows():
                row_dict: dict[str, Any] = {"month": str(r["Month_Year"])}
                for cat in INTERNAL_CATEGORIES:
                    if cat in piv.columns:
                        row_dict[cat] = round(float(r[cat]), 2)
                internal_timeline.append(row_dict)

            for _, r in int_df.sort_values("Date", ascending=False).iterrows():
                internal_transactions.append(
                    {
                        "Date": r["Date"].strftime("%d/%m/%Y"),
                        "Name": str(r["Name"]),
                        "Amount": round(float(r["Amount"]), 2),
                        "Transaction_Type": str(r["Transaction_Type"]),
                        "Bank": str(r["Bank"]),
                        "Category": str(r["Category"]),
                        "Notes": str(r["Notes"]),
                    }
                )

    return {
        "known_assets": known_assets,
        "assets_by_month": assets_data,
        "latest_month": sorted_months[-1]
        if sorted_months
        else pd.Timestamp.now().strftime("%Y-%m"),
        "latest_balances": latest_balances,
        "latest_net_worth": latest_nw,
        "net_worth_delta": nw_delta,
        "net_worth_series": net_worth_series,
        "asset_timeline": asset_timeline,
        "internal_timeline": internal_timeline,
        "internal_transactions": internal_transactions,
    }

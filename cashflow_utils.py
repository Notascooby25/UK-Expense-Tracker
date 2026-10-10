"""Pure calculation and sanitization helpers for the Cash Flow Breakdown view."""

import re
import pandas as pd


_MARKDOWN_ESCAPE_RE = re.compile(r"([\\`*_{}\[\]()#+\-.!$])")


def escape_markdown(text: object) -> str:
    """Escape Markdown and KaTeX special characters in user-supplied strings."""
    return _MARKDOWN_ESCAPE_RE.sub(r"\\\1", str(text))


def compute_income_breakdown(
    df_v: pd.DataFrame, months_in_period: int | float
) -> tuple[float, list[tuple[str, float, list[tuple[str, float]]]]]:
    """Return (monthly_total, [(category, cat_monthly_avg, [(merchant, merch_monthly_avg)])])."""
    months = max(1, months_in_period)
    inc_data = df_v[df_v["Spend_Type"] == "True Income"]
    if inc_data.empty:
        return 0.0, []

    inc_total = float(inc_data["Amount"].sum() / months)
    categories: list[tuple[str, float, list[tuple[str, float]]]] = []
    for cat, grp in inc_data.groupby("Category"):
        cat_sum = float(grp["Amount"].sum() / months)
        if cat_sum > 0:
            merch_grp = grp.groupby("Name")["Amount"].sum() / months
            merchants = [(str(m), float(val)) for m, val in merch_grp.items()]
            categories.append((str(cat), cat_sum, merchants))

    return inc_total, categories


def compute_committed_breakdown(df_v: pd.DataFrame, months_in_period: int | float) -> pd.DataFrame:
    """Return sorted DataFrame of non-zero net Committed Bills monthly averages."""
    months = max(1, months_in_period)
    com_exp = df_v[df_v["Spend_Type"] == "Committed Expense"].groupby("Category")["Amount"].sum()
    com_ref = df_v[df_v["Spend_Type"] == "Committed Refund"].groupby("Category")["Amount"].sum()
    com_df = (
        (com_exp.add(-com_ref, fill_value=0) / months)
        .reset_index()
        .rename(columns={"Amount": "Avg P/M (£)"})
    )
    com_df = com_df[com_df["Avg P/M (£)"] != 0]
    if not com_df.empty:
        com_df = com_df.sort_values(by="Avg P/M (£)", ascending=False).reset_index(drop=True)
    return com_df


def compute_variable_breakdown(df_v: pd.DataFrame, months_in_period: int | float) -> pd.DataFrame:
    """Return sorted DataFrame of positive net Variable Spend monthly averages."""
    months = max(1, months_in_period)
    var_exp = df_v[df_v["Spend_Type"] == "Variable Expense"].groupby("Category")["Amount"].sum()
    var_ref = df_v[df_v["Spend_Type"] == "Variable Refund"].groupby("Category")["Amount"].sum()
    var_df = (
        (var_exp.add(-var_ref, fill_value=0) / months)
        .reset_index()
        .rename(columns={"Amount": "Avg P/M (£)"})
    )
    var_df = var_df[var_df["Avg P/M (£)"] > 0]
    if not var_df.empty:
        var_df = var_df.sort_values(by="Avg P/M (£)", ascending=False).reset_index(drop=True)
    return var_df


def compute_savings_breakdown(
    df_v: pd.DataFrame, months_in_period: int | float
) -> list[tuple[str, float, list[tuple[str, float]]]]:
    """Return [(category, cat_net_monthly_avg, [(merchant, merch_net_monthly_avg)])] for Internal Transfers."""
    months = max(1, months_in_period)
    int_data = df_v[df_v["Spend_Type"] == "Internal Transfer"]
    if int_data.empty:
        return []

    categories: list[tuple[str, float, list[tuple[str, float]]]] = []
    for cat, grp in int_data.groupby("Category"):
        cat_exp = grp[grp["Transaction_Type"] == "Expense"]["Amount"].sum()
        cat_inc = grp[grp["Transaction_Type"] == "Income"]["Amount"].sum()
        cat_net = float((cat_exp - cat_inc) / months)
        if cat_net != 0:
            merch_exp = grp[grp["Transaction_Type"] == "Expense"].groupby("Name")["Amount"].sum()
            merch_inc = grp[grp["Transaction_Type"] == "Income"].groupby("Name")["Amount"].sum()
            merch_net = merch_exp.add(-merch_inc, fill_value=0) / months
            merchants = [(str(m), float(val)) for m, val in merch_net.items() if val != 0]
            categories.append((str(cat), cat_net, merchants))

    return categories

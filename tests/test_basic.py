"""
Basic unit tests for expense tracker logic and utilities.
"""

import pandas as pd

from cashflow_utils import (
    compute_committed_breakdown,
    compute_income_breakdown,
    compute_savings_breakdown,
    compute_variable_breakdown,
    escape_markdown,
)


def test_basic_dataframe_handling():
    """Verify standard pandas operations used throughout the app work as expected."""
    sample_data = {
        "Date": ["2026-01-01", "2026-01-02"],
        "Amount": [10.50, 25.00],
        "Category": ["Groceries", "Dining Out"],
    }
    df = pd.DataFrame(sample_data)
    assert len(df) == 2
    assert df["Amount"].sum() == 35.50


def test_financial_year_calculation_logic():
    """Verify typical UK Financial Year boundaries (April 6 to April 5)."""

    def get_financial_year(date_str):
        dt = pd.to_datetime(date_str)
        year = dt.year
        # UK FY starts April 6
        if dt.month < 4 or (dt.month == 4 and dt.day < 6):
            return f"{year - 1}/{str(year)[-2:]}"
        else:
            return f"{year}/{str(year + 1)[-2:]}"

    assert get_financial_year("2025-03-15") == "2024/25"
    assert get_financial_year("2025-04-05") == "2024/25"
    assert get_financial_year("2025-04-06") == "2025/26"
    assert get_financial_year("2025-05-01") == "2025/26"


def test_escape_markdown_sanitizes_special_chars():
    """Verify Markdown and KaTeX control characters are escaped safely."""
    assert escape_markdown("PAYPAL *EBAY_UK") == r"PAYPAL \*EBAY\_UK"
    assert escape_markdown("![x](https://evil.tld)") == r"\!\[x\]\(https://evil\.tld\)"
    assert escape_markdown("$100 Bonus") == r"\$100 Bonus"


def test_cashflow_breakdown_calculations():
    """Verify committed, variable, and income aggregation logic including refunds."""
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
    """Verify net internal transfer calculation by category and merchant."""
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

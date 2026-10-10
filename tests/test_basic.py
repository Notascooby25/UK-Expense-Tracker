"""
Basic unit tests for expense tracker logic and utilities.
"""

import pandas as pd


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

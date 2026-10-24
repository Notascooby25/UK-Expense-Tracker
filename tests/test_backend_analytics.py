"""Unit tests for backend/analytics.py wealth and net worth analytics."""

import pandas as pd
from backend.analytics import build_wealth_data


def test_build_wealth_data_with_debts():
    assets_data = {
        "2026-09-30": {"Savings": 10000.0},
        "2026-10-31": {"Savings": 12000.0},
    }
    debts_data = {
        "loans": {"Monzo Loan": {"original_amount": 5000.0}},
        "balances": {
            "2026-10-18": {"Monzo Loan": 4850.0},
        },
    }

    result = build_wealth_data(pd.DataFrame(), assets_data, debts_data)

    assert result["latest_assets_total"] == 12000.0
    assert result["latest_debts_total"] == 4850.0
    assert result["latest_net_worth"] == 7150.0
    assert len(result["loans_summary"]) == 1
    assert result["loans_summary"][0]["name"] == "Monzo Loan"
    assert result["loans_summary"][0]["original_amount"] == 5000.0
    assert result["loans_summary"][0]["current_balance"] == 4850.0
    assert result["loans_summary"][0]["repaid_amount"] == 150.0
    assert result["loans_summary"][0]["pct_repaid"] == 3.0


def test_build_wealth_data_forward_fills_timeline():
    assets_data = {
        "2026-09-30": {"Savings": 10000.0},
        "2026-10-31": {"Savings": 12000.0},
    }
    debts_data = {
        "loans": {"Monzo Loan": {"original_amount": 5000.0}},
        "balances": {
            "2026-10-18": {"Monzo Loan": 4850.0},
        },
    }

    result = build_wealth_data(pd.DataFrame(), assets_data, debts_data)
    timeline = result["net_worth_series"]
    # Dates present in order: 2026-09-30, 2026-10-18, 2026-10-31
    assert len(timeline) == 3
    # On 2026-09-30: Savings=10000, Debt=0 -> NW=10000
    assert timeline[0]["date"] == "2026-09-30"
    assert timeline[0]["assets"] == 10000.0
    assert timeline[0]["debts"] == 0.0
    assert timeline[0]["total"] == 10000.0

    # On 2026-10-18: Savings carried forward (10000), Debt=4850 -> NW=5150
    assert timeline[1]["date"] == "2026-10-18"
    assert timeline[1]["assets"] == 10000.0
    assert timeline[1]["debts"] == 4850.0
    assert timeline[1]["total"] == 5150.0

    # On 2026-10-31: Savings updated (12000), Debt carried forward (4850) -> NW=7150
    assert timeline[2]["date"] == "2026-10-31"
    assert timeline[2]["assets"] == 12000.0
    assert timeline[2]["debts"] == 4850.0
    assert timeline[2]["total"] == 7150.0


def test_dashboard_excludes_individual_exceptional_transactions():
    """Verify individual Is_Exceptional transactions are excluded from dashboard and tracked in summary."""
    from backend.analytics import prepare_filtered_dashboard_df

    df = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-10-05"),
                "Name": "Pret A Manger",
                "Amount": 4.50,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Dining Out",
                "Notes": "",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            },
            {
                "Date": pd.Timestamp("2026-10-10"),
                "Name": "Apple Store",
                "Amount": 799.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Shopping",
                "Notes": "Replacement phone",
                "Financial_Year": "2026/27",
                "Is_Subscription": False,
                "Is_Exceptional": True,
            },
        ]
    )

    settings = {"exceptional_categories": [], "committed_categories": []}
    filters = {
        "exclude_exceptional": True,
        "time_mode": "Rolling Period",
        "selected_period": "This Month",
    }

    df_filtered, months, _, exc_summary = prepare_filtered_dashboard_df(df, settings, filters)

    # Excluded from active filtered dataframe
    assert len(df_filtered) == 1
    assert df_filtered.iloc[0]["Name"] == "Pret A Manger"

    # Present in exceptional summary
    assert len(exc_summary) == 1
    assert exc_summary[0]["category"] == "Shopping"
    assert exc_summary[0]["total"] == 799.00
    assert exc_summary[0]["count"] == 1

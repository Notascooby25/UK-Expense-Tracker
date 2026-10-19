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

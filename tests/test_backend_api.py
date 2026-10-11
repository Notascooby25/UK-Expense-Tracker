"""Integration tests for FastAPI authentication, analytics, and REST endpoints."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.storage import save_settings, save_transactions


DUMMY_CRED = "secret123"  # pragma: allowlist secret
WRONG_CRED = "wrong123"  # pragma: allowlist secret


@pytest.fixture()
def api_env(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch):
    """Configure isolated temporary data directory and dev auth for API tests."""
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "nonexistent_secrets.toml"))

    sample_df = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-01-15"),
                "Name": "ACME Corp",
                "Amount": 3000.00,
                "Transaction_Type": "Income",
                "Bank": "Monzo",
                "Category": "Salary",
                "Notes": "Jan pay",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
            {
                "Date": pd.Timestamp("2026-01-18"),
                "Name": "Council Tax",
                "Amount": 150.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Bills",
                "Notes": "",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
            {
                "Date": pd.Timestamp("2026-01-20"),
                "Name": "Tesco",
                "Amount": 80.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",
                "Notes": "Food",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
            {
                "Date": pd.Timestamp("2026-02-15"),
                "Name": "ACME Corp",
                "Amount": 3000.00,
                "Transaction_Type": "Income",
                "Bank": "Monzo",
                "Category": "Salary",
                "Notes": "Feb pay",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
            {
                "Date": pd.Timestamp("2026-02-18"),
                "Name": "Council Tax",
                "Amount": 150.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Bills",
                "Notes": "",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
            {
                "Date": pd.Timestamp("2026-02-22"),
                "Name": "Netflix",
                "Amount": 10.99,
                "Transaction_Type": "Expense",
                "Bank": "HSBC",
                "Category": "Grocerys",  # Intentional typo for standardisation test
                "Notes": "stream",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
            {
                "Date": pd.Timestamp("2026-02-25"),
                "Name": "Monzo Pot",
                "Amount": 400.00,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Savings",
                "Notes": "ISA transfer",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
            },
        ]
    )
    save_transactions("Personal", sample_df)
    save_settings(
        "Personal",
        {
            "committed_categories": ["Bills"],
            "custom_categories": ["Entertainment"],
            "auto_rules": [
                {
                    "name_contains": "Tesco",
                    "notes_contains": "lunch",
                    "max_amount": 15.0,
                    "category": "Eating Out",
                }
            ],
        },
    )
    return tmp_path


def test_auth_protection_and_login_flow(api_env, monkeypatch: pytest.MonkeyPatch):
    """Verify unauthenticated API calls return 401 and login issues valid session cookie."""
    client = TestClient(app)

    # Unauthenticated request to protected endpoint fails with 401
    r_unauth = client.get("/api/bootstrap")
    assert r_unauth.status_code == 401

    # Invalid password fails
    r_bad = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": WRONG_CRED, "remember_me": True},
    )
    assert r_bad.status_code == 401

    # Production mode without secrets.toml blocks login
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "true")
    r_prod = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    assert r_prod.status_code == 503
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")

    # Valid login succeeds and sets session cookie
    r_ok = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["authenticated"] is True

    # Now bootstrap succeeds
    r_boot = client.get("/api/bootstrap?scope=Personal")
    assert r_boot.status_code == 200
    boot_data = r_boot.json()
    assert boot_data["scope"] == "Personal"
    assert "Groceries" in boot_data["master_categories"]


def test_dashboard_and_category_drilldown(api_env):
    """Verify dashboard KPIs, cashflow breakdown, and click-to-inspect drilldown."""
    client = TestClient(app)
    client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": False},
    )

    r_dash = client.get("/api/dashboard?scope=Personal")
    assert r_dash.status_code == 200
    dash = r_dash.json()

    assert dash["metrics"]["total_income"] == 6000.00
    assert dash["metrics"]["committed_expenses"] == 300.00
    assert dash["metrics"]["variable_expenses"] == 90.99
    assert dash["metrics"]["months_in_period"] == 2
    assert dash["metrics"]["avg_income"] == 3000.00
    assert dash["metrics"]["avg_baseline"] == 150.00

    # Click-to-inspect category drilldown for Bills
    r_drill = client.get("/api/dashboard/drilldown?scope=Personal&category=Bills")
    assert r_drill.status_code == 200
    drill = r_drill.json()
    assert drill["category"] == "Bills"
    assert drill["total_expenditure"] == 300.00
    assert len(drill["merchants"]) == 1
    assert drill["merchants"][0]["Name"] == "Council Tax"
    assert len(drill["transactions"]) == 2

    # Calendar Year with single month selection (February)
    r_dash_feb = client.get(
        "/api/dashboard?scope=Personal&time_mode=Calendar+Year&selected_period=2026&months=February"
    )
    assert r_dash_feb.status_code == 200
    dash_feb = r_dash_feb.json()
    assert dash_feb["metrics"]["months_in_period"] == 1
    assert dash_feb["metrics"]["total_income"] == 3000.00
    assert dash_feb["metrics"]["committed_expenses"] == 150.00
    assert dash_feb["metrics"]["variable_expenses"] == 10.99

    # Rolling Period with "This Month"
    r_dash_tm = client.get(
        "/api/dashboard?scope=Personal&time_mode=Rolling+Period&selected_period=This+Month"
    )
    assert r_dash_tm.status_code == 200
    dash_tm = r_dash_tm.json()
    assert "metrics" in dash_tm


def test_transactions_filter_inline_edit_bulk_and_export(api_env):
    """Verify filtered inline edits preserve unfiltered rows, bulk actions save, and CSV exports."""
    client = TestClient(app)
    client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": False},
    )

    # Filter by bank=HSBC (should match only Netflix row)
    r_tx = client.get("/api/transactions?scope=Personal&bank=HSBC")
    assert r_tx.status_code == 200
    tx_data = r_tx.json()
    assert tx_data["total"] == 1
    netflix_row = tx_data["rows"][0]
    row_id = netflix_row["row_id"]
    assert netflix_row["Name"] == "Netflix"

    # Inline edit Netflix row while filtered: change Date to 2026-04-10 (new FY 2026-2027) and Category
    r_patch = client.patch(
        f"/api/transactions/{row_id}?scope=Personal",
        json={"Date": "2026-04-10", "Category": "Subscriptions", "Amount": 12.99},
    )
    assert r_patch.status_code == 200
    updated_row = r_patch.json()["row"]
    assert updated_row["Category"] == "Subscriptions"
    assert updated_row["Financial_Year"] == "2026-2027"
    assert updated_row["Amount"] == 12.99

    # Verify all 7 rows still exist in the database
    r_all = client.get("/api/transactions?scope=Personal")
    assert r_all.json()["total"] == 7

    # Quick Add a new transaction
    r_add = client.post(
        "/api/transactions?scope=Personal",
        json={
            "Date": "2026-03-01",
            "Name": "Spotify",
            "Amount": 11.99,
            "Transaction_Type": "Expense",
            "Bank": "Monzo",
            "Category": "Subscriptions",
            "Notes": "Music",
            "Is_Subscription": False,
        },
    )
    assert r_add.status_code == 200
    # Smart dictionary should auto-flag Spotify as subscription
    r_all2 = client.get("/api/transactions?scope=Personal&search=Spotify")
    assert r_all2.json()["total"] == 1
    spotify_row = r_all2.json()["rows"][0]
    assert spotify_row["Is_Subscription"] is True

    # Bulk update and delete
    r_bulk_upd = client.post(
        "/api/transactions/bulk?scope=Personal",
        json={
            "action": "update",
            "row_ids": [spotify_row["row_id"]],
            "category": "Entertainment",
        },
    )
    assert r_bulk_upd.status_code == 200

    # Export CSV
    r_exp = client.get("/api/transactions/export?scope=Personal&search=Spotify")
    assert r_exp.status_code == 200
    assert "01/03/2026,Spotify,11.99,Expense,Monzo,Entertainment" in r_exp.text

    # Bulk delete Spotify row
    r_bulk_del = client.post(
        "/api/transactions/bulk?scope=Personal",
        json={"action": "delete", "row_ids": [spotify_row["row_id"]]},
    )
    assert r_bulk_del.status_code == 200
    assert client.get("/api/transactions?scope=Personal").json()["total"] == 7


def test_intelligence_wealth_and_settings_endpoints(api_env):
    """Verify 1-click intelligence actions, wealth balance logging, and settings/rules."""
    client = TestClient(app)
    client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": False},
    )

    # Intelligence scan
    r_int = client.get("/api/intelligence?scope=Personal")
    assert r_int.status_code == 200
    intel = r_int.json()
    # Netflix should appear in subscription_candidates and standardisation_suggestions
    assert "Netflix" in [c["merchant"] for c in intel["subscription_candidates"]]
    assert any(
        s["From"] == "Grocerys" and s["Suggested"] == "Groceries"
        for s in intel["standardisation_suggestions"]
    )

    # 1-click flag subscription
    r_flag = client.post(
        "/api/intelligence/action?scope=Personal",
        json={"action": "flag_subscriptions", "merchants": ["Netflix"]},
    )
    assert r_flag.status_code == 200

    # 1-click apply category standardisation
    r_std = client.post(
        "/api/intelligence/action?scope=Personal",
        json={
            "action": "apply_standardisation",
            "from_category": "Grocerys",
            "to_category": "Groceries",
        },
    )
    assert r_std.status_code == 200

    # Wealth balances logging
    r_wealth_save = client.post(
        "/api/wealth/balances?scope=Personal",
        json={"month": "2026-02", "balances": {"Trading 212 S&S ISA": 12000.0, "Cash ISA": 4000.0}},
    )
    assert r_wealth_save.status_code == 200
    r_wealth = client.get("/api/wealth?scope=Personal")
    assert r_wealth.status_code == 200
    w_data = r_wealth.json()
    assert w_data["latest_net_worth"] == 16000.0
    assert len(w_data["internal_transactions"]) == 1

    # Settings rule tester
    r_test_rule = client.post(
        "/api/settings/test-rule?scope=Personal",
        json={"name": "Tesco Express", "notes": "quick lunch", "amount": 6.50},
    )
    assert r_test_rule.status_code == 200
    assert r_test_rule.json()["matched"] is True
    assert r_test_rule.json()["rule"]["category"] == "Eating Out"

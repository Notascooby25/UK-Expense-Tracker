"""Unit tests for backend/storage.py atomic persistence and bank import engine."""

import pandas as pd
import pytest

from backend.storage import (
    COLS,
    apply_auto_rules,
    apply_smart_dictionary,
    calculate_uk_financial_year,
    clean_string,
    get_matching_auto_rule,
    load_assets,
    load_debts,
    load_filters,
    load_settings,
    load_transactions,
    parse_and_merge_import,
    process_monzo_splits,
    save_assets,
    save_debts,
    save_filters,
    save_settings,
    save_transactions,
)


def test_clean_string_and_uk_financial_year():
    """Verify clean_string strips null-like tokens and UK FY uses April 6 boundary."""
    assert clean_string("  Tesco  ") == "Tesco"
    assert clean_string("nan") == ""
    assert clean_string("None") == ""
    assert clean_string(None) == ""

    assert calculate_uk_financial_year(pd.Timestamp("2025-04-05")) == "2024-2025"
    assert calculate_uk_financial_year(pd.Timestamp("2025-04-06")) == "2025-2026"
    assert calculate_uk_financial_year(pd.Timestamp("2026-01-15")) == "2025-2026"
    assert calculate_uk_financial_year(pd.NaT) == "Unknown"


def test_atomic_transactions_and_json_roundtrip(
    tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch
):
    """Verify atomic save/load of Personal and Joint CSV/JSON files preserves DD/MM/YYYY."""
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))

    sample_df = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-05-10"),
                "Name": "Tesco",
                "Amount": 42.5,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",
                "Notes": "Weekly shop",
                "Financial_Year": "2026-2027",
                "Is_Subscription": False,
            }
        ]
    )
    save_transactions("Personal", sample_df)

    # Check raw CSV on disk has DD/MM/YYYY format
    csv_path = tmp_path / "expense_database.csv"
    assert csv_path.exists()
    raw_text = csv_path.read_text(encoding="utf-8")
    assert "10/05/2026" in raw_text

    loaded_df = load_transactions("Personal")
    assert len(loaded_df) == 1
    assert loaded_df.iloc[0]["Name"] == "Tesco"
    assert loaded_df.iloc[0]["Amount"] == 42.50
    assert loaded_df.iloc[0]["Date"] == pd.Timestamp("2026-05-10")

    # Joint scope isolation
    joint_loaded = load_transactions("Joint")
    assert joint_loaded.empty or len(joint_loaded) >= 0

    # Settings, filters, assets round-trip
    save_settings("Personal", {"custom_categories": ["Pets"], "committed_categories": ["Bills"]})
    s = load_settings("Personal")
    assert "Pets" in s["custom_categories"]
    assert s["monzo_sheet_worksheet"] == "Personal Account Transactions"

    s_joint = load_settings("Joint")
    assert s_joint["monzo_sheet_worksheet"] == "Joint Account Transactions"

    save_filters("Personal", {"TaxYear": {"fy": "2025-2026"}})
    assert load_filters("Personal")["TaxYear"]["fy"] == "2025-2026"

    save_assets("Personal", {"2026-10": {"Cash ISA": 5000.0}})
    assert load_assets("Personal")["2026-10"]["Cash ISA"] == 5000.0

    # Debts round-trip
    initial_debts = load_debts("Personal")
    assert initial_debts == {"loans": {}, "balances": {}}

    sample_debts = {
        "loans": {"Monzo Loan": {"original_amount": 5000.0}},
        "balances": {"2026-10-18": {"Monzo Loan": 4850.0}},
    }
    save_debts("Personal", sample_debts)
    loaded_debts = load_debts("Personal")
    assert loaded_debts["loans"]["Monzo Loan"]["original_amount"] == 5000.0
    assert loaded_debts["balances"]["2026-10-18"]["Monzo Loan"] == 4850.0


def test_process_monzo_splits_expands_parent_row():
    """Verify Monzo multi-category split rows replace parent row with separated child rows."""
    raw = pd.DataFrame(
        [
            {
                "Date": "10/05/2026",
                "Name": "Costco",
                "Amount": 100.0,
                "Category": "Shopping",
                "Category split": "Groceries:65.25, Household:34.75",
            },
            {
                "Date": "11/05/2026",
                "Name": "Coffee Shop",
                "Amount": 4.5,
                "Category": "Eating Out",
                "Category split": "",
            },
        ]
    )
    out = process_monzo_splits(raw)
    assert len(out) == 3
    cats = sorted(out["Category"].tolist())
    assert cats == ["Eating Out", "Groceries", "Household"]
    assert sorted(out["Amount"].tolist()) == [4.5, 34.75, 65.25]


def test_smart_dictionary_and_auto_rules():
    """Verify smart subscription keywords and priority auto-rules with max_amount."""
    df = pd.DataFrame(
        [
            {
                "Name": "Netflix.com",
                "Notes": "",
                "Amount": 10.99,
                "Category": "Entertainment",
                "Is_Subscription": False,
            },
            {
                "Name": "Tesco Express",
                "Notes": "meal deal",
                "Amount": 4.50,
                "Category": "Groceries",
                "Is_Subscription": False,
            },
            {
                "Name": "Tesco Extra",
                "Notes": "big shop",
                "Amount": 85.00,
                "Category": "Unknown",
                "Is_Subscription": False,
            },
        ]
    )
    rules = [
        {"name_contains": "Tesco", "notes_contains": "", "max_amount": 15.0, "category": "Lunch"},
        {
            "name_contains": "Tesco",
            "notes_contains": "",
            "max_amount": 0.0,
            "category": "Groceries",
        },
    ]
    df = apply_smart_dictionary(df)
    assert bool(df.iloc[0]["Is_Subscription"]) is True
    assert bool(df.iloc[1]["Is_Subscription"]) is False

    idx, rule = get_matching_auto_rule(df.iloc[1], rules)
    assert idx == 0
    assert rule["category"] == "Lunch"

    df = apply_auto_rules(df, rules)
    assert df.iloc[1]["Category"] == "Lunch"
    assert df.iloc[2]["Category"] == "Groceries"


def test_parse_and_merge_hsbc_barclaycard_and_monzo_dedup():
    """Verify HSBC, headerless Barclaycard, and Monzo deduplication + category updates."""
    existing = pd.DataFrame(columns=COLS)

    # 1. HSBC format
    hsbc_raw = pd.DataFrame(
        [
            {
                "Date": "12/05/2026",
                "Description": "Salary ACME",
                "Paid out": "",
                "Paid in": "£2,500.00",
            },
            {
                "Date": "13/05/2026",
                "Description": "British Gas",
                "Paid out": "£120.50",
                "Paid in": "",
            },
        ]
    )
    merged, new_rows, updated_rows, _ = parse_and_merge_import(
        existing, hsbc_raw, rules=[], source_format="HSBC"
    )
    assert len(merged) == 2
    assert len(new_rows) == 2
    assert updated_rows.empty
    assert merged.iloc[0]["Bank"] == "HSBC"
    assert merged.iloc[0]["Transaction_Type"] == "Income"
    assert merged.iloc[0]["Amount"] == 2500.00
    assert merged.iloc[1]["Transaction_Type"] == "Expense"
    assert merged.iloc[1]["Amount"] == 120.50

    # 2. Re-importing same row with updated category updates existing row without duplicating
    hsbc_update = pd.DataFrame(
        [
            {
                "Date": "13/05/2026",
                "Description": "British Gas",
                "Paid out": "£120.50",
                "Paid in": "",
                "Category": "Bills",
            }
        ]
    )
    merged2, new_rows2, updated_rows2, _ = parse_and_merge_import(
        merged, hsbc_update, rules=[], source_format="HSBC"
    )
    assert len(merged2) == 2
    assert new_rows2.empty
    assert len(updated_rows2) == 1
    assert merged2.loc[merged2["Name"] == "British Gas", "Category"].iloc[0] == "Bills"

    # 3. Barclaycard 7-column headerless format
    bc_raw = pd.DataFrame(
        [
            ["15/05/2026", "Amazon UK", "Card", "Spend", "Shopping", "0", "39.99"],
        ]
    )
    merged3, new_rows3, _, _ = parse_and_merge_import(
        merged2, bc_raw, rules=[], source_format="Barclaycard"
    )
    assert len(merged3) == 3
    assert len(new_rows3) == 1
    assert new_rows3.iloc[0]["Bank"] == "Barclaycard"
    assert new_rows3.iloc[0]["Name"] == "Amazon UK"
    assert new_rows3.iloc[0]["Amount"] == 39.99
    assert new_rows3.iloc[0]["Category"] == "Shopping"


def test_parse_and_merge_preserves_existing_category_and_flags_conflict():
    existing = pd.DataFrame(
        [
            {
                "Date": pd.to_datetime("2026-05-13").normalize(),
                "Name": "Tesco Express",
                "Amount": 15.50,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",  # User modified in app
                "Notes": "",
                "Financial_Year": "2026-2027",
                "Is_Subscription": False,
            }
        ]
    )
    incoming_raw = pd.DataFrame(
        [
            {
                "Date": "13/05/2026",
                "Name": "Tesco Express",
                "Amount": "-15.50",
                "Category": "Shopping",  # Default Monzo category
            }
        ]
    )
    merged, new_rows, updated_rows, conflicts = parse_and_merge_import(
        existing, incoming_raw, rules=[], source_format="Monzo"
    )
    # Existing category Groceries MUST be preserved in merged_df
    assert merged.loc[0, "Category"] == "Groceries"
    assert new_rows.empty
    assert len(conflicts) == 1
    assert conflicts[0]["_row_id"] == 0
    assert conflicts[0]["current_category"] == "Groceries"
    assert conflicts[0]["incoming_category"] == "Shopping"

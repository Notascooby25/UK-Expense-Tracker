"""Tests for scoped mortgage storage and data handling."""

import os
import pytest
from backend.storage import (
    ACCOUNT_SCOPE_JOINT,
    ACCOUNT_SCOPE_PERSONAL,
    add_mortgage_overpayment,
    delete_mortgage_overpayment,
    load_mortgage,
    save_mortgage,
    update_mortgage_profile,
)


@pytest.fixture(autouse=True)
def temp_env(tmp_path, monkeypatch):
    """Ensure tests run against a clean isolated temp data directory."""
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    return tmp_path


def test_load_mortgage_default():
    """Verify empty default structure when no mortgage file exists."""
    data = load_mortgage(ACCOUNT_SCOPE_PERSONAL)
    assert data == {"profile": None, "overpayments": []}


def test_save_and_load_mortgage_profile():
    """Verify saving and retrieving mortgage profile."""
    profile = {
        "original_balance": 250000.0,
        "current_balance": 214500.0,
        "interest_rate": 4.25,
        "monthly_payment": 1180.0,
        "remaining_term_months": 268,
        "deal_expiry_date": "2027-08-31",
        "mortgage_type": "Fixed Rate",
    }
    updated = update_mortgage_profile(ACCOUNT_SCOPE_PERSONAL, profile)
    assert updated["profile"]["current_balance"] == 214500.0
    assert updated["profile"]["mortgage_type"] == "Fixed Rate"

    loaded = load_mortgage(ACCOUNT_SCOPE_PERSONAL)
    assert loaded["profile"]["interest_rate"] == 4.25
    assert loaded["profile"]["remaining_term_months"] == 268


def test_scope_isolation():
    """Verify Personal and Joint mortgage profiles do not interfere."""
    personal_profile = {
        "original_balance": 100000.0,
        "current_balance": 90000.0,
        "interest_rate": 3.5,
        "monthly_payment": 500.0,
        "remaining_term_months": 200,
        "deal_expiry_date": "2028-01-01",
        "mortgage_type": "Fixed Rate",
    }
    joint_profile = {
        "original_balance": 300000.0,
        "current_balance": 280000.0,
        "interest_rate": 4.5,
        "monthly_payment": 1500.0,
        "remaining_term_months": 300,
        "deal_expiry_date": "2026-12-31",
        "mortgage_type": "Fixed Rate",
    }
    update_mortgage_profile(ACCOUNT_SCOPE_PERSONAL, personal_profile)
    update_mortgage_profile(ACCOUNT_SCOPE_JOINT, joint_profile)

    pers = load_mortgage(ACCOUNT_SCOPE_PERSONAL)
    jnt = load_mortgage(ACCOUNT_SCOPE_JOINT)

    assert pers["profile"]["current_balance"] == 90000.0
    assert jnt["profile"]["current_balance"] == 280000.0


def test_add_and_delete_mortgage_overpayment():
    """Verify adding an overpayment decrements balance, and deleting restores balance."""
    profile = {
        "original_balance": 200000.0,
        "current_balance": 200000.0,
        "interest_rate": 4.0,
        "monthly_payment": 1055.0,
        "remaining_term_months": 300,
        "deal_expiry_date": "2027-05-31",
        "mortgage_type": "Fixed Rate",
    }
    update_mortgage_profile(ACCOUNT_SCOPE_PERSONAL, profile)

    overpayment = {
        "date": "2026-10-15",
        "amount": 2000.0,
        "type": "Lump Sum",
        "notes": "Work bonus",
    }
    res = add_mortgage_overpayment(ACCOUNT_SCOPE_PERSONAL, overpayment)
    assert len(res["overpayments"]) == 1
    assert res["overpayments"][0]["amount"] == 2000.0
    assert res["overpayments"][0]["id"] is not None
    # Balance should be decremented by £2,000 to £198,000
    assert res["profile"]["current_balance"] == 198000.0

    op_id = res["overpayments"][0]["id"]
    deleted = delete_mortgage_overpayment(ACCOUNT_SCOPE_PERSONAL, op_id)
    assert deleted is True

    loaded_after = load_mortgage(ACCOUNT_SCOPE_PERSONAL)
    assert len(loaded_after["overpayments"]) == 0
    # Balance should be restored to £200,000
    assert loaded_after["profile"]["current_balance"] == 200000.0

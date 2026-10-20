"""Integration tests for Mortgage Tracker API endpoints."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

DUMMY_CRED = "secret123"  # pragma: allowlist secret


@pytest.fixture()
def auth_client(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch):
    """Provide authenticated TestClient with isolated data directory."""
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "secrets.toml"))

    client = TestClient(app)
    res = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    assert res.status_code == 200
    return client


def test_mortgage_endpoints_require_auth():
    """Unauthenticated calls to /api/mortgage endpoints must return 401."""
    client = TestClient(app)
    assert client.get("/api/mortgage").status_code == 401
    assert client.post("/api/mortgage/profile", json={}).status_code == 401
    assert client.post("/api/mortgage/overpayments", json={}).status_code == 401
    assert client.delete("/api/mortgage/overpayments/op_123").status_code == 401
    assert client.post("/api/mortgage/calculate", json={}).status_code == 401


def test_mortgage_get_default(auth_client: TestClient):
    """GET /api/mortgage returns default structure when no profile is set."""
    res = auth_client.get("/api/mortgage?scope=Personal")
    assert res.status_code == 200
    data = res.json()
    assert data["profile"] is None
    assert data["overpayments"] == []
    assert data["summary"] is None
    assert data["annual_allowance"] == 0.0


def test_mortgage_profile_lifecycle(auth_client: TestClient):
    """POST /api/mortgage/profile updates profile and GET calculates summary."""
    profile_payload = {
        "original_balance": 240000.0,
        "current_balance": 214500.0,
        "interest_rate": 4.25,
        "monthly_payment": 1180.0,
        "remaining_term_months": 268,
        "deal_expiry_date": "2027-08-31",
        "mortgage_type": "Fixed Rate",
    }
    save_res = auth_client.post(
        "/api/mortgage/profile?scope=Joint",
        json=profile_payload,
    )
    assert save_res.status_code == 200
    save_data = save_res.json()
    assert save_data["profile"]["current_balance"] == 214500.0

    get_res = auth_client.get("/api/mortgage?scope=Joint")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["profile"]["deal_expiry_date"] == "2027-08-31"
    assert get_data["annual_allowance"] == 21450.0  # 10% of 214,500
    assert get_data["summary"] is not None
    assert "trajectory" in get_data["summary"]


def test_mortgage_overpayments_lifecycle(auth_client: TestClient):
    """POST and DELETE /api/mortgage/overpayments log payments and adjust balance."""
    # Set up profile first
    auth_client.post(
        "/api/mortgage/profile?scope=Joint",
        json={
            "original_balance": 200000.0,
            "current_balance": 180000.0,
            "interest_rate": 4.0,
            "monthly_payment": 1000.0,
            "remaining_term_months": 240,
            "deal_expiry_date": "2027-01-01",
            "mortgage_type": "Fixed Rate",
        },
    )

    # Log overpayment
    op_res = auth_client.post(
        "/api/mortgage/overpayments?scope=Joint",
        json={
            "date": "2026-10-20",
            "amount": 1500.0,
            "type": "Lump Sum",
            "notes": "Savings bonus",
        },
    )
    assert op_res.status_code == 200
    op_data = op_res.json()
    assert len(op_data["overpayments"]) == 1
    # Balance decremented: 180,000 - 1,500 = 178,500
    assert op_data["profile"]["current_balance"] == 178500.0

    op_id = op_data["overpayments"][0]["id"]

    # Edit overpayment: update amount from 1500 to 2000 -> balance becomes 178,000
    put_res = auth_client.put(
        f"/api/mortgage/overpayments/{op_id}?scope=Joint",
        json={
            "date": "2026-10-21",
            "amount": 2000.0,
            "type": "Lump Sum",
            "notes": "Savings bonus updated",
        },
    )
    assert put_res.status_code == 200
    put_data = put_res.json()
    assert put_data["profile"]["current_balance"] == 178000.0
    assert put_data["overpayments"][0]["amount"] == 2000.0
    assert put_data["overpayments"][0]["notes"] == "Savings bonus updated"

    # Delete overpayment
    del_res = auth_client.delete(f"/api/mortgage/overpayments/{op_id}?scope=Joint")
    assert del_res.status_code == 200

    # Verify balance restored
    after_res = auth_client.get("/api/mortgage?scope=Joint")
    assert after_res.json()["profile"]["current_balance"] == 180000.0
    assert len(after_res.json()["overpayments"]) == 0


def test_mortgage_calculate_endpoint(auth_client: TestClient):
    """POST /api/mortgage/calculate returns on-the-fly simulation results."""
    calc_res = auth_client.post(
        "/api/mortgage/calculate",
        json={
            "principal": 200000.0,
            "annual_rate_pct": 4.5,
            "monthly_payment": 1111.0,
            "term_months": 300,
            "monthly_overpayment": 200.0,
            "lump_sum": 5000.0,
        },
    )
    assert calc_res.status_code == 200
    data = calc_res.json()
    assert data["months_saved"] > 0
    assert data["interest_saved"] > 0.0
    assert len(data["trajectory"]) > 0

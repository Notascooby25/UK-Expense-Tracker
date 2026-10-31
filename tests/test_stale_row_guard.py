"""Stale-row guard: edits carrying an `expect` fingerprint are refused if the row moved."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import main, storage
from backend.storage import transaction_fingerprint

DUMMY_CRED = "secret123"  # pragma: allowlist secret


def _row(day: int, name: str, amount: float, category: str = "Misc") -> dict:
    return {
        "Date": pd.Timestamp(f"2026-03-{day:02d}"),
        "Name": name,
        "Amount": amount,
        "Transaction_Type": "Expense",
        "Bank": "Monzo",
        "Category": category,
        "Notes": "",
        "Financial_Year": "2025-2026",
        "Is_Subscription": False,
        "Is_Exceptional": False,
    }


@pytest.fixture()
def api(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "no_secrets.toml"))
    storage.save_transactions(
        "Personal",
        pd.DataFrame(
            [
                _row(1, "Alpha", 10.0),
                _row(2, "Bravo", 20.5),
                _row(3, "Charlie", 30.0),
            ]
        ),
    )
    client = TestClient(main.app)
    client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    return client


def _names() -> list[str]:
    return list(storage.load_transactions("Personal")["Name"])


def _fp(day: int, name: str, amount: float) -> str:
    return f"2026-03-{day:02d}|{name}|{amount:.2f}"


# --- fingerprint format -----------------------------------------------------------


def test_fingerprint_format_matches_intelligence_signatures():
    assert (
        transaction_fingerprint(pd.Timestamp("2026-03-09"), "  Tesco ", 4.1)
        == "2026-03-09|Tesco|4.10"
    )
    assert transaction_fingerprint(pd.Timestamp("2026-03-09"), None, 12) == "2026-03-09||12.00"


# --- PATCH ------------------------------------------------------------------------


def test_patch_with_matching_expect_succeeds(api):
    r = api.patch("/api/transactions/1", json={"Notes": "hello", "expect": _fp(2, "Bravo", 20.5)})
    assert r.status_code == 200
    assert storage.load_transactions("Personal").iloc[1]["Notes"] == "hello"


def test_patch_without_expect_still_works(api):
    assert api.patch("/api/transactions/1", json={"Notes": "legacy client"}).status_code == 200


def test_expect_is_not_written_into_the_data(api):
    api.patch("/api/transactions/1", json={"Notes": "n", "expect": _fp(2, "Bravo", 20.5)})
    df = storage.load_transactions("Personal")
    assert list(df.columns).count("expect") == 0
    assert "expect" not in df.iloc[1]["Notes"]


def test_patch_on_a_shifted_row_is_refused_and_changes_nothing(api):
    """Another device deleted row 0, so id 1 is now Charlie, not Bravo."""
    api.post("/api/transactions/bulk", json={"action": "delete", "row_ids": [0]})
    assert _names() == ["Bravo", "Charlie"]
    r = api.patch(
        "/api/transactions/1",
        json={"Category": "WRONG", "expect": _fp(2, "Bravo", 20.5)},
    )
    assert r.status_code == 409
    assert "changed" in r.json()["detail"].lower()
    df = storage.load_transactions("Personal")
    assert list(df["Category"]) == ["Misc", "Misc"]


def test_second_edit_with_the_old_fingerprint_is_refused_after_a_rename(api):
    old = _fp(2, "Bravo", 20.5)
    assert (
        api.patch("/api/transactions/1", json={"Name": "Bravo 2", "expect": old}).status_code == 200
    )
    again = api.patch("/api/transactions/1", json={"Notes": "x", "expect": old})
    assert again.status_code == 409
    fresh = api.patch("/api/transactions/1", json={"Notes": "x", "expect": _fp(2, "Bravo 2", 20.5)})
    assert fresh.status_code == 200


# --- bulk -------------------------------------------------------------------------


def test_bulk_update_with_matching_expects_succeeds(api):
    r = api.post(
        "/api/transactions/bulk",
        json={
            "action": "update",
            "row_ids": [0, 2],
            "category": "Fun",
            "expects": {"0": _fp(1, "Alpha", 10.0), "2": _fp(3, "Charlie", 30.0)},
        },
    )
    assert r.status_code == 200
    assert list(storage.load_transactions("Personal")["Category"]) == ["Fun", "Misc", "Fun"]


def test_bulk_update_is_all_or_nothing_when_one_row_is_stale(api):
    r = api.post(
        "/api/transactions/bulk",
        json={
            "action": "update",
            "row_ids": [0, 1, 2],
            "category": "Fun",
            "expects": {
                "0": _fp(1, "Alpha", 10.0),
                "1": _fp(2, "NOT BRAVO", 20.5),
                "2": _fp(3, "Charlie", 30.0),
            },
        },
    )
    assert r.status_code == 409
    assert list(storage.load_transactions("Personal")["Category"]) == ["Misc"] * 3


def test_bulk_delete_of_a_stale_selection_deletes_nothing(api):
    """The harmful case: a screen still showing 3 rows deletes id 1 after row 0 vanished."""
    api.post("/api/transactions/bulk", json={"action": "delete", "row_ids": [0]})
    r = api.post(
        "/api/transactions/bulk",
        json={"action": "delete", "row_ids": [1], "expects": {"1": _fp(2, "Bravo", 20.5)}},
    )
    assert r.status_code == 409
    assert _names() == ["Bravo", "Charlie"]


def test_bulk_expect_for_a_row_that_no_longer_exists_is_refused(api):
    r = api.post(
        "/api/transactions/bulk",
        json={"action": "delete", "row_ids": [7], "expects": {"7": _fp(1, "Ghost", 1.0)}},
    )
    assert r.status_code == 409
    assert _names() == ["Alpha", "Bravo", "Charlie"]


def test_bulk_without_expects_behaves_as_before(api):
    r = api.post(
        "/api/transactions/bulk", json={"action": "update", "row_ids": [1], "category": "Fun"}
    )
    assert r.status_code == 200
    assert list(storage.load_transactions("Personal")["Category"]) == ["Misc", "Fun", "Misc"]


def test_bulk_ignores_expects_for_ids_not_in_the_request(api):
    r = api.post(
        "/api/transactions/bulk",
        json={
            "action": "update",
            "row_ids": [0],
            "category": "Fun",
            "expects": {"0": _fp(1, "Alpha", 10.0), "1": _fp(2, "stale", 0.0)},
        },
    )
    assert r.status_code == 200


# --- mark as one-off (Intelligence) -----------------------------------------------


@pytest.fixture()
def api_with_spike(api):
    df = storage.load_transactions("Personal")
    df = pd.concat(
        [df, pd.DataFrame([_row(10, "Phone repair", 400.0, "Gadgets")])], ignore_index=True
    )
    storage.save_transactions("Personal", df)
    return api


def _spike_candidate(client: TestClient) -> dict:
    cands = client.get("/api/intelligence?scope=Personal&horizon=2026").json()["one_off_candidates"]
    assert cands, "expected the 400 spend to be flagged as a spike"
    return cands[0]


def test_intelligence_signature_equals_the_row_fingerprint(api_with_spike):
    cand = _spike_candidate(api_with_spike)
    assert cand["signature"] == _fp(10, "Phone repair", 400.0)


def test_mark_one_off_with_the_candidate_signature_succeeds(api_with_spike):
    cand = _spike_candidate(api_with_spike)
    r = api_with_spike.post(
        "/api/intelligence/action",
        json={
            "action": "mark_one_off",
            "row_id": cand["row_id"],
            "signature": cand["signature"],
            "horizon": "2026",
        },
    )
    assert r.status_code == 200
    assert bool(storage.load_transactions("Personal").iloc[cand["row_id"]]["Is_Exceptional"])


def test_mark_one_off_on_a_shifted_row_is_refused(api_with_spike):
    cand = _spike_candidate(api_with_spike)
    api_with_spike.post("/api/transactions/bulk", json={"action": "delete", "row_ids": [0]})
    r = api_with_spike.post(
        "/api/intelligence/action",
        json={
            "action": "mark_one_off",
            "row_id": cand["row_id"],
            "signature": cand["signature"],
            "horizon": "2026",
        },
    )
    assert r.status_code == 409
    assert not storage.load_transactions("Personal")["Is_Exceptional"].any()


def test_mark_one_off_without_signature_still_works(api_with_spike):
    cand = _spike_candidate(api_with_spike)
    r = api_with_spike.post(
        "/api/intelligence/action",
        json={"action": "mark_one_off", "row_id": cand["row_id"], "horizon": "2026"},
    )
    assert r.status_code == 200

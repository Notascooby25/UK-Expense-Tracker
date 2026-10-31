"""Unreadable dates are set aside (not silently lost); asset balances of 0 are recorded."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import main, storage

DUMMY_CRED = "secret123"  # pragma: allowlist secret
HEADER = "Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year,Is_Subscription,Is_Exceptional\n"


@pytest.fixture()
def env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "no_secrets.toml"))
    return tmp_path


@pytest.fixture()
def client(env):
    c = TestClient(main.app)
    c.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    return c


def _write_db(env, *rows: str) -> None:
    (env / "expense_database.csv").write_text(HEADER + "".join(r + "\n" for r in rows))


def _line(date: str, name: str, amount: str = "1.00") -> str:
    return f"{date},{name},{amount},Expense,Monzo,Misc,,2025-2026,False,False"


# --- date parsing -----------------------------------------------------------------


def test_uk_day_first_dates_are_unchanged(env):
    _write_db(env, _line("03/04/2026", "Ambiguous"), _line("5/1/2026", "Unpadded"))
    df = storage.load_transactions("Personal").set_index("Name")
    assert df.loc["Ambiguous", "Date"] == pd.Timestamp("2026-04-03")  # 3 April, not 4 March
    assert df.loc["Unpadded", "Date"] == pd.Timestamp("2026-01-05")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2026-01-06", "2026-01-06"),
        ("06/01/26", "2026-01-06"),
        ("6 Jan 2026", "2026-01-06"),
    ],
)
def test_other_common_date_formats_are_read_instead_of_dropped(env, text, expected):
    _write_db(env, _line(text, "Odd format"))
    df = storage.load_transactions("Personal")
    assert len(df) == 1
    assert df.iloc[0]["Date"] == pd.Timestamp(expected)


def test_a_non_standard_date_survives_an_unrelated_edit(env, client):
    _write_db(env, _line("05/01/2026", "Keep"), _line("2026-01-06", "IsoDated", "2.00"))
    assert client.patch("/api/transactions/0", json={"Notes": "edited"}).status_code == 200
    names = list(storage.load_transactions("Personal")["Name"])
    assert names == ["Keep", "IsoDated"]
    saved = (env / "expense_database.csv").read_text()
    assert "06/01/2026,IsoDated" in saved  # normalised to DD/MM/YYYY on save


# --- unreadable dates are set aside, not lost -------------------------------------


def test_unreadable_rows_are_hidden_from_the_app(env):
    _write_db(env, _line("05/01/2026", "Good"), _line("31/02/2026", "Bad"), _line("", "Blank"))
    assert list(storage.load_transactions("Personal")["Name"]) == ["Good"]


def test_unreadable_rows_are_kept_in_a_rejected_file_on_the_next_save(env):
    _write_db(
        env,
        _line("05/01/2026", "Good"),
        _line("31/02/2026", "Bad one", "9.99"),
        _line("garbage", "Bad two", "8.50"),
    )
    storage.save_transactions("Personal", storage.load_transactions("Personal"))

    main_csv = (env / "expense_database.csv").read_text()
    assert "Bad one" not in main_csv and "Bad two" not in main_csv

    rejected = (env / "expense_database.rejected.csv").read_text()
    assert "31/02/2026,Bad one,9.99" in rejected
    assert "garbage,Bad two,8.50" in rejected
    assert rejected.splitlines()[0] == HEADER.strip()


def test_rejected_rows_are_not_duplicated_by_later_saves_but_do_accumulate(env):
    _write_db(env, _line("05/01/2026", "Good"), _line("31/02/2026", "First bad"))
    storage.save_transactions("Personal", storage.load_transactions("Personal"))
    storage.save_transactions("Personal", storage.load_transactions("Personal"))
    assert (env / "expense_database.rejected.csv").read_text().count("First bad") == 1

    # a later bad row appears (e.g. hand edit); the earlier one is still there
    with open(env / "expense_database.csv", "a") as f:
        f.write(_line("not a date", "Second bad") + "\n")
    storage.save_transactions("Personal", storage.load_transactions("Personal"))
    rejected = (env / "expense_database.rejected.csv").read_text()
    assert rejected.count("First bad") == 1
    assert rejected.count("Second bad") == 1


def test_clean_files_never_create_a_rejected_file(env):
    _write_db(env, _line("05/01/2026", "Good"), _line("2026-01-06", "Iso"))
    storage.save_transactions("Personal", storage.load_transactions("Personal"))
    assert not (env / "expense_database.rejected.csv").exists()


def test_rejected_file_is_scoped_per_account(env):
    (env / "expense_database_joint.csv").write_text(
        HEADER + _line("05/01/2026", "Good") + "\n" + _line("99/99/9999", "Joint bad") + "\n"
    )
    storage.save_transactions("Joint", storage.load_transactions("Joint"))
    assert (env / "expense_database_joint.rejected.csv").exists()
    assert not (env / "expense_database.rejected.csv").exists()


def test_startup_health_mentions_set_aside_rows(env):
    _write_db(env, _line("05/01/2026", "Good"), _line("31/02/2026", "Bad"))
    storage.save_transactions("Personal", storage.load_transactions("Personal"))
    health = storage.get_startup_health("Personal", True, False)
    assert any("expense_database.rejected.csv" in n and "1 row" in n for n in health["notes"])


# --- zero asset balances ----------------------------------------------------------


def test_load_assets_keeps_zero_and_still_drops_negative_and_null(env):
    storage.atomic_write_json(
        str(env / "assets.json"),
        {"2026-01-01": {"Open": 100.0, "Closed": 0.0, "Bad": -5.0, "Nothing": None}},
    )
    assert storage.load_assets("Personal") == {"2026-01-01": {"Open": 100.0, "Closed": 0.0}}


def test_closing_an_account_with_zero_lowers_net_worth(client):
    first = client.post(
        "/api/wealth/balances",
        json={"date": "2026-01-01", "asset_balances": {"A": 100.0, "B": 50.0}},
    ).json()["wealth"]
    assert first["latest_net_worth"] == 150.0

    closed = client.post(
        "/api/wealth/balances",
        json={"date": "2026-02-01", "asset_balances": {"A": 0.0, "B": 50.0}},
    ).json()["wealth"]
    assert closed["latest_balances"] == {"A": 0.0, "B": 50.0}
    assert closed["latest_assets_total"] == 50.0
    assert closed["latest_net_worth"] == 50.0
    assert "A" in closed["known_assets"]


def test_a_snapshot_of_only_zeros_is_recorded(client):
    client.post(
        "/api/wealth/balances",
        json={"date": "2026-01-01", "asset_balances": {"A": 100.0}},
    )
    wealth = client.post(
        "/api/wealth/balances",
        json={"date": "2026-02-01", "asset_balances": {"A": 0.0}},
    ).json()["wealth"]
    assert wealth["assets_by_month"]["2026-02-01"] == {"A": 0.0}
    assert wealth["latest_net_worth"] == 0.0


def test_an_omitted_account_still_carries_its_balance_forward(client):
    client.post(
        "/api/wealth/balances",
        json={"date": "2026-01-01", "asset_balances": {"A": 100.0, "B": 50.0}},
    )
    wealth = client.post(
        "/api/wealth/balances",
        json={"date": "2026-02-01", "asset_balances": {"B": 60.0}},
    ).json()["wealth"]
    assert wealth["latest_balances"] == {"A": 100.0, "B": 60.0}


def test_negative_balances_are_still_ignored(client):
    wealth = client.post(
        "/api/wealth/balances",
        json={"date": "2026-01-01", "asset_balances": {"A": 100.0, "B": -20.0}},
    ).json()["wealth"]
    assert wealth["latest_balances"] == {"A": 100.0}

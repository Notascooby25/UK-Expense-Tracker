"""Write-safety tests: file modes, previous-version safety copy, and serialised saves."""

import logging
import os
import stat
import threading
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import main, storage

DUMMY_CRED = "secret123"  # pragma: allowlist secret


@pytest.fixture()
def data_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """Isolated data dir with dev fallback auth."""
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "no_secrets.toml"))
    return tmp_path


def _rows(n: int, prefix: str = "tx") -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-03-01"),
                "Name": f"{prefix}{i}",
                "Amount": 1.0 + i,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "X",
                "Notes": "",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            }
            for i in range(n)
        ]
    )


def _mode(path) -> int:
    return stat.S_IMODE(os.stat(path).st_mode)


# --- file modes -------------------------------------------------------------------


def test_atomic_write_preserves_existing_file_mode(tmp_path):
    target = tmp_path / "data.json"
    target.write_text("{}")
    os.chmod(target, 0o640)
    storage.atomic_write_bytes(str(target), b'{"a":1}')
    assert target.read_bytes() == b'{"a":1}'
    assert _mode(target) == 0o640


def test_atomic_write_new_file_follows_umask_not_0600(tmp_path):
    old = os.umask(0o022)
    try:
        target = tmp_path / "new.json"
        storage.atomic_write_bytes(str(target), b"{}")
    finally:
        os.umask(old)
    assert _mode(target) == 0o644


def test_atomic_write_leaves_no_temp_files(tmp_path):
    storage.atomic_write_bytes(str(tmp_path / "a.json"), b"{}")
    assert [p.name for p in tmp_path.iterdir()] == ["a.json"]


# --- previous-version safety copy -------------------------------------------------


def test_first_save_creates_no_backup_copy(data_env):
    storage.save_transactions("Personal", _rows(3))
    assert (data_env / "expense_database.csv").exists()
    assert not (data_env / "expense_database.csv.bak").exists()


def test_each_save_keeps_the_previous_version_as_bak(data_env):
    db = data_env / "expense_database.csv"
    storage.save_transactions("Personal", _rows(3, "first"))
    first = db.read_bytes()
    storage.save_transactions("Personal", _rows(5, "second"))
    assert (data_env / "expense_database.csv.bak").read_bytes() == first
    second = db.read_bytes()
    storage.save_transactions("Personal", _rows(4, "third"))
    assert (data_env / "expense_database.csv.bak").read_bytes() == second


def test_bak_is_scoped_per_account(data_env):
    storage.save_transactions("Joint", _rows(2))
    storage.save_transactions("Joint", _rows(3))
    assert (data_env / "expense_database_joint.csv.bak").exists()
    assert not (data_env / "expense_database.csv.bak").exists()


def test_large_shrink_is_logged(data_env, caplog):
    storage.save_transactions("Personal", _rows(100))
    with caplog.at_level(logging.WARNING, logger="expense_tracker.storage"):
        storage.save_transactions("Personal", _rows(50))
    assert any("shrank" in r.message for r in caplog.records)


def test_normal_save_does_not_warn(data_env, caplog):
    storage.save_transactions("Personal", _rows(100))
    with caplog.at_level(logging.WARNING, logger="expense_tracker.storage"):
        storage.save_transactions("Personal", _rows(99))
        storage.save_transactions("Personal", _rows(120))
    assert not [r for r in caplog.records if "shrank" in r.message]


# --- serialised read-modify-write -------------------------------------------------


def test_storage_txn_serialises_read_modify_write(data_env):
    storage.save_transactions("Personal", _rows(0))
    barrier = threading.Barrier(16)

    def worker(i: int) -> None:
        barrier.wait()
        with storage.storage_txn():
            df = storage.load_transactions("Personal")
            df = pd.concat([df, _rows(1, f"w{i}-")], ignore_index=True)
            storage.save_transactions("Personal", df)

    with ThreadPoolExecutor(16) as pool:
        list(pool.map(worker, range(16)))
    assert len(storage.load_transactions("Personal")) == 16


def test_storage_txn_is_reentrant(data_env):
    with storage.storage_txn():
        with storage.storage_txn():
            storage.save_transactions("Personal", _rows(1))
    assert len(storage.load_transactions("Personal")) == 1


def test_parallel_api_creates_do_not_lose_rows(data_env):
    storage.save_transactions("Personal", _rows(0))
    login = TestClient(main.app).post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    cookies = dict(login.cookies)
    barrier = threading.Barrier(24)

    def create(i: int) -> int:
        client = TestClient(main.app, cookies=cookies)
        barrier.wait()
        return client.post(
            "/api/transactions",
            json={"Date": "2026-03-01", "Name": f"p{i}", "Amount": 2.0 + i, "Category": "X"},
        ).status_code

    with ThreadPoolExecutor(24) as pool:
        codes = list(pool.map(create, range(24)))
    assert codes == [200] * 24
    assert len(storage.load_transactions("Personal")) == 24


def test_parallel_bulk_and_patch_do_not_clobber_each_other(data_env):
    storage.save_transactions("Personal", _rows(30))
    login = TestClient(main.app).post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    cookies = dict(login.cookies)
    barrier = threading.Barrier(30)

    def patch(i: int) -> int:
        client = TestClient(main.app, cookies=cookies)
        barrier.wait()
        return client.patch(f"/api/transactions/{i}", json={"Notes": f"note{i}"}).status_code

    with ThreadPoolExecutor(30) as pool:
        codes = list(pool.map(patch, range(30)))
    assert codes == [200] * 30
    df = storage.load_transactions("Personal")
    assert len(df) == 30
    assert sorted(df["Notes"]) == sorted(f"note{i}" for i in range(30))

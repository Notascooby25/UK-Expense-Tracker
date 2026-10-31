"""Import correctness: Monzo split direction and the new-rows list returned to the review UI."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import main, storage
from backend.storage import COLS, parse_and_merge_import, process_monzo_splits

DUMMY_CRED = "secret123"  # pragma: allowlist secret


def _monzo(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def _import(raw: pd.DataFrame, existing: pd.DataFrame | None = None):
    existing = existing if existing is not None else pd.DataFrame(columns=COLS)
    return parse_and_merge_import(existing, raw, rules=[], source_format="Monzo")


def _by_category(df: pd.DataFrame) -> dict[str, tuple[str, float]]:
    return {r["Category"]: (r["Transaction_Type"], r["Amount"]) for _, r in df.iterrows()}


# --- split direction --------------------------------------------------------------


@pytest.mark.parametrize(
    "split_text",
    [
        "Groceries: £50.00, Household: £25.50",  # positive-format split amounts
        "Groceries: -50.00, Household: -25.50",  # negative-format split amounts
        "Groceries:-£50.00,Household:-£25.50",  # no spaces
    ],
)
def test_split_of_a_spend_is_stored_as_expenses(split_text):
    raw = _monzo(
        [
            {
                "Transaction ID": "tx1",
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "-75.50",
                "Category": "Groceries",
                "Category split": split_text,
            }
        ]
    )
    merged, new_rows, _, _ = _import(raw)
    assert _by_category(merged) == {
        "Groceries": ("Expense", 50.0),
        "Household": ("Expense", 25.5),
    }
    assert len(new_rows) == 2


def test_split_of_a_refund_is_stored_as_income():
    raw = _monzo(
        [
            {
                "Transaction ID": "tx1",
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "75.50",
                "Category": "Groceries",
                "Category split": "Groceries: 50.00, Household: 25.50",
            }
        ]
    )
    merged, _, _, _ = _import(raw)
    assert set(merged["Transaction_Type"]) == {"Income"}


def test_split_with_unreadable_parent_amount_uses_the_split_sign():
    raw = _monzo(
        [
            {
                "Transaction ID": "tx1",
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "",
                "Category": "Groceries",
                "Category split": "Groceries: -50.00, Household: -25.50",
            }
        ]
    )
    merged, _, _, _ = _import(raw)
    assert set(merged["Transaction_Type"]) == {"Expense"}


def test_split_inherits_an_explicit_parent_transaction_type():
    raw = _monzo(
        [
            {
                "Transaction ID": "tx1",
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "75.50",
                "Transaction_Type": "Expense",
                "Category": "Groceries",
                "Category split": "Groceries: 50.00, Household: 25.50",
            }
        ]
    )
    merged, _, _, _ = _import(raw)
    assert set(merged["Transaction_Type"]) == {"Expense"}


def test_split_amounts_still_sum_to_the_parent():
    raw = _monzo(
        [
            {
                "Transaction ID": "tx1",
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "-75.50",
                "Category": "Groceries",
                "Category split": "Groceries: 50.00, Household: 25.50",
            }
        ]
    )
    merged, _, _, _ = _import(raw)
    assert round(float(merged["Amount"].sum()), 2) == 75.50


def test_process_monzo_splits_sets_direction_on_split_rows_only():
    raw = _monzo(
        [
            {
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "-75.50",
                "Category": "Groceries",
                "Category split": "Groceries: 50.00, Household: 25.50",
            },
            {
                "Date": "11/03/2026",
                "Name": "Costa",
                "Amount": "-4.00",
                "Category": "Eating out",
                "Category split": "",
            },
        ]
    )
    out = process_monzo_splits(raw)
    split_rows = out[out["Name"] == "Sainsburys"]
    assert list(split_rows["Transaction_Type"]) == ["Expense", "Expense"]
    # The ordinary row is left for the normal sign-based inference
    assert pd.isna(out[out["Name"] == "Costa"]["Transaction_Type"].iloc[0])


def test_ordinary_rows_next_to_splits_still_get_a_type():
    raw = _monzo(
        [
            {
                "Transaction ID": "tx1",
                "Date": "10/03/2026",
                "Name": "Sainsburys",
                "Amount": "-75.50",
                "Category": "Groceries",
                "Category split": "Groceries: 50.00, Household: 25.50",
            },
            {
                "Transaction ID": "tx2",
                "Date": "11/03/2026",
                "Name": "Costa",
                "Amount": "-4.00",
                "Category": "Eating out",
                "Category split": "",
            },
            {
                "Transaction ID": "tx3",
                "Date": "12/03/2026",
                "Name": "Employer",
                "Amount": "2000.00",
                "Category": "Salary",
                "Category split": "",
            },
        ]
    )
    merged, _, _, _ = _import(raw)
    types = {r["Name"] + "/" + r["Category"]: r["Transaction_Type"] for _, r in merged.iterrows()}
    assert types == {
        "Costa/Eating out": "Expense",
        "Employer/Salary": "Income",
        "Sainsburys/Groceries": "Expense",
        "Sainsburys/Household": "Expense",
    }
    assert "" not in set(merged["Transaction_Type"])


def test_blank_types_in_a_partly_filled_column_are_inferred_from_the_sign():
    raw = _monzo(
        [
            {
                "Transaction ID": "a",
                "Date": "10/03/2026",
                "Name": "A",
                "Amount": "-5.00",
                "Transaction_Type": "Expense",
                "Category": "X",
            },  # fmt: skip
            {
                "Transaction ID": "b",
                "Date": "11/03/2026",
                "Name": "B",
                "Amount": "-6.00",
                "Transaction_Type": "",
                "Category": "X",
            },  # fmt: skip
            {
                "Transaction ID": "c",
                "Date": "12/03/2026",
                "Name": "C",
                "Amount": "7.00",
                "Transaction_Type": None,
                "Category": "X",
            },  # fmt: skip
        ]
    )
    merged, _, _, _ = _import(raw)
    assert {r["Name"]: r["Transaction_Type"] for _, r in merged.iterrows()} == {
        "A": "Expense",
        "B": "Expense",
        "C": "Income",
    }


def test_existing_split_tests_still_describe_unsplit_parent_replacement():
    existing = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-05-10"),
                "Name": "Sainsburys",
                "Amount": 75.50,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",
                "Notes": "",
                "Financial_Year": "2026-2027",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            }
        ]
    )
    raw = _monzo(
        [
            {
                "Date": "10/05/2026",
                "Name": "Sainsburys",
                "Amount": "-75.50",
                "Category": "Groceries",
                "Category split": "Groceries: £50.00, Household: £25.50",
            }
        ]
    )
    merged, _, _, _ = _import(raw, existing)
    assert len(merged) == 2
    assert set(merged["Transaction_Type"]) == {"Expense"}


# --- new-rows list returned to the review UI --------------------------------------


@pytest.fixture()
def api(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "no_secrets.toml"))
    client = TestClient(main.app)
    client.post(
        "/api/auth/login",
        json={"username": "admin", "password": DUMMY_CRED, "remember_me": True},
    )
    return client


def _existing_unsplit_parent() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2026-03-10"),
                "Name": "Sainsburys",
                "Amount": 75.50,
                "Transaction_Type": "Expense",
                "Bank": "Monzo",
                "Category": "Groceries",
                "Notes": "",
                "Financial_Year": "2025-2026",
                "Is_Subscription": False,
                "Is_Exceptional": False,
            }
        ]
    )


SPLIT_TSV = (
    "Transaction ID\tDate\tName\tAmount\tCategory\tCategory split\n"
    "tx1\t10/03/2026\tSainsburys\t-75.50\tGroceries\tGroceries: 50.00, Household: 25.50\n"
)


def test_retrospective_split_returns_every_new_row_to_the_review_list(api):
    storage.save_transactions("Personal", _existing_unsplit_parent())
    resp = api.post(
        "/api/sync/import-paste", json={"pasted_text": SPLIT_TSV, "source_format": "Monzo"}
    ).json()
    assert resp["new_count"] == 2
    assert len(resp["new_rows"]) == 2
    on_disk = storage.load_transactions("Personal")
    assert len(on_disk) == 2
    for row in resp["new_rows"]:
        stored = on_disk.iloc[row["row_id"]]
        assert stored["Name"] == row["Name"]
        assert stored["Category"] == row["Category"]
        assert row["Transaction_Type"] == "Expense"


def test_plain_import_still_returns_only_the_new_rows(api):
    storage.save_transactions("Personal", _existing_unsplit_parent())
    tsv = (
        "Transaction ID\tDate\tName\tAmount\tCategory\ntx9\t15/03/2026\tCosta\t-4.00\tEating out\n"
    )
    resp = api.post(
        "/api/sync/import-paste", json={"pasted_text": tsv, "source_format": "Monzo"}
    ).json()
    assert resp["new_count"] == 1
    assert resp["new_rows"][0]["Name"] == "Costa"
    assert resp["new_rows"][0]["row_id"] == 1  # appended after the one existing row

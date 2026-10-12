"""Atomic file storage, scoped path resolution, and bank import parsers."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from typing import Any

import pandas as pd

_STORAGE_LOCK = threading.RLock()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ACCOUNT_SCOPE_PERSONAL = "Personal"
ACCOUNT_SCOPE_JOINT = "Joint"
ACCOUNT_SCOPES = [ACCOUNT_SCOPE_PERSONAL, ACCOUNT_SCOPE_JOINT]

COLS = [
    "Date",
    "Name",
    "Amount",
    "Transaction_Type",
    "Bank",
    "Category",
    "Notes",
    "Financial_Year",
    "Is_Subscription",
]

INTERNAL_CATEGORIES = [
    "Savings",
    "Investments - ISA",
    "Investment - ISA",
    "Transfers",
    "Investment - Crypto",
]

TRUE_INCOME_CATEGORIES = [
    "Income",
    "Salary",
    "Wages",
    "Interest",
    "Bonus",
    "BE Secondary Salary Wages",
]

SMART_SUBSCRIPTION_KEYWORDS = [
    "netflix",
    "spotify",
    "amazon prime",
    "amznprime",
    "amzn prm",
    "nordvpn",
    "expressvpn",
    "surfshark",
    "gym",
    "puregym",
    "the gym group",
    "nuffield health",
    "david lloyd",
    "hellofresh",
    "gousto",
    "disney plus",
    "disney+",
    "apple.com/bill",
    "google play",
    "youtube premium",
    "patreon",
    "adobe",
    "microsoft 365",
    "dropbox",
    "icloud",
    "squarespace",
    "wix",
    "aws",
    "digitalocean",
    "strava",
    "zwift",
    "peloton",
    "playstation",
    "xbox live",
    "nintendo",
    "crunchyroll",
    "audible",
    "deliveroo plus",
    "uber one",
]

DEFAULT_SETTINGS: dict[str, Any] = {
    "ignore_suggestions": [],
    "ignore_recurring": [],
    "custom_categories": [],
    "custom_banks": [],
    "committed_categories": [],
    "exceptional_categories": [],
    "committed_presets": {},
    "auto_rules": [],
    "monzo_sheet_url": "",
    "monzo_sheet_worksheet": "",
}


def normalize_scope(scope: str | None) -> str:
    """Return validated scope ('Personal' or 'Joint')."""
    if scope == ACCOUNT_SCOPE_JOINT:
        return ACCOUNT_SCOPE_JOINT
    return ACCOUNT_SCOPE_PERSONAL


def get_scoped_filename(base_filename: str, account_scope: str) -> str:
    """Return scoped filename (Personal uses base, Joint appends _joint)."""
    scope = normalize_scope(account_scope)
    if scope == ACCOUNT_SCOPE_PERSONAL:
        return base_filename
    stem, ext = os.path.splitext(base_filename)
    return f"{stem}_joint{ext}"


def resolve_scope_paths(account_scope: str) -> dict[str, str]:
    """Return resolved runtime paths for db, settings, filters, and assets."""
    scope = normalize_scope(account_scope)
    data_dir = os.getenv("EXPENSE_TRACKER_DATA_DIR", BASE_DIR)
    base_db = os.getenv("EXPENSE_TRACKER_DB_FILE", "expense_database.csv")
    base_settings = os.getenv("EXPENSE_TRACKER_SETTINGS_FILE", "settings.json")
    base_filters = os.getenv("EXPENSE_TRACKER_FILTERS_FILE", "saved_filters.json")

    return {
        "data_dir": data_dir,
        "db": os.path.join(data_dir, get_scoped_filename(base_db, scope)),
        "settings": os.path.join(data_dir, get_scoped_filename(base_settings, scope)),
        "filters": os.path.join(data_dir, get_scoped_filename(base_filters, scope)),
        "assets": os.path.join(data_dir, get_scoped_filename("assets.json", scope)),
    }


def get_read_path(filepath: str) -> str:
    """Return filepath if it exists, or legacy root-directory fallback if present."""
    if os.path.exists(filepath):
        return filepath
    # Only fall back to BASE_DIR when EXPENSE_TRACKER_DATA_DIR is not explicitly overridden in tests
    env_data_dir = os.getenv("EXPENSE_TRACKER_DATA_DIR")
    if not env_data_dir or os.path.abspath(env_data_dir) == os.path.abspath(BASE_DIR):
        legacy_path = os.path.join(BASE_DIR, os.path.basename(filepath))
        if os.path.exists(legacy_path):
            return legacy_path
    return filepath


def clean_string(val: object) -> str:
    """Normalize string values, stripping whitespace and null-like string tokens."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    return "" if s.lower() in {"nan", "none", "nat", "null"} else s


def calculate_uk_financial_year(date_obj: object) -> str:
    """Calculate UK Financial Year (6 April boundary) in 'YYYY-YYYY' format."""
    if date_obj is None or pd.isna(date_obj):
        return "Unknown"
    try:
        ts = pd.to_datetime(date_obj)
        year = int(ts.year)
        if (ts.month < 4) or (ts.month == 4 and ts.day < 6):
            return f"{year - 1}-{year}"
        return f"{year}-{year + 1}"
    except Exception:
        return "Unknown"


def atomic_write_bytes(filepath: str, payload: bytes) -> None:
    """Atomically write bytes to filepath using a temporary file and os.replace."""
    with _STORAGE_LOCK:
        target_dir = os.path.dirname(os.path.abspath(filepath)) or "."
        os.makedirs(target_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=target_dir, prefix=".tmp_expense_", delete=False
        ) as tmp_file:
            tmp_name = tmp_file.name
            tmp_file.write(payload)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        os.replace(tmp_name, filepath)


def load_json_file(filepath: str) -> dict[str, Any]:
    """Read a JSON dictionary from disk, returning empty dict on missing/invalid file."""
    with _STORAGE_LOCK:
        candidate = get_read_path(filepath)
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return data
            except Exception:
                pass
        return {}


def atomic_write_json(filepath: str, data: dict[str, Any]) -> None:
    """Atomically serialize a dictionary as UTF-8 JSON."""
    payload = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
    atomic_write_bytes(filepath, payload)


def with_default_settings(settings: dict[str, Any] | None, scope: str) -> dict[str, Any]:
    """Merge loaded settings with DEFAULT_SETTINGS and scope-appropriate worksheet name."""
    norm_scope = normalize_scope(scope)
    merged: dict[str, Any] = {
        k: (list(v) if isinstance(v, list) else (dict(v) if isinstance(v, dict) else v))
        for k, v in DEFAULT_SETTINGS.items()
    }
    default_ws = (
        "Joint Account Transactions"
        if norm_scope == ACCOUNT_SCOPE_JOINT
        else "Personal Account Transactions"
    )
    merged["monzo_sheet_worksheet"] = default_ws
    if isinstance(settings, dict):
        merged.update(settings)
    if not str(merged.get("monzo_sheet_worksheet", "")).strip():
        merged["monzo_sheet_worksheet"] = default_ws
    for list_key in (
        "auto_rules",
        "custom_categories",
        "custom_banks",
        "committed_categories",
        "exceptional_categories",
        "ignore_suggestions",
        "ignore_recurring",
    ):
        if not isinstance(merged.get(list_key), list):
            merged[list_key] = []
    if not isinstance(merged.get("committed_presets"), dict):
        merged["committed_presets"] = {}
    return merged


def load_settings(scope: str) -> dict[str, Any]:
    """Load scoped settings merged with defaults."""
    paths = resolve_scope_paths(scope)
    raw = load_json_file(paths["settings"])
    return with_default_settings(raw, scope)


def save_settings(scope: str, settings: dict[str, Any]) -> dict[str, Any]:
    """Atomically save scoped settings to disk and return normalized dict."""
    paths = resolve_scope_paths(scope)
    normalized = with_default_settings(settings, scope)
    atomic_write_json(paths["settings"], normalized)
    return normalized


def load_filters(scope: str) -> dict[str, Any]:
    """Load saved filter presets for the given scope."""
    paths = resolve_scope_paths(scope)
    return load_json_file(paths["filters"])


def save_filters(scope: str, filters: dict[str, Any]) -> None:
    """Atomically save filter presets for the given scope."""
    paths = resolve_scope_paths(scope)
    atomic_write_json(paths["filters"], filters)


def load_assets(scope: str) -> dict[str, dict[str, float]]:
    """Load monthly asset balances for the given scope."""
    paths = resolve_scope_paths(scope)
    raw = load_json_file(paths["assets"])
    cleaned: dict[str, dict[str, float]] = {}
    for month, balances in raw.items():
        if isinstance(balances, dict):
            cleaned[str(month)] = {
                str(k): round(float(v), 2)
                for k, v in balances.items()
                if v is not None and float(v) > 0
            }
    return cleaned


def save_assets(scope: str, assets: dict[str, dict[str, float]]) -> None:
    """Atomically save monthly asset balances for the given scope."""
    paths = resolve_scope_paths(scope)
    atomic_write_json(paths["assets"], assets)


def load_transactions(scope: str) -> pd.DataFrame:
    """Load scoped transactions CSV into a normalized DataFrame."""
    with _STORAGE_LOCK:
        paths = resolve_scope_paths(scope)
        db_read_path = get_read_path(paths["db"])
        example_file = os.path.join(BASE_DIR, "expense_database.example.csv")

        if not os.path.exists(db_read_path):
            env_data_dir = os.getenv("EXPENSE_TRACKER_DATA_DIR")
            if (
                not env_data_dir or os.path.abspath(env_data_dir) == os.path.abspath(BASE_DIR)
            ) and os.path.exists(example_file):
                db_read_path = example_file
            else:
                return pd.DataFrame(columns=COLS)

        try:
            df = pd.read_csv(db_read_path, encoding="utf-8")
        except Exception:
            df = pd.read_csv(db_read_path, encoding="ISO-8859-1")

        if df.empty:
            return pd.DataFrame(columns=COLS)

        for col in COLS:
            if col not in df.columns:
                df[col] = False if col == "Is_Subscription" else ""

        df["Date"] = pd.to_datetime(df["Date"], format="%d/%m/%Y", errors="coerce").dt.normalize()
        df = df.dropna(subset=["Date"]).copy()
        df["Amount"] = pd.to_numeric(df["Amount"], errors="coerce").fillna(0.0).abs().round(2)

        for col in ("Name", "Category", "Transaction_Type", "Bank", "Notes", "Financial_Year"):
            df[col] = df[col].fillna("").astype(str).apply(clean_string)

        # Ensure Financial_Year is populated
        missing_fy = df["Financial_Year"] == ""
        if missing_fy.any():
            df.loc[missing_fy, "Financial_Year"] = df.loc[missing_fy, "Date"].apply(
                calculate_uk_financial_year
            )

        if "Is_Subscription" not in df.columns:
            df["Is_Subscription"] = False
        else:
            df["Is_Subscription"] = (
                df["Is_Subscription"]
                .apply(
                    lambda x: (
                        str(x).strip().lower() in {"true", "1", "yes"}
                        if not isinstance(x, bool)
                        else x
                    )
                )
                .astype(bool)
            )

        return df[COLS].reset_index(drop=True)


def save_transactions(scope: str, df: pd.DataFrame) -> None:
    """Atomically write transactions DataFrame to disk with DD/MM/YYYY dates."""
    with _STORAGE_LOCK:
        paths = resolve_scope_paths(scope)
        if df.empty:
            export_df = pd.DataFrame(columns=COLS)
        else:
            export_df = df.copy()
            for col in COLS:
                if col not in export_df.columns:
                    export_df[col] = False if col == "Is_Subscription" else ""
            export_df["Date"] = pd.to_datetime(export_df["Date"], errors="coerce").dt.normalize()
            export_df = export_df.dropna(subset=["Date"]).copy()
            export_df["Amount"] = (
                pd.to_numeric(export_df["Amount"], errors="coerce").fillna(0.0).abs().round(2)
            )
            for col in ("Name", "Category", "Transaction_Type", "Bank", "Notes"):
                export_df[col] = export_df[col].fillna("").astype(str).apply(clean_string)
            export_df["Financial_Year"] = export_df["Date"].apply(calculate_uk_financial_year)
            export_df["Is_Subscription"] = export_df["Is_Subscription"].fillna(False).astype(bool)
            export_df["Date"] = export_df["Date"].dt.strftime("%d/%m/%Y")
            export_df = export_df[COLS]

        csv_bytes = export_df.to_csv(index=False, encoding="utf-8").encode("utf-8")
        atomic_write_bytes(paths["db"], csv_bytes)


def get_pure_monzo_categories(df: pd.DataFrame) -> set[str]:
    """Return distinct non-empty Monzo categories excluding Miscellaneous/Unknown."""
    if df.empty or "Bank" not in df.columns or "Category" not in df.columns:
        return set()
    raw = set(df[df["Bank"] == "Monzo"]["Category"].dropna().unique())
    return {clean_string(c) for c in raw if clean_string(c) not in {"Miscellaneous", "Unknown", ""}}


def get_master_categories(df: pd.DataFrame, settings: dict[str, Any]) -> list[str]:
    """Return sorted list of master categories for dropdowns."""
    pure_monzo = get_pure_monzo_categories(df)
    custom = {clean_string(c) for c in settings.get("custom_categories", []) if clean_string(c)}
    used = (
        {clean_string(c) for c in df["Category"].dropna().unique() if clean_string(c)}
        if not df.empty and "Category" in df.columns
        else set()
    )
    master = sorted(pure_monzo.union(custom).union(used).union({"Subscriptions"}))
    if not master or master == ["Subscriptions"]:
        return [
            "Groceries",
            "Miscellaneous",
            "Savings",
            "Subscriptions",
            "Travel",
            "Utilities",
        ]
    return master


def get_master_banks(df: pd.DataFrame, settings: dict[str, Any]) -> list[str]:
    """Return sorted list of master banks."""
    used = (
        {clean_string(b) for b in df["Bank"].dropna().unique() if clean_string(b)}
        if not df.empty and "Bank" in df.columns
        else set()
    )
    custom = {clean_string(b) for b in settings.get("custom_banks", []) if clean_string(b)}
    return sorted(used.union(custom))


def process_monzo_splits(df: pd.DataFrame) -> pd.DataFrame:
    """Scan for Monzo split columns, drop parent row, and append separated split rows."""
    split_col = None
    for col in ("Category split", "Categories", "metadata_categories"):
        if col in df.columns:
            split_col = col
            break
    if not split_col:
        return df

    new_rows: list[pd.Series] = []
    rows_to_drop: list[Any] = []
    for index, row in df.iterrows():
        split_data = str(row[split_col])
        if split_data != "nan" and split_data.strip() != "" and ":" in split_data:
            rows_to_drop.append(index)
            try:
                splits = split_data.split(",")
                for split in splits:
                    cat, amount = split.split(":")
                    new_row = row.copy()
                    new_row["Category"] = cat.strip()
                    new_row["Amount"] = abs(float(amount.strip()))
                    new_rows.append(new_row)
            except Exception:
                rows_to_drop.remove(index)

    out = df.copy()
    if rows_to_drop:
        out = out.drop(rows_to_drop)
    if new_rows:
        out = pd.concat([out, pd.DataFrame(new_rows)], ignore_index=True)
    return out


def apply_smart_dictionary(df: pd.DataFrame) -> pd.DataFrame:
    """Flag transactions whose Name or Notes match SMART_SUBSCRIPTION_KEYWORDS."""
    if df.empty:
        return df
    out = df.copy()
    if "Is_Subscription" not in out.columns:
        out["Is_Subscription"] = False

    for idx, row in out.iterrows():
        name = str(row.get("Name", "")).lower()
        notes = str(row.get("Notes", "")).lower()
        for keyword in SMART_SUBSCRIPTION_KEYWORDS:
            if keyword in name or keyword in notes:
                out.at[idx, "Is_Subscription"] = True
                break
    return out


def rule_contains(text: object, fragment: object) -> bool:
    """Case-insensitive substring check; empty fragment always matches."""
    frag = clean_string(fragment)
    if not frag:
        return True
    return frag.lower() in clean_string(text).lower()


def get_matching_auto_rule(
    row: dict[str, Any] | pd.Series, rules: list[dict[str, Any]]
) -> tuple[int | None, dict[str, Any] | None]:
    """Return (rule_index, rule_dict) for the first matching auto-categorisation rule."""
    if not rules:
        return None, None

    for idx, rule in enumerate(rules):
        if not isinstance(rule, dict):
            continue
        if not rule_contains(row.get("Notes", ""), rule.get("notes_contains", "")):
            continue
        if not rule_contains(row.get("Name", ""), rule.get("name_contains", "")):
            continue

        max_amt = rule.get("max_amount")
        if max_amt is not None:
            try:
                max_amt_f = float(max_amt)
            except (TypeError, ValueError):
                max_amt_f = 0.0
            if max_amt_f > 0:
                row_amt = row.get("Amount")
                if row_amt is not None:
                    try:
                        if float(row_amt) >= max_amt_f:
                            continue
                    except (TypeError, ValueError):
                        pass

        return idx, rule

    return None, None


def apply_auto_rules(df: pd.DataFrame, rules: list[dict[str, Any]]) -> pd.DataFrame:
    """Apply priority auto_rules to set Category on matching rows."""
    if not rules or df.empty:
        return df
    out = df.copy()
    if "Category" not in out.columns:
        out["Category"] = ""

    for idx, row in out.iterrows():
        _, rule = get_matching_auto_rule(row, rules)
        if rule:
            category = clean_string(rule.get("category", ""))
            if category:
                out.at[idx, "Category"] = category
    return out


def parse_and_merge_import(
    existing_df: pd.DataFrame,
    raw_df: pd.DataFrame,
    rules: list[dict[str, Any]],
    source_format: str = "Auto-Detect",
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, list[dict[str, Any]]]:
    """
    Parse an incoming DataFrame (Monzo, HSBC, Barclaycard, or Manual/Auto-Detect)
    and merge against existing_df.
    Returns (merged_df, new_rows_df, updated_rows_df, conflicts_list).
    """
    if raw_df is None or raw_df.empty:
        empty = pd.DataFrame(columns=COLS)
        return existing_df.copy(), empty, empty, []

    new_df = raw_df.copy()
    cols_lower = [str(c).lower().strip() for c in new_df.columns]
    is_monzo = "transaction id" in cols_lower or source_format == "Monzo"
    is_hsbc = ("paid out" in cols_lower and "paid in" in cols_lower) or source_format == "HSBC"
    is_barclaycard = source_format == "Barclaycard" or (
        len(new_df.columns) == 7 and not is_hsbc and not is_monzo and "date" not in cols_lower
    )

    if is_monzo:
        new_df = new_df.rename(columns={"Notes and #tags": "Notes"})
        new_df["Bank"] = "Monzo"
        new_df = process_monzo_splits(new_df)

    elif is_hsbc:
        new_df = new_df.rename(columns={"Description": "Name"})
        paid_out = pd.to_numeric(
            new_df["Paid out"].astype(str).str.replace(r"[£,]", "", regex=True), errors="coerce"
        ).fillna(0.0)
        paid_in = pd.to_numeric(
            new_df["Paid in"].astype(str).str.replace(r"[£,]", "", regex=True), errors="coerce"
        ).fillna(0.0)
        new_df["Paid out"] = paid_out
        new_df["Paid in"] = paid_in
        new_df["Amount"] = new_df.apply(
            lambda r: r["Paid in"] if r["Paid in"] > 0 else r["Paid out"], axis=1
        )
        new_df["Transaction_Type"] = new_df.apply(
            lambda r: "Income" if r["Paid in"] > 0 else "Expense", axis=1
        )
        new_df["Bank"] = "HSBC"

    elif is_barclaycard:
        if (
            not isinstance(new_df.columns[0], (int, float))
            and str(new_df.columns[0]).lower() != "date"
        ):
            header_row = pd.DataFrame([new_df.columns.values], columns=new_df.columns)
            new_df = pd.concat([header_row, new_df], ignore_index=True)

        new_df.columns = range(len(new_df.columns))
        if len(new_df.columns) >= 7:
            new_df["Date"] = new_df.iloc[:, 0]
            new_df["Name"] = new_df.iloc[:, 1]
            new_df["Bank"] = "Barclaycard"

            raw_cat = new_df.iloc[:, 4].astype(str).str.strip()
            new_df["Category"] = raw_cat.replace(
                ["", "nan", "NaN", "None", "Unnamed: 4", "n/a"], "Transfers"
            )

            col_in = pd.to_numeric(
                new_df.iloc[:, 5].astype(str).str.replace(r"[^\d.-]", "", regex=True),
                errors="coerce",
            ).fillna(0.0)
            col_out = pd.to_numeric(
                new_df.iloc[:, 6].astype(str).str.replace(r"[^\d.-]", "", regex=True),
                errors="coerce",
            ).fillna(0.0)

            new_df["Amount"] = col_in.abs() + col_out.abs()
            new_df["Transaction_Type"] = col_in.apply(lambda x: "Income" if x != 0 else "Expense")

    if "Date" not in new_df.columns:
        empty = pd.DataFrame(columns=COLS)
        return existing_df.copy(), empty, empty, []

    if "Transaction_Type" not in new_df.columns and "Amount" in new_df.columns:
        raw_amt = pd.to_numeric(
            new_df["Amount"].astype(str).str.replace(r"[^\d.-]", "", regex=True),
            errors="coerce",
        ).fillna(0.0)
        new_df["Transaction_Type"] = raw_amt.apply(lambda x: "Income" if x > 0 else "Expense")
        new_df["Amount"] = raw_amt.abs()

    for c in COLS:
        if c not in new_df.columns:
            new_df[c] = False if c == "Is_Subscription" else ""

    new_df["Date"] = pd.to_datetime(new_df["Date"], dayfirst=True, errors="coerce").dt.normalize()
    new_df = new_df.dropna(subset=["Date"]).copy()
    new_df["Financial_Year"] = new_df["Date"].apply(calculate_uk_financial_year)
    new_df["Amount"] = pd.to_numeric(new_df["Amount"], errors="coerce").fillna(0.0).abs().round(2)
    for col in ("Name", "Category", "Transaction_Type", "Bank", "Notes"):
        new_df[col] = new_df[col].apply(clean_string)

    new_df = apply_smart_dictionary(new_df)
    new_df = apply_auto_rules(new_df, rules)

    merged_df = existing_df.copy() if not existing_df.empty else pd.DataFrame(columns=COLS)
    new_list: list[pd.Series] = []
    updated_list: list[pd.Series] = []
    conflicts_list: list[dict[str, Any]] = []
    matched_indexes: set[Any] = set()

    for _, row in new_df.iterrows():
        if merged_df.empty:
            new_list.append(row[COLS])
            continue

        db_names = merged_df["Name"].fillna("").astype(str).str.strip()
        row_name = str(row["Name"]).strip() if pd.notna(row["Name"]) else ""

        mask = (
            (merged_df["Date"] == row["Date"])
            & (db_names == row_name)
            & (pd.to_numeric(merged_df["Amount"]).round(2) == round(float(row["Amount"]), 2))
        )

        matches = [i for i in merged_df.index[mask] if i not in matched_indexes]
        if matches:
            idx = matches[0]
            matched_indexes.add(idx)
            old_cat = clean_string(merged_df.loc[idx, "Category"])
            new_cat = clean_string(row["Category"])
            if old_cat == "" and new_cat != "":
                merged_df.loc[idx, "Category"] = new_cat
                updated_list.append(row[COLS])
            elif old_cat != "" and new_cat != "" and old_cat != new_cat:
                conflicts_list.append(
                    {
                        "_row_id": int(idx),
                        "Date": str(
                            pd.to_datetime(merged_df.loc[idx, "Date"]).strftime("%Y-%m-%d")
                        ),
                        "Date_Display": str(
                            pd.to_datetime(merged_df.loc[idx, "Date"]).strftime("%d/%m/%Y")
                        ),
                        "Name": str(merged_df.loc[idx, "Name"]),
                        "Amount": float(merged_df.loc[idx, "Amount"]),
                        "current_category": old_cat,
                        "incoming_category": new_cat,
                    }
                )
        else:
            new_list.append(row[COLS])

    new_rows_df = pd.DataFrame(new_list, columns=COLS) if new_list else pd.DataFrame(columns=COLS)
    updated_rows_df = (
        pd.DataFrame(updated_list, columns=COLS) if updated_list else pd.DataFrame(columns=COLS)
    )

    if not new_rows_df.empty:
        merged_df = pd.concat([merged_df, new_rows_df], ignore_index=True)

    return (
        merged_df.reset_index(drop=True),
        new_rows_df.reset_index(drop=True),
        updated_rows_df.reset_index(drop=True),
        conflicts_list,
    )


def get_startup_health(
    scope: str, has_auth_secrets: bool, require_auth_secrets: bool
) -> dict[str, Any]:
    """Return startup health check diagnostics for the active scope."""
    paths = resolve_scope_paths(scope)
    checks = [
        ("Database", paths["db"], os.path.join(BASE_DIR, "expense_database.example.csv")),
        ("Settings", paths["settings"], os.path.join(BASE_DIR, "settings.example.json")),
        ("Saved filters", paths["filters"], os.path.join(BASE_DIR, "saved_filters.example.json")),
    ]
    errors: list[str] = []
    notes: list[str] = []

    for label, runtime_file, template_file in checks:
        read_path = get_read_path(runtime_file)
        if os.path.exists(read_path):
            if read_path != runtime_file:
                notes.append(f"{label} is loading from legacy path: {read_path}")
            continue
        if os.path.exists(template_file):
            notes.append(f"{label} will initialize from template on first save: {runtime_file}")
        else:
            errors.append(f"{label} file missing: {runtime_file}")

    if not has_auth_secrets:
        if require_auth_secrets:
            errors.append(
                "Auth secrets missing. Set [auth] username/password in .streamlit/secrets.toml."
            )
        else:
            notes.append(
                "Auth secrets missing. Development fallback auth is enabled; do not use in production."
            )

    return {
        "healthy": len(errors) == 0,
        "errors": errors,
        "notes": notes,
        "data_dir": paths["data_dir"],
        "db_file": os.path.basename(paths["db"]),
        "settings_file": os.path.basename(paths["settings"]),
        "filters_file": os.path.basename(paths["filters"]),
        "assets_file": os.path.basename(paths["assets"]),
    }

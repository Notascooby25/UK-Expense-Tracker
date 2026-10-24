"""FastAPI application entrypoint serving the UK Expense Tracker REST API and React SPA."""

from __future__ import annotations

import io
import os
import secrets
from typing import Any

import pandas as pd
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.analytics import (
    build_category_drilldown,
    build_dashboard_data,
    build_intelligence_data,
    build_wealth_data,
)
from backend.auth import (
    COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    create_session_token,
    get_auth_credentials,
    has_auth_secrets,
    is_auth_secrets_required,
    require_auth,
    verify_session_token,
)
from backend.changelog import APP_VERSION, CHANGELOG
from backend.gsheets import fetch_google_sheet_dataframe
from backend.storage import (
    ACCOUNT_SCOPES,
    BASE_DIR,
    COLS,
    apply_auto_rules,
    apply_smart_dictionary,
    calculate_uk_financial_year,
    clean_string,
    get_master_banks,
    get_master_categories,
    get_matching_auto_rule,
    get_startup_health,
    add_mortgage_overpayment,
    update_mortgage_overpayment,
    delete_mortgage_overpayment,
    load_assets,
    load_debts,
    load_filters,
    load_mortgage,
    load_settings,
    load_transactions,
    normalize_scope,
    parse_and_merge_import,
    save_assets,
    save_debts,
    save_filters,
    save_settings,
    save_transactions,
    update_mortgage_profile,
)
from backend.mortgage_utils import (
    calculate_annual_allowance,
    calculate_mortgage_summary,
)

app = FastAPI(title="UK Finance Tracker API", version=APP_VERSION)


# --- Pydantic Schemas ---
class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = True


class TransactionCreateRequest(BaseModel):
    Date: str
    Name: str
    Amount: float
    Transaction_Type: str = "Expense"
    Bank: str = "Manual"
    Category: str = ""
    Notes: str = ""
    Is_Subscription: bool = False
    Is_Exceptional: bool = False


class TransactionPatchRequest(BaseModel):
    Date: str | None = None
    Name: str | None = None
    Amount: float | None = None
    Transaction_Type: str | None = None
    Bank: str | None = None
    Category: str | None = None
    Notes: str | None = None
    Is_Subscription: bool | None = None
    Is_Exceptional: bool | None = None


class BulkTransactionsRequest(BaseModel):
    action: str  # "update" or "delete"
    row_ids: list[int] = Field(default_factory=list)
    category: str | None = None
    transaction_type: str | None = None
    is_subscription: bool | None = None
    is_exceptional: bool | None = None


class GSheetsSyncRequest(BaseModel):
    sheet_url: str | None = None
    worksheet_name: str | None = None
    auto_save_new: bool = True


class PasteImportRequest(BaseModel):
    pasted_text: str
    source_format: str = "Auto-Detect"


class SyncConfirmRow(BaseModel):
    row_id: int | None = None
    Date: str
    Name: str
    Amount: float
    Transaction_Type: str
    Bank: str
    Category: str
    Notes: str = ""
    Is_Subscription: bool = False
    Is_Exceptional: bool = False


class SyncConfirmRequest(BaseModel):
    rows: list[SyncConfirmRow]


class ConflictResolutionItem(BaseModel):
    row_id: int
    category: str
    name: str = ""
    memorize: bool = False


class ResolveConflictsRequest(BaseModel):
    resolutions: list[ConflictResolutionItem]
    memorize_all: bool = False


class IntelligenceActionRequest(BaseModel):
    action: str
    category: str | None = None
    merchant: str | None = None
    merchants: list[str] = Field(default_factory=list)
    from_category: str | None = None
    to_category: str | None = None
    row_id: int | None = None
    signature: str | None = None
    horizon: str | None = None


class WealthBalanceSaveRequest(BaseModel):
    date: str = ""
    month: str = ""
    balances: dict[str, float] | None = None
    asset_balances: dict[str, float] | None = None
    debt_balances: dict[str, float] | None = None
    loans_metadata: dict[str, dict[str, float]] | None = None


class WealthAccountManageRequest(BaseModel):
    action: str  # "delete" or "rename"
    account: str
    new_name: str | None = None
    account_type: str = "asset"  # "asset" or "debt"


class TestRuleRequest(BaseModel):
    name: str = ""
    notes: str = ""
    amount: float = 0.0


class MortgageProfileRequest(BaseModel):
    original_balance: float = Field(default=0.0, ge=0.0)
    current_balance: float = Field(default=0.0, ge=0.0)
    interest_rate: float = Field(default=0.0, ge=0.0)
    monthly_payment: float = Field(default=0.0, ge=0.0)
    remaining_term_months: int = Field(default=0, ge=0)
    deal_expiry_date: str = ""
    mortgage_type: str = "Fixed Rate"


class MortgageOverpaymentRequest(BaseModel):
    date: str
    amount: float = Field(gt=0.0)
    type: str = "Monthly"
    notes: str = ""


class MortgageCalculationRequest(BaseModel):
    principal: float = Field(gt=0.0)
    annual_rate_pct: float = Field(ge=0.0)
    monthly_payment: float = Field(ge=0.0)
    term_months: int = Field(gt=0)
    monthly_overpayment: float = Field(default=0.0, ge=0.0)
    lump_sum: float = Field(default=0.0, ge=0.0)
    past_overpayments: float = Field(default=0.0, ge=0.0)


# --- Helpers ---
def _serialize_tx_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Serialize DataFrame rows with stable integer row_id from index."""
    if df.empty:
        return []
    rows: list[dict[str, Any]] = []
    for idx, r in df.iterrows():
        dt_val = pd.to_datetime(r["Date"], errors="coerce")
        rows.append(
            {
                "row_id": int(r["_row_id"]) if "_row_id" in df.columns else int(idx),
                "Date": dt_val.strftime("%Y-%m-%d") if pd.notna(dt_val) else "",
                "Date_Display": dt_val.strftime("%d/%m/%Y") if pd.notna(dt_val) else "",
                "Name": clean_string(r.get("Name", "")),
                "Amount": round(float(r.get("Amount", 0.0)), 2),
                "Transaction_Type": clean_string(r.get("Transaction_Type", "Expense")),
                "Bank": clean_string(r.get("Bank", "")),
                "Category": clean_string(r.get("Category", "")),
                "Notes": clean_string(r.get("Notes", "")),
                "Financial_Year": clean_string(r.get("Financial_Year", "")),
                "Is_Subscription": bool(r.get("Is_Subscription", False)),
                "Is_Exceptional": bool(r.get("Is_Exceptional", False)),
            }
        )
    return rows


def _parse_list_param(raw: list[str] | str | None) -> list[str]:
    """Parse list query parameters that might arrive as repeated params or comma-separated strings."""
    if not raw:
        return []
    raw_list = [raw] if isinstance(raw, str) else raw
    result: list[str] = []
    for item in raw_list:
        clean = item.strip()
        if not clean:
            continue
        if "," in clean:
            result.extend([p.strip() for p in clean.split(",") if p.strip()])
        else:
            result.append(clean)
    return result


def _parse_category_param(
    raw_categories: list[str] | str | None,
    master_categories: set[str] | None = None,
) -> list[str]:
    """Parse category query parameters while preserving category names that contain commas.

    Supports:
    - Repeated query parameters (e.g. ?categories=Coffee%2C+Drink+%26+Snacks&categories=Groceries)
    - Master categories containing commas (e.g. 'Coffee, Drink & Snacks' remains intact)
    - Legacy comma-separated strings (e.g. ?categories=Bills,Groceries)
    """
    if not raw_categories:
        return []
    raw_list = [raw_categories] if isinstance(raw_categories, str) else raw_categories
    master = master_categories or set()
    result: list[str] = []

    for item in raw_list:
        clean = item.strip()
        if not clean:
            continue
        if clean in master:
            result.append(clean)
            continue
        if "," in clean:
            sorted_masters = sorted(master, key=len, reverse=True)
            remaining = clean
            matched: list[str] = []
            while remaining:
                found = False
                for m in sorted_masters:
                    if remaining == m:
                        matched.append(m)
                        remaining = ""
                        found = True
                        break
                    elif remaining.startswith(m + ","):
                        matched.append(m)
                        remaining = remaining[len(m) + 1 :].strip()
                        found = True
                        break
                if not found:
                    if "," in remaining:
                        part, remaining = remaining.split(",", 1)
                        if part.strip():
                            matched.append(part.strip())
                        remaining = remaining.strip()
                    else:
                        if remaining.strip():
                            matched.append(remaining.strip())
                        remaining = ""
            result.extend(matched)
        else:
            result.append(clean)

    return result


def _filter_transactions_df(
    df: pd.DataFrame,
    search: str = "",
    notes: str = "",
    bank: str = "All",
    category: str = "All",
    categories: list[str] | None = None,
    transaction_type: str = "Both",
    financial_year: str = "All",
    date_from: str = "",
    date_to: str = "",
    months: list[str] | None = None,
    is_exceptional: bool | None = None,
) -> pd.DataFrame:
    """Apply unified Transactions & Export filters while preserving `_row_id`."""
    if df.empty:
        out = pd.DataFrame(columns=COLS)
        out["_row_id"] = pd.Series(dtype=int)
        return out

    out = df.copy()
    out["_row_id"] = out.index
    out = out.sort_values("Date", ascending=False)

    if bank and bank not in {"All", "All Banks"}:
        out = out[out["Bank"] == bank]
    if category and category != "All":
        out = out[out["Category"] == category]
    if categories:
        out = out[out["Category"].isin(categories)]
    if transaction_type and transaction_type != "Both":
        out = out[out["Transaction_Type"] == transaction_type]
    if financial_year and financial_year != "All":
        out = out[out["Financial_Year"] == financial_year]
    if is_exceptional is not None and "Is_Exceptional" in out.columns:
        out = out[out["Is_Exceptional"] == bool(is_exceptional)]
    if search:
        out = out[out["Name"].str.contains(search.strip(), case=False, na=False, regex=False)]
    if notes:
        out = out[out["Notes"].str.contains(notes.strip(), case=False, na=False, regex=False)]
    if date_from:
        ts_from = pd.to_datetime(date_from, errors="coerce")
        if pd.notna(ts_from):
            out = out[out["Date"] >= ts_from.normalize()]
    if date_to:
        ts_to = pd.to_datetime(date_to, errors="coerce")
        if pd.notna(ts_to):
            out = out[out["Date"] <= ts_to.normalize()]
    if months and not out.empty:
        out = out[
            out["Date"].dt.strftime("%B").isin(months) | out["Date"].dt.strftime("%b").isin(months)
        ]

    return out


# --- Auth Endpoints ---
@app.get("/api/auth/status")
def auth_status(request: Request) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    user = verify_session_token(token)
    _, _, notice = get_auth_credentials()
    return {
        "authenticated": user is not None,
        "username": user,
        "notice": notice,
        "require_auth_secrets": is_auth_secrets_required(),
        "version": APP_VERSION,
        "changelog": CHANGELOG,
    }


@app.post("/api/auth/login")
def auth_login(payload: LoginRequest, response: Response) -> dict[str, Any]:
    valid_user, valid_pass, notice = get_auth_credentials()
    if valid_user is None or valid_pass is None:
        raise HTTPException(status_code=503, detail=notice or "Auth secrets not configured.")

    user_ok = secrets.compare_digest(payload.username.strip(), valid_user)
    pass_ok = secrets.compare_digest(payload.password, valid_pass)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    max_age = SESSION_MAX_AGE_SECONDS if payload.remember_me else 24 * 60 * 60
    token = create_session_token(valid_user, max_age=max_age)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age if payload.remember_me else None,
        httponly=True,
        samesite="lax",
    )
    return {"authenticated": True, "username": valid_user, "notice": notice}


@app.post("/api/auth/logout")
def auth_logout(response: Response) -> dict[str, Any]:
    response.delete_cookie(COOKIE_NAME)
    return {"authenticated": False}


# --- Bootstrap & Metadata ---
@app.get("/api/bootstrap")
def get_bootstrap(
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    filters = load_filters(norm_scope)
    health = get_startup_health(norm_scope, has_auth_secrets(), is_auth_secrets_required())
    fys = (
        sorted([str(x) for x in df["Financial_Year"].dropna().unique() if str(x).strip()])
        if not df.empty
        else []
    )

    return {
        "scope": norm_scope,
        "scopes": ACCOUNT_SCOPES,
        "version": APP_VERSION,
        "changelog": CHANGELOG,
        "total_transactions": int(len(df)),
        "master_categories": get_master_categories(df, settings),
        "master_banks": get_master_banks(df, settings),
        "financial_years": fys,
        "settings": settings,
        "saved_filters": filters,
        "health": health,
    }


# --- Dashboard & Drilldown ---
@app.get("/api/dashboard")
def get_dashboard(
    scope: str = Query("Personal"),
    time_mode: str = Query("Financial Year"),
    selected_period: str = Query("All"),
    bank: str = Query("All Banks"),
    hide_internal: bool = Query(True),
    net_spend_mode: bool = Query(False),
    ignore_legacy: bool = Query(True),
    exclude_exceptional: bool = Query(True),
    months: list[str] = Query(default=[]),
    include_categories: list[str] = Query(default=[]),
    exclude_categories: list[str] = Query(default=[]),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    master_cats = set(get_master_categories(df, settings))
    filters = {
        "time_mode": time_mode,
        "selected_period": selected_period,
        "bank": bank,
        "hide_internal": hide_internal,
        "net_spend_mode": net_spend_mode,
        "ignore_legacy": ignore_legacy,
        "exclude_exceptional": exclude_exceptional,
        "months": _parse_list_param(months),
        "include_categories": _parse_category_param(include_categories, master_cats),
        "exclude_categories": _parse_category_param(exclude_categories, master_cats),
    }
    return build_dashboard_data(df, settings, filters)


@app.get("/api/dashboard/drilldown")
def get_dashboard_drilldown(
    scope: str = Query("Personal"),
    category: str = Query(...),
    time_mode: str = Query("Financial Year"),
    selected_period: str = Query("All"),
    bank: str = Query("All Banks"),
    hide_internal: bool = Query(True),
    net_spend_mode: bool = Query(False),
    ignore_legacy: bool = Query(True),
    exclude_exceptional: bool = Query(True),
    months: list[str] = Query(default=[]),
    include_categories: list[str] = Query(default=[]),
    exclude_categories: list[str] = Query(default=[]),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    master_cats = set(get_master_categories(df, settings))
    filters = {
        "time_mode": time_mode,
        "selected_period": selected_period,
        "bank": bank,
        "hide_internal": hide_internal,
        "net_spend_mode": net_spend_mode,
        "ignore_legacy": ignore_legacy,
        "exclude_exceptional": exclude_exceptional,
        "months": _parse_list_param(months),
        "include_categories": _parse_category_param(include_categories, master_cats),
        "exclude_categories": _parse_category_param(exclude_categories, master_cats),
    }
    return build_category_drilldown(df, settings, filters, category)


# --- Transactions (Unified Editor, Bulk Update & Export) ---
@app.get("/api/transactions")
def list_transactions(
    scope: str = Query("Personal"),
    search: str = Query(""),
    notes: str = Query(""),
    bank: str = Query("All"),
    category: str = Query("All"),
    categories: list[str] = Query(default=[]),
    transaction_type: str = Query("Both"),
    financial_year: str = Query("All"),
    date_from: str = Query(""),
    date_to: str = Query(""),
    months: list[str] = Query(default=[]),
    is_exceptional: bool | None = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    master_cats = set(get_master_categories(df, settings))
    cat_list = _parse_category_param(categories, master_cats)
    month_list = _parse_list_param(months)
    filtered = _filter_transactions_df(
        df,
        search=search,
        notes=notes,
        bank=bank,
        category=category,
        categories=cat_list,
        transaction_type=transaction_type,
        financial_year=financial_year,
        date_from=date_from,
        date_to=date_to,
        months=month_list,
        is_exceptional=is_exceptional,
    )
    total = int(len(filtered))
    sliced = filtered.iloc[offset : offset + limit]
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "rows": _serialize_tx_rows(sliced),
    }


@app.get("/api/transactions/export")
def export_transactions_csv(
    scope: str = Query("Personal"),
    search: str = Query(""),
    notes: str = Query(""),
    bank: str = Query("All"),
    category: str = Query("All"),
    categories: list[str] = Query(default=[]),
    transaction_type: str = Query("Both"),
    financial_year: str = Query("All"),
    date_from: str = Query(""),
    date_to: str = Query(""),
    months: list[str] = Query(default=[]),
    is_exceptional: bool | None = Query(None),
    _user: str = Depends(require_auth),
) -> StreamingResponse:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    master_cats = set(get_master_categories(df, settings))
    cat_list = _parse_category_param(categories, master_cats)
    month_list = _parse_list_param(months)
    filtered = _filter_transactions_df(
        df,
        search=search,
        notes=notes,
        bank=bank,
        category=category,
        categories=cat_list,
        transaction_type=transaction_type,
        financial_year=financial_year,
        date_from=date_from,
        date_to=date_to,
        months=month_list,
        is_exceptional=is_exceptional,
    )
    export_df = filtered[COLS].copy() if not filtered.empty else pd.DataFrame(columns=COLS)
    if not export_df.empty:
        export_df["Date"] = pd.to_datetime(export_df["Date"], errors="coerce").dt.strftime(
            "%d/%m/%Y"
        )
    csv_bytes = export_df.to_csv(index=False, encoding="utf-8").encode("utf-8")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="expense_export.csv"'},
    )


@app.post("/api/transactions")
def create_transaction(
    payload: TransactionCreateRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)

    dt = pd.to_datetime(payload.Date, errors="coerce")
    if pd.isna(dt):
        raise HTTPException(status_code=400, detail="Invalid Date format.")

    new_row_df = pd.DataFrame(
        [
            {
                "Date": dt.normalize(),
                "Name": clean_string(payload.Name),
                "Amount": round(abs(float(payload.Amount)), 2),
                "Transaction_Type": clean_string(payload.Transaction_Type) or "Expense",
                "Bank": clean_string(payload.Bank) or "Manual",
                "Category": clean_string(payload.Category),
                "Notes": clean_string(payload.Notes),
                "Financial_Year": calculate_uk_financial_year(dt.normalize()),
                "Is_Subscription": bool(payload.Is_Subscription),
                "Is_Exceptional": bool(payload.Is_Exceptional),
            }
        ]
    )
    new_row_df = apply_smart_dictionary(new_row_df)
    new_row_df = apply_auto_rules(new_row_df, settings.get("auto_rules", []))

    updated_df = pd.concat([df, new_row_df[COLS]], ignore_index=True)
    save_transactions(norm_scope, updated_df)
    created = _serialize_tx_rows(updated_df.tail(1))[0]
    return {"saved": True, "row": created, "total": len(updated_df)}


@app.patch("/api/transactions/{row_id}")
def patch_transaction(
    row_id: int,
    payload: TransactionPatchRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    if row_id < 0 or row_id >= len(df):
        raise HTTPException(status_code=404, detail="Transaction row not found.")

    if payload.Date is not None:
        dt = pd.to_datetime(payload.Date, errors="coerce")
        if pd.isna(dt):
            raise HTTPException(status_code=400, detail="Invalid Date.")
        df.at[row_id, "Date"] = dt.normalize()
        df.at[row_id, "Financial_Year"] = calculate_uk_financial_year(dt.normalize())
    if payload.Name is not None:
        df.at[row_id, "Name"] = clean_string(payload.Name)
    if payload.Amount is not None:
        df.at[row_id, "Amount"] = round(abs(float(payload.Amount)), 2)
    if payload.Transaction_Type is not None:
        df.at[row_id, "Transaction_Type"] = clean_string(payload.Transaction_Type)
    if payload.Bank is not None:
        df.at[row_id, "Bank"] = clean_string(payload.Bank)
    if payload.Category is not None:
        df.at[row_id, "Category"] = clean_string(payload.Category)
    if payload.Notes is not None:
        df.at[row_id, "Notes"] = clean_string(payload.Notes)
    if payload.Is_Subscription is not None:
        df.at[row_id, "Is_Subscription"] = bool(payload.Is_Subscription)
    if payload.Is_Exceptional is not None:
        df.at[row_id, "Is_Exceptional"] = bool(payload.Is_Exceptional)

    save_transactions(norm_scope, df)
    single = df.loc[[row_id]].copy()
    single["_row_id"] = single.index
    return {"saved": True, "row": _serialize_tx_rows(single)[0]}


@app.post("/api/transactions/bulk")
def bulk_update_transactions(
    payload: BulkTransactionsRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    valid_ids = [idx for idx in payload.row_ids if 0 <= idx < len(df)]
    if not valid_ids:
        return {"saved": False, "affected": 0}

    if payload.action == "delete":
        df = df.drop(index=valid_ids).reset_index(drop=True)
        save_transactions(norm_scope, df)
        return {"saved": True, "affected": len(valid_ids), "total": len(df)}

    if payload.category is not None:
        df.loc[valid_ids, "Category"] = clean_string(payload.category)
    if payload.transaction_type is not None:
        df.loc[valid_ids, "Transaction_Type"] = clean_string(payload.transaction_type)
    if payload.is_subscription is not None:
        df.loc[valid_ids, "Is_Subscription"] = bool(payload.is_subscription)
    if payload.is_exceptional is not None:
        df.loc[valid_ids, "Is_Exceptional"] = bool(payload.is_exceptional)

    save_transactions(norm_scope, df)
    return {"saved": True, "affected": len(valid_ids), "total": len(df)}


# --- Sync & Import Endpoints ---
@app.post("/api/sync/gsheets")
def sync_from_gsheets(
    payload: GSheetsSyncRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    settings = load_settings(norm_scope)
    sheet_url = (payload.sheet_url or settings.get("monzo_sheet_url", "")).strip()
    worksheet_name = (payload.worksheet_name or settings.get("monzo_sheet_worksheet", "")).strip()

    if not sheet_url:
        raise HTTPException(
            status_code=400,
            detail="Monzo Sheet URL is empty. Enter your Google Sheet URL to sync.",
        )

    settings["monzo_sheet_url"] = sheet_url
    if worksheet_name:
        settings["monzo_sheet_worksheet"] = worksheet_name
    save_settings(norm_scope, settings)

    try:
        raw_df = fetch_google_sheet_dataframe(sheet_url, settings["monzo_sheet_worksheet"])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Google Sheets sync failed: {exc}") from exc

    existing_df = load_transactions(norm_scope)
    pre_len = len(existing_df)
    merged_df, new_rows_df, updated_rows_df, conflicts = parse_and_merge_import(
        existing_df,
        raw_df,
        settings.get("auto_rules", []),
        source_format="Monzo",
        resolved_conflicts=settings.get("resolved_conflicts", {}),
    )
    save_transactions(norm_scope, merged_df)

    # Tag new rows with their assigned row_ids in merged_df so inline review edits persist directly
    if not new_rows_df.empty:
        new_slice = merged_df.iloc[pre_len:].copy()
        new_slice["_row_id"] = new_slice.index
        serialized_new = _serialize_tx_rows(new_slice)
    else:
        serialized_new = []

    return {
        "saved": True,
        "new_count": len(serialized_new),
        "updated_count": len(updated_rows_df),
        "new_rows": serialized_new,
        "updated_rows": _serialize_tx_rows(updated_rows_df),
        "conflicts": conflicts,
    }


@app.post("/api/sync/import-file")
async def import_csv_file(
    file: UploadFile = File(...),
    source_format: str = Form("Auto-Detect"),
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    settings = load_settings(norm_scope)
    content = await file.read()
    hdr = None if source_format == "Barclaycard" else 0
    try:
        raw_df = pd.read_csv(io.BytesIO(content), header=hdr, encoding="utf-8")
    except Exception:
        raw_df = pd.read_csv(io.BytesIO(content), header=hdr, encoding="ISO-8859-1")

    existing_df = load_transactions(norm_scope)
    pre_len = len(existing_df)
    merged_df, new_rows_df, updated_rows_df, conflicts = parse_and_merge_import(
        existing_df,
        raw_df,
        settings.get("auto_rules", []),
        source_format=source_format,
        resolved_conflicts=settings.get("resolved_conflicts", {}),
    )
    save_transactions(norm_scope, merged_df)

    if not new_rows_df.empty:
        new_slice = merged_df.iloc[pre_len:].copy()
        new_slice["_row_id"] = new_slice.index
        serialized_new = _serialize_tx_rows(new_slice)
    else:
        serialized_new = []

    return {
        "saved": True,
        "new_count": len(serialized_new),
        "updated_count": len(updated_rows_df),
        "new_rows": serialized_new,
        "conflicts": conflicts,
    }


@app.post("/api/sync/import-paste")
def import_pasted_rows(
    payload: PasteImportRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    settings = load_settings(norm_scope)
    hdr = None if payload.source_format == "Barclaycard" else 0
    try:
        raw_df = pd.read_csv(io.StringIO(payload.pasted_text), sep="\t", header=hdr)
        if len(raw_df.columns) < 2:
            raw_df = pd.read_csv(io.StringIO(payload.pasted_text), sep=",", header=hdr)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Paste parse error: {exc}") from exc

    existing_df = load_transactions(norm_scope)
    pre_len = len(existing_df)
    merged_df, new_rows_df, updated_rows_df, conflicts = parse_and_merge_import(
        existing_df,
        raw_df,
        settings.get("auto_rules", []),
        source_format=payload.source_format,
        resolved_conflicts=settings.get("resolved_conflicts", {}),
    )
    save_transactions(norm_scope, merged_df)

    if not new_rows_df.empty:
        new_slice = merged_df.iloc[pre_len:].copy()
        new_slice["_row_id"] = new_slice.index
        serialized_new = _serialize_tx_rows(new_slice)
    else:
        serialized_new = []

    return {
        "saved": True,
        "new_count": len(serialized_new),
        "updated_count": len(updated_rows_df),
        "new_rows": serialized_new,
        "conflicts": conflicts,
    }


@app.post("/api/sync/resolve-conflicts")
def resolve_sync_conflicts(
    payload: ResolveConflictsRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    if "resolved_conflicts" not in settings or not isinstance(settings["resolved_conflicts"], dict):
        settings["resolved_conflicts"] = {}
    if "auto_rules" not in settings or not isinstance(settings["auto_rules"], list):
        settings["auto_rules"] = []

    applied_count = 0
    for item in payload.resolutions:
        if 0 <= item.row_id < len(df):
            chosen_cat = clean_string(item.category)
            df.at[item.row_id, "Category"] = chosen_cat
            applied_count += 1

            # Build stable signature to remember this transaction across future syncs
            row_date = str(pd.to_datetime(df.loc[item.row_id, "Date"]).strftime("%Y-%m-%d"))
            row_name = clean_string(df.loc[item.row_id, "Name"])
            row_amt = round(float(df.loc[item.row_id, "Amount"]), 2)
            sig = f"{row_date}|{row_name}|{row_amt}"
            settings["resolved_conflicts"][sig] = chosen_cat

    if applied_count > 0:
        save_transactions(norm_scope, df)
        save_settings(norm_scope, settings)

    return {"saved": True, "applied_count": applied_count}


# --- Intelligence Endpoints ---
@app.get("/api/intelligence")
def get_intelligence(
    scope: str = Query("Personal"),
    horizon: str = Query("2026"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    return build_intelligence_data(df, settings, horizon=horizon)


@app.post("/api/intelligence/action")
def execute_intelligence_action(
    payload: IntelligenceActionRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)

    action = payload.action
    if action == "mark_committed" and payload.category:
        committed = list(settings.get("committed_categories", []))
        if payload.category not in committed:
            committed.append(payload.category)
        settings["committed_categories"] = committed
        save_settings(norm_scope, settings)

    elif action == "ignore_recurring":
        targets = payload.merchants or ([payload.merchant] if payload.merchant else [])
        ignored = list(settings.get("ignore_recurring", []))
        for m in targets:
            if m and m not in ignored:
                ignored.append(m)
        settings["ignore_recurring"] = ignored
        save_settings(norm_scope, settings)

    elif action == "restore_recurring":
        targets = set(payload.merchants or ([payload.merchant] if payload.merchant else []))
        settings["ignore_recurring"] = [
            m for m in settings.get("ignore_recurring", []) if m not in targets
        ]
        save_settings(norm_scope, settings)

    elif action == "flag_subscriptions":
        targets = set(payload.merchants or ([payload.merchant] if payload.merchant else []))
        if targets and not df.empty:
            mask = df["Name"].isin(targets)
            df.loc[mask, "Is_Subscription"] = True
            save_transactions(norm_scope, df)

    elif action == "apply_standardisation" and payload.from_category and payload.to_category:
        if not df.empty:
            df.loc[df["Category"] == payload.from_category, "Category"] = payload.to_category
            save_transactions(norm_scope, df)

    elif action == "mute_suggestion":
        targets = payload.merchants or ([payload.merchant] if payload.merchant else [])
        muted = list(settings.get("ignore_suggestions", []))
        existing_lower = {str(x).lower().strip() for x in muted}
        for m in targets:
            if m and m.lower().strip() not in existing_lower:
                muted.append(m.strip())
                existing_lower.add(m.lower().strip())
        settings["ignore_suggestions"] = muted
        save_settings(norm_scope, settings)

    elif action == "mark_one_off":
        if payload.row_id is not None and 0 <= payload.row_id < len(df):
            df.at[payload.row_id, "Is_Exceptional"] = True
            save_transactions(norm_scope, df)

    elif action == "dismiss_one_off":
        if payload.signature:
            ignored = list(settings.get("ignore_exceptional_candidates", []))
            if payload.signature not in ignored:
                ignored.append(payload.signature)
                settings["ignore_exceptional_candidates"] = ignored
                save_settings(norm_scope, settings)

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported intelligence action: {action}")

    horizon = payload.horizon or "2026"
    return {"saved": True, "intelligence": build_intelligence_data(df, settings, horizon=horizon)}


# --- Wealth & Assets Endpoints ---
@app.get("/api/wealth")
def get_wealth(
    scope: str = Query("Personal"),
    ignore_legacy: bool = Query(True),
    timeframe: str = Query("All Time"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    assets_data = load_assets(norm_scope)
    debts_data = load_debts(norm_scope)
    return build_wealth_data(
        df, assets_data, debts_data, ignore_legacy=ignore_legacy, timeframe=timeframe
    )


@app.post("/api/wealth/balances")
def save_wealth_balances(
    payload: WealthBalanceSaveRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    snapshot_key = clean_string(payload.date or payload.month)
    if not snapshot_key:
        raise HTTPException(
            status_code=400, detail="Snapshot date (YYYY-MM-DD) or month (YYYY-MM) is required."
        )

    assets_data = load_assets(norm_scope)
    debts_data = load_debts(norm_scope)

    raw_assets = payload.asset_balances if payload.asset_balances is not None else payload.balances
    if raw_assets is not None:
        cleaned_assets = {
            clean_string(k): round(float(v), 2)
            for k, v in raw_assets.items()
            if clean_string(k) and v is not None and float(v) > 0
        }
        if cleaned_assets:
            assets_data[snapshot_key] = cleaned_assets
        else:
            assets_data.pop(snapshot_key, None)
        save_assets(norm_scope, assets_data)

    if payload.debt_balances is not None:
        cleaned_debts = {
            clean_string(k): round(float(v), 2)
            for k, v in payload.debt_balances.items()
            if clean_string(k) and v is not None and float(v) >= 0
        }
        if cleaned_debts:
            debts_data.setdefault("balances", {})[snapshot_key] = cleaned_debts
        else:
            debts_data.setdefault("balances", {}).pop(snapshot_key, None)

        if payload.loans_metadata:
            for l_name, l_meta in payload.loans_metadata.items():
                cl_name = clean_string(l_name)
                if cl_name and isinstance(l_meta, dict):
                    orig = l_meta.get("original_amount")
                    if orig is not None and float(orig) > 0:
                        debts_data.setdefault("loans", {})[cl_name] = {
                            "original_amount": round(float(orig), 2)
                        }
        save_debts(norm_scope, debts_data)

    df = load_transactions(norm_scope)
    return {"saved": True, "wealth": build_wealth_data(df, assets_data, debts_data)}


@app.delete("/api/wealth/balances/{month}")
def delete_wealth_month(
    month: str,
    target: str = Query("all"),
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    snapshot_key = clean_string(month)
    if not snapshot_key:
        raise HTTPException(status_code=400, detail="Snapshot date or month is required.")

    assets_data = load_assets(norm_scope)
    debts_data = load_debts(norm_scope)

    if target in ("assets", "all"):
        assets_data.pop(snapshot_key, None)
        save_assets(norm_scope, assets_data)

    if target in ("debts", "all"):
        debts_data.setdefault("balances", {}).pop(snapshot_key, None)
        save_debts(norm_scope, debts_data)

    df = load_transactions(norm_scope)
    return {"saved": True, "wealth": build_wealth_data(df, assets_data, debts_data)}


@app.post("/api/wealth/accounts")
def manage_wealth_account(
    payload: WealthAccountManageRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    target_account = clean_string(payload.account)
    if not target_account:
        raise HTTPException(status_code=400, detail="Account name is required.")

    assets_data = load_assets(norm_scope)
    debts_data = load_debts(norm_scope)

    if payload.account_type == "debt":
        if payload.action == "delete":
            debts_data.setdefault("loans", {}).pop(target_account, None)
            for m_map in debts_data.get("balances", {}).values():
                if isinstance(m_map, dict):
                    m_map.pop(target_account, None)
        elif payload.action == "rename":
            new_name = clean_string(payload.new_name or "")
            if not new_name:
                raise HTTPException(status_code=400, detail="New account name is required.")
            if new_name != target_account:
                if target_account in debts_data.get("loans", {}):
                    debts_data["loans"][new_name] = debts_data["loans"].pop(target_account)
                for m_map in debts_data.get("balances", {}).values():
                    if isinstance(m_map, dict) and target_account in m_map:
                        debts_data_val = float(m_map.pop(target_account))
                        m_map[new_name] = round(float(m_map.get(new_name, 0.0)) + debts_data_val, 2)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported account action: {payload.action}"
            )
        save_debts(norm_scope, debts_data)
    else:
        if payload.action == "delete":
            empty_months: list[str] = []
            for m_key, m_map in assets_data.items():
                if isinstance(m_map, dict):
                    m_map.pop(target_account, None)
                    if not m_map:
                        empty_months.append(m_key)
            for m_key in empty_months:
                assets_data.pop(m_key, None)

        elif payload.action == "rename":
            new_name = clean_string(payload.new_name or "")
            if not new_name:
                raise HTTPException(status_code=400, detail="New account name is required.")
            if new_name != target_account:
                for _, m_map in assets_data.items():
                    if isinstance(m_map, dict) and target_account in m_map:
                        val = float(m_map.pop(target_account))
                        m_map[new_name] = round(float(m_map.get(new_name, 0.0)) + val, 2)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported account action: {payload.action}"
            )
        save_assets(norm_scope, assets_data)

    df = load_transactions(norm_scope)
    return {"saved": True, "wealth": build_wealth_data(df, assets_data, debts_data)}


# --- Settings & Filter Presets Endpoints ---
@app.put("/api/settings")
def update_settings(
    payload: dict[str, Any],
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    current = load_settings(norm_scope)
    current.update(payload)
    saved = save_settings(norm_scope, current)
    df = load_transactions(norm_scope)
    return {
        "saved": True,
        "settings": saved,
        "master_categories": get_master_categories(df, saved),
    }


@app.post("/api/settings/apply-rules")
def apply_rules_to_existing(
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    df = load_transactions(norm_scope)
    settings = load_settings(norm_scope)
    if not df.empty:
        df = apply_auto_rules(df, settings.get("auto_rules", []))
        save_transactions(norm_scope, df)
    return {"saved": True, "total": len(df)}


@app.post("/api/settings/test-rule")
def test_rule_match(
    payload: TestRuleRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    settings = load_settings(norm_scope)
    preview_row = {"Name": payload.name, "Notes": payload.notes, "Amount": payload.amount}
    idx, rule = get_matching_auto_rule(preview_row, settings.get("auto_rules", []))
    return {
        "matched": rule is not None,
        "rule_index": idx,
        "rule": rule,
    }


@app.put("/api/filters")
def update_filter_presets(
    payload: dict[str, Any],
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    save_filters(norm_scope, payload)
    return {"saved": True, "saved_filters": load_filters(norm_scope)}


# --- Mortgage Endpoints ---
@app.get("/api/mortgage")
def get_mortgage(
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    mortgage_data = load_mortgage(norm_scope)
    profile = mortgage_data.get("profile")
    summary = None
    annual_allowance = 0.0

    if profile:
        principal = float(profile.get("current_balance", 0.0))
        rate = float(profile.get("interest_rate", 0.0))
        payment = float(profile.get("monthly_payment", 0.0))
        term = int(profile.get("remaining_term_months", 0))

        annual_allowance = calculate_annual_allowance(principal)
        past_overpayments = sum(
            float(op.get("amount", 0.0)) for op in mortgage_data.get("overpayments", [])
        )
        if principal > 0 and term > 0:
            summary = calculate_mortgage_summary(
                principal=principal,
                annual_rate_pct=rate,
                monthly_payment=payment,
                term_months=term,
                monthly_overpayment=0.0,
                lump_sum=0.0,
                past_overpayments=past_overpayments,
            )

    return {
        "profile": profile,
        "overpayments": mortgage_data.get("overpayments", []),
        "summary": summary,
        "annual_allowance": annual_allowance,
    }


@app.post("/api/mortgage/profile")
def save_mortgage_profile_endpoint(
    payload: MortgageProfileRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    return update_mortgage_profile(norm_scope, payload.model_dump())


@app.post("/api/mortgage/overpayments")
def create_mortgage_overpayment(
    payload: MortgageOverpaymentRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    return add_mortgage_overpayment(norm_scope, payload.model_dump())


@app.put("/api/mortgage/overpayments/{overpayment_id}")
def edit_mortgage_overpayment(
    overpayment_id: str,
    payload: MortgageOverpaymentRequest,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    try:
        return update_mortgage_overpayment(norm_scope, overpayment_id, payload.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err


@app.delete("/api/mortgage/overpayments/{overpayment_id}")
def remove_mortgage_overpayment(
    overpayment_id: str,
    scope: str = Query("Personal"),
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    norm_scope = normalize_scope(scope)
    deleted = delete_mortgage_overpayment(norm_scope, overpayment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Overpayment not found")
    return {"status": "success", "deleted_id": overpayment_id}


@app.post("/api/mortgage/calculate")
def calculate_mortgage_simulation_endpoint(
    payload: MortgageCalculationRequest,
    _user: str = Depends(require_auth),
) -> dict[str, Any]:
    return calculate_mortgage_summary(
        principal=payload.principal,
        annual_rate_pct=payload.annual_rate_pct,
        monthly_payment=payload.monthly_payment,
        term_months=payload.term_months,
        monthly_overpayment=payload.monthly_overpayment,
        lump_sum=payload.lump_sum,
        past_overpayments=payload.past_overpayments,
    )


# --- Static SPA Hosting (Production) ---
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

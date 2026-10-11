"""Google Sheets live sync helper using service account credentials from .streamlit/secrets.toml."""

from __future__ import annotations

import gspread
import pandas as pd
from google.oauth2.service_account import Credentials

from backend.auth import load_secrets_toml

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


def fetch_google_sheet_dataframe(spreadsheet_url: str, worksheet_name: str) -> pd.DataFrame:
    """Fetch a worksheet from Google Sheets into a pandas DataFrame."""
    if not spreadsheet_url or not str(spreadsheet_url).strip():
        raise ValueError("Monzo Google Sheet URL is not configured.")

    secrets_data = load_secrets_toml()
    connections = secrets_data.get("connections", {})
    gsheets_cfg = connections.get("gsheets", {}) if isinstance(connections, dict) else {}

    if not isinstance(gsheets_cfg, dict) or not gsheets_cfg.get("client_email"):
        raise ValueError(
            "Google Sheets service account credentials ([connections.gsheets]) are missing in .streamlit/secrets.toml."
        )

    creds = Credentials.from_service_account_info(gsheets_cfg, scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_url(spreadsheet_url.strip())

    ws_title = str(worksheet_name).strip()
    worksheet = sheet.worksheet(ws_title) if ws_title else sheet.get_worksheet(0)
    records = worksheet.get_all_records()
    if not records:
        return pd.DataFrame()
    return pd.DataFrame(records)

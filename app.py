# -*- coding: utf-8 -*-
import streamlit as st
import pandas as pd
from datetime import datetime
import io
import os
import json
import plotly.express as px
from streamlit_gsheets import GSheetsConnection
import difflib

# Internal movement categories & True Income
internal_categories = ["Savings", "Investments - ISA", "Investment - ISA", "Transfers", "Investment - Crypto"]
true_income_categories = ['Income', 'Salary', 'Wages', 'Interest', 'Bonus']

# --- Configuration & Setup ---
st.set_page_config(page_title="UK Expense Tracker", layout="wide")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.getenv("EXPENSE_TRACKER_DATA_DIR", BASE_DIR)
ASSETS_DIR = os.getenv("EXPENSE_TRACKER_ASSETS_DIR", BASE_DIR)

BASE_DB_FILENAME = os.getenv("EXPENSE_TRACKER_DB_FILE", "expense_database.csv")
BASE_SETTINGS_FILENAME = os.getenv("EXPENSE_TRACKER_SETTINGS_FILE", "settings.json")
BASE_FILTER_FILENAME = os.getenv("EXPENSE_TRACKER_FILTERS_FILE", "saved_filters.json")

ACCOUNT_SCOPE_PERSONAL = "Personal"
ACCOUNT_SCOPE_JOINT = "Joint"
ACCOUNT_SCOPES = [ACCOUNT_SCOPE_PERSONAL, ACCOUNT_SCOPE_JOINT]


def get_scoped_filename(base_filename, account_scope):
    if account_scope == ACCOUNT_SCOPE_PERSONAL:
        return base_filename
    stem, ext = os.path.splitext(base_filename)
    return f"{stem}_joint{ext}"


def build_runtime_paths(account_scope):
    return (
        os.path.join(DATA_DIR, get_scoped_filename(BASE_DB_FILENAME, account_scope)),
        os.path.join(DATA_DIR, get_scoped_filename(BASE_SETTINGS_FILENAME, account_scope)),
        os.path.join(DATA_DIR, get_scoped_filename(BASE_FILTER_FILENAME, account_scope)),
    )


DB_FILE = ""
SETTINGS_FILE = ""
FILTER_FILE = ""
LOGO_FILE = os.path.join(ASSETS_DIR, os.getenv("EXPENSE_TRACKER_LOGO_FILE", "logo.png"))
COLS = ['Date', 'Name', 'Amount', 'Transaction_Type', 'Bank', 'Category', 'Notes', 'Financial_Year']

def is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}

APP_ENV = os.getenv("EXPENSE_TRACKER_ENV", "development").strip().lower()
REQUIRE_AUTH_SECRETS = is_truthy(os.getenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "")) or APP_ENV == "production"
DEV_FALLBACK_USER = os.getenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
DEV_FALLBACK_PASS = os.getenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", "admin")

DEFAULT_SETTINGS = {
    "ignore_suggestions": [],
    "custom_categories": [],
    "custom_banks": [],
    "committed_categories": [],
    "committed_presets": {},
    "monzo_sheet_url": "",
    "monzo_sheet_worksheet": ""
}

SECRETS_EXAMPLE_FILE = os.path.join(BASE_DIR, ".streamlit", "secrets.toml.example")
DB_EXAMPLE_FILE = os.path.join(BASE_DIR, "expense_database.example.csv")
SETTINGS_EXAMPLE_FILE = os.path.join(BASE_DIR, "settings.example.json")
FILTER_EXAMPLE_FILE = os.path.join(BASE_DIR, "saved_filters.example.json")

# --- Session State Initialization ---
if 'new_sync_rows' not in st.session_state: st.session_state.new_sync_rows = pd.DataFrame(columns=COLS)
if 'updated_sync_rows' not in st.session_state: st.session_state.updated_sync_rows = pd.DataFrame(columns=COLS)

def load_json_file(filepath):
    candidate_path = get_read_path(filepath)
    if os.path.exists(candidate_path):
        try:
            with open(candidate_path, "r", encoding="utf-8") as f: return json.load(f)
        except: pass
    return {}

def get_read_path(filepath):
    if os.path.exists(filepath):
        return filepath

    legacy_path = os.path.join(BASE_DIR, os.path.basename(filepath))
    if os.path.exists(legacy_path):
        return legacy_path

    return filepath

def with_default_settings(settings):
    scope = st.session_state.get("active_account_scope", ACCOUNT_SCOPE_PERSONAL)
    merged = DEFAULT_SETTINGS.copy()
    if not merged["monzo_sheet_worksheet"]:
        merged["monzo_sheet_worksheet"] = "Joint Account Transactions" if scope == ACCOUNT_SCOPE_JOINT else "Personal Account Transactions"
    if isinstance(settings, dict):
        merged.update(settings)
    if not str(merged.get("monzo_sheet_worksheet", "")).strip():
        merged["monzo_sheet_worksheet"] = "Joint Account Transactions" if scope == ACCOUNT_SCOPE_JOINT else "Personal Account Transactions"
    return merged

def has_auth_secrets():
    try:
        auth_data = st.secrets.get("auth", {})
    except Exception:
        return False
    return bool(auth_data.get("username")) and bool(auth_data.get("password"))

def get_auth_credentials():
    try:
        auth_data = st.secrets.get("auth", {})
    except Exception:
        auth_data = {}

    username = str(auth_data.get("username", "")).strip()
    password = str(auth_data.get("password", "")).strip()

    if username and password:
        return username, password, None

    if REQUIRE_AUTH_SECRETS:
        return None, None, "Auth secrets are required in production mode. Set [auth] username/password in .streamlit/secrets.toml."

    return DEV_FALLBACK_USER, DEV_FALLBACK_PASS, "Development fallback auth is active because [auth] secrets are not set."

# --- Login & Authentication ---
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False

if not st.session_state.authenticated:
    if os.path.exists(LOGO_FILE):
        log_col1, log_col2, log_col3 = st.columns([1, 2, 1])
        with log_col2:
            st.image(LOGO_FILE, use_container_width=True)

    st.title(" Secure Login")
    valid_user, valid_pass, auth_notice = get_auth_credentials()
    if auth_notice:
        if REQUIRE_AUTH_SECRETS:
            st.error(auth_notice)
            st.stop()
        st.warning(auth_notice)

    with st.form("login_form"):
        username = st.text_input("Username", autocomplete="username")
        password = st.text_input("Password", type="password", autocomplete="current-password")
        if st.form_submit_button("Login"):
            if username == valid_user and password == valid_pass:
                st.session_state.authenticated = True
                st.rerun()
            else:
                st.error("Incorrect username or password.")
    st.stop()

if 'active_account_scope' not in st.session_state:
    st.session_state.active_account_scope = ACCOUNT_SCOPE_PERSONAL

with st.sidebar:
    st.markdown("### Account Scope")
    selected_scope = st.radio(
        "Show data for",
        ACCOUNT_SCOPES,
        index=ACCOUNT_SCOPES.index(st.session_state.active_account_scope),
        help="Personal and Joint are stored in separate files so they never appear together."
    )

if selected_scope != st.session_state.active_account_scope:
    st.session_state.active_account_scope = selected_scope
    st.session_state.new_sync_rows = pd.DataFrame(columns=COLS)
    st.session_state.updated_sync_rows = pd.DataFrame(columns=COLS)
    st.session_state.unsaved_sync = False
    st.session_state.pop("initialized", None)
    st.session_state.pop("app_settings", None)
    st.session_state.pop("export_presets", None)
    st.rerun()

DB_FILE, SETTINGS_FILE, FILTER_FILE = build_runtime_paths(st.session_state.active_account_scope)

def build_startup_health():
    checks = [
        ("Database", DB_FILE, DB_EXAMPLE_FILE),
        ("Settings", SETTINGS_FILE, SETTINGS_EXAMPLE_FILE),
        ("Saved filters", FILTER_FILE, FILTER_EXAMPLE_FILE)
    ]

    errors = []
    notes = []

    for label, runtime_file, template_file in checks:
        read_path = get_read_path(runtime_file)
        if os.path.exists(read_path):
            if read_path != runtime_file:
                notes.append(f"{label} is loading from legacy path: {read_path}")
            continue

        if os.path.exists(template_file):
            errors.append(f"{label} file missing. Copy template to runtime path: {runtime_file}")
        else:
            errors.append(f"{label} file missing and no template found: {template_file}")

    if not has_auth_secrets():
        if REQUIRE_AUTH_SECRETS:
            if os.path.exists(SECRETS_EXAMPLE_FILE):
                errors.append("Auth secrets missing. Copy .streamlit/secrets.toml.example to .streamlit/secrets.toml and set [auth] values.")
            else:
                errors.append("Auth secrets missing and .streamlit/secrets.toml.example was not found.")
        else:
            notes.append("Auth secrets missing. Development fallback auth is enabled; do not use this mode in production.")

    return errors, notes

if 'app_settings' not in st.session_state: 
    st.session_state.app_settings = with_default_settings(load_json_file(SETTINGS_FILE))
    if 'unsaved_sync' not in st.session_state:
        st.session_state.unsaved_sync = False

# --- Helper Functions ---
def clean_string(val):
    s = str(val).strip()
    return "" if s.lower() in ['nan', 'none', 'nat', 'null'] else s

def calculate_uk_financial_year(date_obj):
    if pd.isna(date_obj): return "Unknown"
    try:
        year = date_obj.year
        return f"{year-1}-{year}" if (date_obj.month < 4) or (date_obj.month == 4 and date_obj.day < 6) else f"{year}-{year+1}"
    except: return "Unknown"

def save_database(show_success=True):
    st.session_state.df.dropna(subset=['Date'], inplace=True)
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    
    # Format dates back to string specifically for the CSV file
    export_df = st.session_state.df.copy()
    export_df['Date'] = export_df['Date'].dt.strftime('%d/%m/%Y')
    export_df.to_csv(DB_FILE, index=False, encoding="utf-8")
    
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f: json.dump(st.session_state.app_settings, f)
    if show_success:
        st.toast(" Database successfully saved to disk!")

def load_data():
    db_read_path = get_read_path(DB_FILE)
    if not os.path.exists(db_read_path) and os.path.exists(DB_EXAMPLE_FILE):
        db_read_path = DB_EXAMPLE_FILE

    if os.path.exists(db_read_path):
        try:
            df = pd.read_csv(db_read_path, encoding="utf-8")
        except:
            df = pd.read_csv(db_read_path, encoding="ISO-8859-1")
            
        df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y', errors='coerce').dt.normalize()
        df.dropna(subset=['Date'], inplace=True)
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0).abs().round(2)
        
        for col in ['Name', 'Category', 'Transaction_Type', 'Bank', 'Notes']:
            if col in df.columns:
                df[col] = df[col].fillna("").astype(str).apply(clean_string)
                
        st.session_state.df = df
    else:
        st.session_state.df = pd.DataFrame(columns=COLS)

def process_monzo_splits(df):
    """Scans for hidden Monzo splits, deletes the parent row, and creates separated rows."""
    split_col = None
    for col in ['Category split', 'Categories', 'metadata_categories']:
        if col in df.columns:
            split_col = col
            break
            
    if not split_col: return df

    new_rows, rows_to_drop = [], []
    for index, row in df.iterrows():
        split_data = str(row[split_col])
        if split_data != 'nan' and split_data.strip() != '' and ':' in split_data:
            rows_to_drop.append(index)
            try:
                splits = split_data.split(',')
                for split in splits:
                    cat, amount = split.split(':')
                    new_row = row.copy()
                    new_row['Category'] = cat.strip()
                    new_row['Amount'] = abs(float(amount.strip()))
                    new_rows.append(new_row)
            except Exception:
                rows_to_drop.remove(index)

    if rows_to_drop: df = df.drop(rows_to_drop)
    if new_rows: df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)
    return df

if 'initialized' not in st.session_state:
    load_data()
    st.session_state.initialized = True

pure_monzo_cats = set(st.session_state.df[st.session_state.df['Bank'] == 'Monzo']['Category'].dropna().unique())
pure_monzo_cats = {c for c in pure_monzo_cats if c and c not in ['Miscellaneous', 'Unknown', '']}
custom_cats = set(st.session_state.app_settings.get("custom_categories", []))
master_cats = sorted(list(pure_monzo_cats.union(custom_cats)))
if not master_cats: master_cats = ['Savings', 'Groceries', 'Utilities', 'Travel', 'Miscellaneous']
master_banks = sorted(list(set(st.session_state.df['Bank'].dropna().unique()).union(set(st.session_state.app_settings.get("custom_banks", [])))))

def process_new_data(new_df, source_format="Auto-Detect"):
    try:
        new_list = []
        updated_list = []
        
        cols_lower = [str(c).lower().strip() for c in new_df.columns]
        is_monzo = 'transaction id' in cols_lower or source_format == "Monzo"
        is_hsbc = ('paid out' in cols_lower and 'paid in' in cols_lower) or source_format == "HSBC"
        is_barclaycard = source_format == "Barclaycard" or (len(new_df.columns) == 7 and not is_hsbc and not is_monzo)
        
        if is_monzo:
            new_df.rename(columns={'Notes and #tags': 'Notes'}, inplace=True, errors='ignore')
            new_df['Bank'] = 'Monzo'
            new_df = process_monzo_splits(new_df)  # Monzo Splits dynamically cleaned
            
        elif is_hsbc:
            new_df.rename(columns={'Description': 'Name'}, inplace=True)
            new_df['Paid out'] = pd.to_numeric(new_df['Paid out'].astype(str).str.replace(r'[£,]', '', regex=True), errors='coerce').fillna(0)
            new_df['Paid in'] = pd.to_numeric(new_df['Paid in'].astype(str).str.replace(r'[£,]', '', regex=True), errors='coerce').fillna(0)
            new_df['Amount'] = new_df.apply(lambda row: row['Paid in'] if row['Paid in'] > 0 else row['Paid out'], axis=1)
            new_df['Transaction_Type'] = new_df.apply(lambda row: 'Income' if row['Paid in'] > 0 else 'Expense', axis=1)
            new_df['Bank'] = 'HSBC'
            
        elif is_barclaycard:
            if not isinstance(new_df.columns[0], (int, float)):
                header_row = pd.DataFrame([new_df.columns.values], columns=new_df.columns)
                new_df = pd.concat([header_row, new_df], ignore_index=True)
            
            new_df.columns = range(len(new_df.columns))
            if len(new_df.columns) >= 7:
                new_df['Date'] = new_df.iloc[:, 0]
                new_df['Name'] = new_df.iloc[:, 1]
                new_df['Bank'] = 'Barclaycard'
                
                raw_cat = new_df.iloc[:, 4].astype(str).str.strip()
                new_df['Category'] = raw_cat.replace(['', 'nan', 'NaN', 'None', 'Unnamed: 4', 'n/a'], 'Transfers')
                
                col_in = pd.to_numeric(new_df.iloc[:, 5].astype(str).str.replace(r'[^\d.-]', '', regex=True), errors='coerce').fillna(0)
                col_out = pd.to_numeric(new_df.iloc[:, 6].astype(str).str.replace(r'[^\d.-]', '', regex=True), errors='coerce').fillna(0)
                
                new_df['Amount'] = col_in.abs() + col_out.abs()
                new_df['Transaction_Type'] = col_in.apply(lambda x: 'Income' if x != 0 else 'Expense')

        if 'Date' not in new_df.columns: return
        
        if 'Transaction_Type' not in new_df.columns and 'Amount' in new_df.columns:
            raw_amt = pd.to_numeric(new_df['Amount'].astype(str).str.replace(r'[^\d.-]', '', regex=True), errors='coerce').fillna(0)
            new_df['Transaction_Type'] = raw_amt.apply(lambda x: 'Income' if x > 0 else 'Expense')
            new_df['Amount'] = raw_amt.abs()
            
        for c in COLS:
            if c not in new_df.columns: 
                new_df[c] = ""
                
        new_df['Date'] = pd.to_datetime(new_df['Date'], dayfirst=True, errors='coerce').dt.normalize()
        new_df = new_df.dropna(subset=['Date'])
        new_df['Financial_Year'] = new_df['Date'].apply(calculate_uk_financial_year)
        
        new_df['Amount'] = pd.to_numeric(new_df['Amount'], errors='coerce').fillna(0.0).abs().round(2)
        new_df['Name'] = new_df['Name'].apply(clean_string)
        new_df['Category'] = new_df['Category'].apply(clean_string)
        new_df['Transaction_Type'] = new_df['Transaction_Type'].apply(clean_string)

        matched_indexes = set()
        for _, row in new_df.iterrows():
            if st.session_state.df.empty:
                new_list.append(row[COLS])
                continue

            db_names = st.session_state.df['Name'].fillna("").astype(str).str.strip()
            row_name = str(row['Name']).strip() if pd.notna(row['Name']) else ""
            
            mask = (st.session_state.df['Date'] == row['Date']) & \
                   (db_names == row_name) & \
                   (pd.to_numeric(st.session_state.df['Amount']).round(2) == round(row['Amount'], 2))
            
            matches = [i for i in st.session_state.df.index[mask] if i not in matched_indexes]
            if matches:
                idx = matches[0]
                matched_indexes.add(idx)
                if clean_string(st.session_state.df.loc[idx, 'Category']) != clean_string(row['Category']) and row['Category'] != "":
                    st.session_state.df.loc[idx, 'Category'] = row['Category']
                    updated_list.append(row[COLS])
            else:
                new_list.append(row[COLS])

        if new_list:
            st.session_state.df = pd.concat([st.session_state.df, pd.DataFrame(new_list)], ignore_index=True)
            st.session_state.unsaved_sync = True # Correctly triggers save context when new data hits
        
        st.session_state.new_sync_rows = pd.DataFrame(new_list)
        st.session_state.updated_sync_rows = pd.DataFrame(updated_list)
        
    except Exception as e: 
        st.error(f"Processing error: {e}")

# --- UI Sidebar ---
with st.sidebar:
    st.caption(f"Active scope: {st.session_state.active_account_scope}")
    if st.button(" Save Database to Disk", type="primary", use_container_width=True):
        save_database()

    health_errors, health_notes = build_startup_health()
    with st.expander(" Startup Health", expanded=False):
        if not health_errors:
            st.success("Core config is ready for this session.")
        else:
            for msg in health_errors:
                st.warning(msg)

        for msg in health_notes:
            st.info(msg)

        st.caption(f"Data directory: {DATA_DIR}")
        st.caption(f"Database file: {os.path.basename(DB_FILE)}")
        
    st.divider()
    st.markdown("** Global Data Filter**")
    st.toggle(" Hide Pre-2020 Transactions", value=True, key="ignore_legacy", help="Hides old legacy data from your charts and averages without deleting them from your database.")    
    with st.expander("⚙️ Advanced Settings"):
        st.markdown("**1. Monthly Trend Setup**")
        
        if "committed_categories" not in st.session_state.app_settings: 
            st.session_state.app_settings["committed_categories"] = []
        if "committed_presets" not in st.session_state.app_settings:
            st.session_state.app_settings["committed_presets"] = {}
            
        new_committed = st.multiselect("Select 'Committed' Bills:", master_cats, default=st.session_state.app_settings["committed_categories"])
        if new_committed != st.session_state.app_settings["committed_categories"]:
            st.session_state.app_settings["committed_categories"] = new_committed
            save_database(show_success=False)
            st.rerun()
            
        cp_col1, cp_col2 = st.columns(2)
        with cp_col1:
            cp_opts = ["-- Select --"] + list(st.session_state.app_settings["committed_presets"].keys())
            sel_cp = st.selectbox("Load Preset", cp_opts, key="load_cp_box", label_visibility="collapsed")
            if st.button(" Load Preset", use_container_width=True):
                if sel_cp != "-- Select --":
                    st.session_state.app_settings["committed_categories"] = st.session_state.app_settings["committed_presets"][sel_cp]
                    save_database(show_success=False)
                    st.rerun()
        with cp_col2:
            new_cp_name = st.text_input("Preset Name", placeholder="e.g. 2025 Baseline", key="save_cp_name", label_visibility="collapsed")
            if st.button(" Save Preset", use_container_width=True):
                if new_cp_name:
                    st.session_state.app_settings["committed_presets"][new_cp_name] = st.session_state.app_settings["committed_categories"]
                    save_database(show_success=False)
                    st.toast(f"✅ Preset '{new_cp_name}' saved!")
                    st.rerun()
                    
        st.divider()
        st.markdown("**2. System Setup**")
        new_cat = st.text_input("Add New Category")
        if st.button("Add Category", use_container_width=True) and new_cat:
            st.session_state.app_settings["custom_categories"].append(new_cat)
            st.toast(f"✅ Added {new_cat}")
            save_database(show_success=False)
            st.rerun()
        if st.button("Log Out", use_container_width=True):
            st.session_state.authenticated = False
            st.rerun()

# --- MAIN APP HEADER ---
if os.path.exists(LOGO_FILE):
    head_col1, head_col2, head_col3 = st.columns([1, 4, 1])
    with head_col2:
        st.image(LOGO_FILE, use_container_width=True)

tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs([" Add & Sync", " Dashboard", " Intelligence", "⚙️ Data Editor", " Export", " Internal Tracking"])

table_format = {
    "Date": st.column_config.DateColumn("Date", format="DD/MM/YYYY"),
    "Amount": st.column_config.NumberColumn("Amount", format="£%.2f")
}

# === TAB 1: ADD & SYNC ===
with tab1:
    if not st.session_state.new_sync_rows.empty:
        st.info(f"✨ Found {len(st.session_state.new_sync_rows)} new items.")
        with st.expander(" Review New Data", expanded=True):
            st.dataframe(st.session_state.new_sync_rows, use_container_width=True, hide_index=True, column_config=table_format)
            if st.button("Clear Preview"):
                st.session_state.new_sync_rows = pd.DataFrame(columns=COLS)
                st.rerun()

    st.subheader(" Sync & Import")
    col_left, col_right = st.columns(2)
    
    with col_left:
        st.markdown("**Google Sheets Sync**")
        s_url = st.text_input("Monzo Sheet URL:", value=st.session_state.app_settings.get("monzo_sheet_url", ""))
        s_worksheet = st.text_input(
            "Worksheet name:",
            value=st.session_state.app_settings.get("monzo_sheet_worksheet", "")
        )
        if st.button("Sync Now", type="primary"):
            if s_url:
                with st.spinner("Fetching Live Data..."):
                    st.session_state.app_settings["monzo_sheet_url"] = s_url
                    st.session_state.app_settings["monzo_sheet_worksheet"] = s_worksheet.strip() or st.session_state.app_settings["monzo_sheet_worksheet"]
                    conn = st.connection("gsheets", type=GSheetsConnection)
                    df_s = conn.read(
                        spreadsheet=s_url,
                        worksheet=st.session_state.app_settings["monzo_sheet_worksheet"],
                        ttl=0
                    )
                    process_new_data(df_s, "Monzo")
                    st.rerun()
                
        st.divider()
        st.markdown("**Manual File Upload**")
        up_bank = st.selectbox("Bank Format:", ["Auto-Detect", "Monzo", "HSBC", "Barclaycard"])
        up = st.file_uploader("Upload CSV", type=['csv'])
        if up and st.button("Process File"):
            hdr = None if up_bank == "Barclaycard" else 0
            process_new_data(pd.read_csv(up, header=hdr), up_bank)
            st.rerun()

    with col_right:
        st.markdown("**Paste Data**")
        p_bank = st.selectbox("Paste Format:", ["Auto-Detect", "Monzo", "HSBC", "Barclaycard"], key="p_bank")
        p_data = st.text_area("Paste spreadsheet rows (including headers):", height=150)
        if st.button("Process Paste"):
            if p_data:
                try:
                    hdr_p = None if p_bank == "Barclaycard" else 0
                    df_p = pd.read_csv(io.StringIO(p_data), sep='\t', header=hdr_p)
                    if len(df_p.columns) < 2: 
                        df_p = pd.read_csv(io.StringIO(p_data), sep=',', header=hdr_p)
                    process_new_data(df_p, p_bank)
                    st.rerun()
                except Exception as e: st.error(f"Paste Error: {e}")

        st.divider()
        st.markdown("**Manual Entry**")
        with st.form("man_entry", clear_on_submit=True):
            m_d = st.date_input("Date")
            m_n = st.text_input("Name")
            m_a = st.number_input("Amount (£)", step=0.01)
            m_t = st.radio("Type", ["Expense", "Income"], horizontal=True)
            m_c = st.selectbox("Category", master_cats)
            if st.form_submit_button("Add Transaction"):
                process_new_data(pd.DataFrame([{'Date': pd.to_datetime(m_d).normalize(), 'Name': m_n, 'Amount': m_a, 'Transaction_Type': m_t, 'Bank': 'Manual', 'Category': m_c}]))
                st.rerun()
                
    if st.session_state.unsaved_sync:
        st.warning("⚠️ You have newly synced data that hasn't been saved yet.")
        if st.button(" Save New Transactions to Disk", type="primary", use_container_width=True):
            save_database()
            st.session_state.unsaved_sync = False
            st.rerun()

# === TAB 2: DASHBOARD ===
with tab2:
    if not st.session_state.df.empty:
        import plotly.graph_objects as go 
        
        # FIXED: Removed the double-copy bug
        df_v = st.session_state.df.copy()
        df_v['Category'] = df_v['Category'].astype(str).str.strip()
        df_v = df_v.sort_values('Date')
        df_v['Calendar_Year'] = df_v['Date'].dt.year.astype(str)
        df_v['Month_Year'] = df_v['Date'].dt.to_period('M').astype(str)
        
        if st.session_state.ignore_legacy:
            df_v = df_v[df_v['Date'] >= '2021-01-01']

        # --- DATA ENGINE: Classify True Income vs Refunds vs Expenses ---
        committed_cats = st.session_state.app_settings.get("committed_categories", [])
        
        def assign_spend_type(row):
            if row['Category'] in internal_categories: return 'Internal Transfer'
            
            if row['Transaction_Type'] == 'Income':
                if row['Category'] not in true_income_categories:
                    if row['Category'] in committed_cats: return 'Committed Refund'
                    return 'Variable Refund'
                return 'True Income'
                
            if row['Category'] in committed_cats: return 'Committed Expense'
            return 'Variable Expense'
            
        df_v['Spend_Type'] = df_v.apply(assign_spend_type, axis=1)

        # --- FILTERS ---
        if st.button(" Reset Dashboard Filters", key="reset_dash"):
            st.session_state['dash_hide_int'] = True
            st.session_state['dash_net_spend'] = False
            st.session_state['dash_year_mode'] = "Financial Year"
            st.session_state['dash_sel_year'] = "All"
            st.session_state['dash_sel_bank'] = "All Banks"
            st.session_state['dash_incl'] = []
            st.session_state['dash_excl'] = []
            if 'dash_months' in st.session_state: st.session_state['dash_months'] = []
            st.rerun()
            
        top_col1, top_col2 = st.columns(2)
        hide_internal = top_col1.checkbox("Hide Internal Movements", value=st.session_state.get('dash_hide_int', True), key="dash_hide_int")
        net_spend_mode = top_col2.checkbox("Net Spend Only Mode", value=st.session_state.get('dash_net_spend', False), key="dash_net_spend")
        
        if hide_internal: 
            cats_to_hide = [c for c in internal_categories if c not in committed_cats]
            df_v = df_v[~df_v['Category'].isin(cats_to_hide)]
            
        if net_spend_mode: df_v = df_v[df_v['Transaction_Type'] == 'Expense']

        fc1, fc2, fc3 = st.columns(3)
        year_type = fc1.radio("Time Mode", ["Financial Year", "Calendar Year", "Rolling Period"], horizontal=True, key="dash_year_mode")
        
        rolling_options = {"Last 3 Months": 3, "Last 6 Months": 6, "Last 12 Months": 12, "Last 18 Months": 18, "Last 2 Years": 24}
        
        if year_type == "Rolling Period":
            sel_year = fc2.selectbox("Select Timeframe", list(rolling_options.keys()), key="dash_sel_year")
            months_to_look_back = rolling_options.get(sel_year, 3) 
            cutoff = pd.Timestamp.now().normalize() - pd.DateOffset(months=months_to_look_back)
            df_v = df_v[df_v['Date'] >= cutoff]
        else:
            target_col = 'Calendar_Year' if year_type == "Calendar Year" else 'Financial_Year'
            all_years = ['All'] + sorted(list(df_v[target_col].dropna().unique()))
            sel_year = fc2.selectbox("Select Year", all_years, key="dash_sel_year")
            if sel_year != 'All': 
                df_v = df_v[df_v[target_col] == sel_year]
                
        all_dash_banks = ['All Banks'] + master_banks
        sel_dash_bank = fc3.selectbox("Bank", all_dash_banks, key="dash_sel_bank")
        if sel_dash_bank != 'All Banks': df_v = df_v[df_v['Bank'] == sel_dash_bank]
        
        fc4, fc5, fc6 = st.columns(3)
        with fc4:
            if year_type == "Calendar Year":
                month_names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                sel_months = st.multiselect("Specific Months", month_names, key="dash_months")
                if sel_months: df_v = df_v[df_v['Date'].dt.strftime('%B').isin(sel_months)]
            else: st.write("") 
                
        with fc5:
            incl = st.multiselect("Specific Categories (Include)", master_cats, key="dash_incl")
            if incl: df_v = df_v[df_v['Category'].isin(incl)]
            
        with fc6:
            excl = st.multiselect("Categories to Exclude", master_cats, key="dash_excl")
            if excl: df_v = df_v[~df_v['Category'].isin(excl)]

        # --- METRICS CALCULATIONS (Refund Adjusted) ---
        inc = df_v[df_v['Spend_Type']=='True Income']['Amount'].sum()
        
        gross_com = df_v[df_v['Spend_Type']=='Committed Expense']['Amount'].sum()
        gross_var = df_v[df_v['Spend_Type']=='Variable Expense']['Amount'].sum()
        
        ref_com = df_v[df_v['Spend_Type']=='Committed Refund']['Amount'].sum()
        ref_var = df_v[df_v['Spend_Type']=='Variable Refund']['Amount'].sum()
        
        exp_com = gross_com - ref_com
        exp_var = gross_var - ref_var
        exp_total = exp_com + exp_var
        
        if year_type == "Rolling Period":
            months_in_period = rolling_options.get(sel_year, max(1, df_v['Month_Year'].nunique()))
        else:
            months_in_period = max(1, df_v['Month_Year'].nunique())
            
        avg_monthly = exp_total / months_in_period
        avg_baseline = exp_com / months_in_period
        avg_income = inc / months_in_period
        spare_cash = avg_income - avg_baseline
        
        st.divider()
        st.markdown("###  Period Totals")
        m1, m2, m3 = st.columns(3)
        m1.metric("Total True Income", f"£{inc:,.2f}")
        m2.metric("Net Expenses", f"£{exp_total:,.2f}")
        m3.metric("Net Flow", f"£{inc-exp_total:,.2f}")

        st.markdown("###  Monthly Averages & True Cash Flow")
        r1, r2, r3, r4 = st.columns(4)
        r1.metric("Avg Income /Mo", f"£{avg_income:,.2f}")
        r2.metric(" Baseline Bills /Mo", f"£{avg_baseline:,.2f}", help="Your average committed fixed bills.")
        r3.metric(" Spare Cash /Mo", f"£{spare_cash:,.2f}", help="Income minus Baseline. Your true discretionary budget.")
        r4.metric("Avg Total Spend /Mo", f"£{avg_monthly:,.2f}", help="Your actual total average spending.")

        # --- RECENT MONTH DELTA ANALYSIS ---
        st.write("###  Recent Month vs. Historical Average")
        if months_in_period >= 2:
            last_month = df_v['Month_Year'].max()
            df_last = df_v[df_v['Month_Year'] == last_month]
            df_prev = df_v[df_v['Month_Year'] != last_month]
            
            last_m_com = df_last[df_last['Spend_Type']=='Committed Expense']['Amount'].sum() - df_last[df_last['Spend_Type']=='Committed Refund']['Amount'].sum()
            last_m_var = df_last[df_last['Spend_Type']=='Variable Expense']['Amount'].sum() - df_last[df_last['Spend_Type']=='Variable Refund']['Amount'].sum()
            
            prev_m_count = max(1, df_prev['Month_Year'].nunique())
            avg_m_com = (df_prev[df_prev['Spend_Type']=='Committed Expense']['Amount'].sum() - df_prev[df_prev['Spend_Type']=='Committed Refund']['Amount'].sum()) / prev_m_count
            avg_m_var = (df_prev[df_prev['Spend_Type']=='Variable Expense']['Amount'].sum() - df_prev[df_prev['Spend_Type']=='Variable Refund']['Amount'].sum()) / prev_m_count
            
            d1, d2, d3 = st.columns([1, 1, 2])
            d1.metric(f"Committed ({last_month})", f"£{last_m_com:,.2f}", delta=f"£{last_m_com - avg_m_com:,.2f} vs Avg", delta_color="inverse")
            d2.metric(f"Variable ({last_month})", f"£{last_m_var:,.2f}", delta=f"£{last_m_var - avg_m_var:,.2f} vs Avg", delta_color="inverse")
            
            diff = last_m_var - avg_m_var
            if diff > 0:
                d3.warning(f"⚠️ **Insight:** Your variable lifestyle spending in {last_month} was **£{abs(diff):,.2f} higher** than your historical baseline.")
            else:
                d3.success(f" **Insight:** Excellent! Your variable spending in {last_month} was **£{abs(diff):,.2f} lower** than your historical baseline.")
        else:
            st.info("Select a date range containing at least 2 months to see historical lifestyle creep analysis.")

        st.divider()
        
        # --- CHART TOGGLES ---
        st.write("### ️ Chart Visibility Toggles")
        t_col1, t_col2, t_col3, t_col4, t_col5 = st.columns(5)
        show_monthly = t_col1.toggle(" Monthly Cash Flow", value=True)
        show_cumulative = t_col2.toggle(" Cumulative Wealth", value=False)
        show_categories = t_col3.toggle("️ Top Categories", value=True)
        show_merchants = t_col4.toggle(" Top 10 Merchants", value=False)
        show_sunburst = t_col5.toggle(" Category Sunburst", value=False)
        
        st.markdown("<br>", unsafe_allow_html=True)

        charts_to_show = []
        if show_monthly: charts_to_show.append('monthly')
        if show_cumulative: charts_to_show.append('cumulative')
        if show_categories: charts_to_show.append('categories')
        if show_merchants: charts_to_show.append('merchants')
        if show_sunburst: charts_to_show.append('sunburst')

        for i in range(0, len(charts_to_show), 2):
            cols = st.columns(2)
            for j in range(2):
                if i + j < len(charts_to_show):
                    chart = charts_to_show[i + j]
                    with cols[j]:
                        if chart == 'monthly':
                            ms = df_v.groupby(['Month_Year', 'Spend_Type'])['Amount'].sum().unstack(fill_value=0).reset_index()
                            for col in ['True Income', 'Committed Expense', 'Variable Expense']:
                                if col not in ms.columns: ms[col] = 0
                                
                            fig_bar = go.Figure()
                            fig_bar.add_trace(go.Bar(x=ms['Month_Year'], y=ms['True Income'], name='Income', marker_color='#2ecc71', offsetgroup=0))
                            fig_bar.add_trace(go.Bar(x=ms['Month_Year'], y=ms['Committed Expense'], name='Committed Baseline', marker_color='#8b0000', offsetgroup=1))
                            fig_bar.add_trace(go.Bar(x=ms['Month_Year'], y=ms['Variable Expense'], name='Variable Lifestyle', marker_color='#f39c12', offsetgroup=1, base=ms['Committed Expense']))
                            
                            fig_bar.update_layout(title='Monthly Cash Flow (Baseline vs Lifestyle)', barmode='group', xaxis_title="Month", yaxis_title="Amount (£)")
                            st.plotly_chart(fig_bar, use_container_width=True)
                            
                            with st.expander("ℹ️ What does this chart show?"):
                                st.caption("Compares your **True Income** (green) against your expenses. Your **Variable Lifestyle** (orange) sits stacked on top of your **Committed Baseline** (red) so you can easily see if your total outbound cash exceeded your income for the month.")
                            
                        elif chart == 'cumulative':
                            df_daily = df_v.groupby('Date').apply(lambda x: x[x['Spend_Type']=='True Income']['Amount'].sum() - x[x['Spend_Type'].str.contains('Expense')]['Amount'].sum()).reset_index(name='Net')
                            df_daily['Cumulative'] = df_daily['Net'].cumsum()
                            fig_cum = px.line(df_daily, x='Date', y='Cumulative', title='Cumulative Wealth Trajectory')
                            fig_cum.update_traces(line_color='#3498db', fill='tozeroy')
                            st.plotly_chart(fig_cum, use_container_width=True)
                            
                            with st.expander("ℹ️ What does this chart show?"):
                                st.caption("Tracks your Net Flow (Income minus Expenses) day by day. An **upward trend** means you are retaining cash and building wealth. A **downward trend** means you are spending more than you earn.")
                            
                        elif chart == 'categories':
                            exp_df = df_v[df_v['Spend_Type'].str.contains('Expense')]
                            top_cats = exp_df.groupby('Category')['Amount'].sum().nlargest(10).reset_index()
                            fig_cat = px.bar(top_cats, x='Amount', y='Category', orientation='h', title='Top 10 Expense Categories')
                            fig_cat.update_layout(yaxis={'categoryorder':'total ascending'})
                            fig_cat.update_traces(marker_color='#9b59b6')
                            st.plotly_chart(fig_cat, use_container_width=True)
                            
                            with st.expander("ℹ️ What does this chart show?"):
                                st.caption("Ranks your highest spending categories. This strictly isolates your **Expenses** (actively ignoring internal transfers and income) to show you exactly where the bulk of your money is going.")
                            
                        elif chart == 'merchants':
                            exp_df = df_v[df_v['Spend_Type'].str.contains('Expense')]
                            top_merch = exp_df.groupby('Name')['Amount'].sum().nlargest(10).reset_index()
                            fig_merch = px.bar(top_merch, x='Amount', y='Name', orientation='h', title='Top 10 Merchants (Spend)')
                            fig_merch.update_layout(yaxis={'categoryorder':'total ascending'})
                            fig_merch.update_traces(marker_color='#e67e22')
                            st.plotly_chart(fig_merch, use_container_width=True)
                            
                            with st.expander("ℹ️ What does this chart show?"):
                                st.caption("Highlights the specific shops, services, or merchants taking the biggest chunk of your money. This is incredibly helpful for spotting expensive habits or costly subscriptions.")
                            
                        elif chart == 'sunburst':
                            exp_df = df_v[df_v['Spend_Type'].str.contains('Expense')].copy()
                            exp_df['Category'] = exp_df['Category'].replace('', 'Uncategorized').fillna('Uncategorized')
                            exp_df = exp_df[exp_df['Amount'] > 0]
                            fig_sun = px.sunburst(exp_df, path=['Bank', 'Category'], values='Amount', title='Expense Breakdown (Bank > Category)')
                            st.plotly_chart(fig_sun, use_container_width=True)
                            
                            with st.expander("ℹ️ How to use this chart"):
                                st.caption("A multi-level, interactive view of your spending. **Click on any slice** (like a specific Bank) to zoom in and see exactly which categories make up that slice. Click the center circle to zoom back out!")

        st.divider()
        st.write("### ️ Data Table Companion")
        display_df = df_v.copy().sort_values('Date', ascending=False).drop(columns=['Month_Year', 'Calendar_Year', 'Spend_Type'])
        st.dataframe(display_df, use_container_width=True, column_config=table_format, height=400)

# === TAB 3: CATEGORY INTELLIGENCE ===
with tab3:
    st.subheader(" Category Intelligence")
    if not st.session_state.df.empty:
        other_bank_df = st.session_state.df[st.session_state.df['Bank'] != 'Monzo']
        ignore_list = [str(x).lower().strip() for x in st.session_state.app_settings.get("ignore_suggestions", [])]
        suggestions = []
        sim_cache = {} 

        for idx, row in other_bank_df.iterrows():
            m_name = str(row['Name']).lower().strip()
            if m_name in ignore_list: continue
            curr_cat = clean_string(row['Category'])
            
            if curr_cat and curr_cat not in pure_monzo_cats:
                if curr_cat not in sim_cache:
                    match = difflib.get_close_matches(curr_cat, list(pure_monzo_cats), n=1, cutoff=0.5)
                    sim_cache[curr_cat] = match[0] if match else None
                
                if sim_cache[curr_cat]:
                    suggestions.append({'Index': idx, 'Merchant': row['Name'], 'From': curr_cat, 'Suggested': sim_cache[curr_cat]})

        if suggestions:
            s_df = pd.DataFrame(suggestions)
            st.write(f"Found **{len(s_df)}** potential standardisations:")
            st.dataframe(s_df.drop(columns=['Index']), use_container_width=True)
            
            label_to_idx = {f"{row['Merchant']} | Change '{row['From']}' to '{row['Suggested']}'": row['Index'] for _, row in s_df.iterrows()}
            selected_labels = st.multiselect("Select Merchants to Action:", options=list(label_to_idx.keys()))
            
            i_col1, i_col2 = st.columns(2)
            if i_col1.button("✅ Apply Standardisations", type="primary"):
                for lbl in selected_labels:
                    idx = label_to_idx[lbl]
                    s_row = s_df[s_df['Index'] == idx].iloc[0]
                    st.session_state.df.loc[st.session_state.df['Category'] == s_row['From'], 'Category'] = s_row['Suggested']
                st.toast("✅ Categories updated!")
                st.rerun()
                
            if i_col2.button(" Mute Selected Merchants"):
                for lbl in selected_labels:
                    idx = label_to_idx[lbl]
                    merchant_name = str(s_df[s_df['Index'] == idx].iloc[0]['Merchant']).strip()
                    if merchant_name.lower() not in ignore_list:
                        st.session_state.app_settings.setdefault("ignore_suggestions", []).append(merchant_name)
                save_database(show_success=False)
                st.toast(" Merchants permanently muted!")
                st.rerun()
        else:
            st.info("No alignment issues found. Your data is perfectly mapped!")

# === TAB 4: DATA EDITOR & BULK EDIT ===
with tab4:
    st.subheader("⚙️ Data Editor & Bulk Operations")
    
    if st.button(" Reset Editor Filters", key="reset_editor"):
        st.session_state['de_bank'] = "All"
        st.session_state['de_cat'] = "All"
        st.session_state['de_name'] = ""
        st.session_state['de_rows'] = 20
        st.session_state['bulk_bank'] = "All"
        st.session_state['bulk_cat'] = "All"
        st.session_state['bulk_name'] = ""
        st.session_state['bulk_date'] = ()
        st.rerun()

    if not st.session_state.df.empty:
        edit_mode = st.radio("Select Interface Mode:", ["Direct Table Edit", "Bulk Update Rules"], horizontal=True)
        st.divider()
        
        if edit_mode == "Direct Table Edit":
            st.write("Filter your data, edit the cells directly spreadsheet-style, and hit Save.")
            
            de_col1, de_col2, de_col3 = st.columns(3)
            de_bank = de_col1.selectbox("Filter Bank", ["All"] + master_banks, key="de_bank")
            de_cat = de_col2.selectbox("Filter Category", ["All"] + master_cats, key="de_cat")
            de_name = de_col3.text_input("Merchant Name contains", "", key="de_name")
            
            df_edit = st.session_state.df.copy()
            df_edit = df_edit.sort_values('Date', ascending=False)
            
            is_filtered = False
            if de_bank != "All": 
                df_edit = df_edit[df_edit['Bank'] == de_bank]
                is_filtered = True
            if de_cat != "All":
                df_edit = df_edit[df_edit['Category'] == de_cat]
                is_filtered = True
            if de_name: 
                df_edit = df_edit[df_edit['Name'].str.contains(de_name, case=False, na=False)]
                is_filtered = True

            de_disp_rows = st.selectbox("Rows to display:", [20, 50, 100, 500, "All"], index=0, key="de_rows")
            de_pixel_height = 800 if de_disp_rows == "All" else int(de_disp_rows) * 35 + 40
            
            edited_df = st.data_editor(df_edit, use_container_width=True, height=de_pixel_height, num_rows="dynamic" if not is_filtered else "fixed", column_config=table_format)
            
            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                commit_pressed = st.button(" Commit Table Edits", use_container_width=True, key="commit_table")
            with btn_col2:
                save_pressed = st.button(" Save Data to Disk", use_container_width=True, key="save_table_disk")
                
            if commit_pressed:
                if is_filtered: st.session_state.df.update(edited_df)
                else: st.session_state.df = edited_df
                
                st.session_state.df['Financial_Year'] = st.session_state.df['Date'].apply(calculate_uk_financial_year)
                st.toast("✅ Edits committed to current session!")
                
            if save_pressed:
                save_database(show_success=False)
                st.toast(" Database successfully saved to disk!")

        else:
            b_col1, b_col2, b_col3, b_col4 = st.columns(4)
            b_bank = b_col1.selectbox("Filter Bank", ["All"] + master_banks, key="bulk_bank")
            b_cat = b_col2.selectbox("Filter Category", ["All"] + master_cats, key="bulk_cat")
            b_name = b_col3.text_input("Merchant Name contains", "", key="bulk_name")
            b_date = b_col4.date_input("Date Range", [], key="bulk_date")
            
            bulk_df = st.session_state.df.copy()
            if b_bank != "All": bulk_df = bulk_df[bulk_df['Bank'] == b_bank]
            if b_cat != "All": bulk_df = bulk_df[bulk_df['Category'] == b_cat]
            if b_name: bulk_df = bulk_df[bulk_df['Name'].str.contains(b_name, case=False, na=False)]
            if len(b_date) == 2:
                bulk_df = bulk_df[(bulk_df['Date'] >= pd.Timestamp(b_date[0])) & (bulk_df['Date'] <= pd.Timestamp(b_date[1]))]

            st.write(f"Found **{len(bulk_df)}** matching transactions.")
            st.dataframe(bulk_df, use_container_width=True, column_config=table_format)

            if len(bulk_df) > 0:
                label_to_idx = {f"ID:{idx} | {row['Date'].strftime('%d/%m/%Y')} | {row['Name']} | £{row['Amount']}": idx for idx, row in bulk_df.iterrows()}
                selected_labels = st.multiselect("Select specific rows to update:", options=list(label_to_idx.keys()))

                act_col1, act_col2 = st.columns(2)
                new_bulk_cat = act_col1.selectbox("Set Category to:", ["No Change"] + master_cats)
                new_bulk_type = act_col2.selectbox("Set Type to:", ["No Change", "Expense", "Income"])

                if st.button(" Execute Bulk Update & Save", type="primary"):
                    selected_indices = [label_to_idx[lbl] for lbl in selected_labels]
                    if selected_indices:
                        if new_bulk_cat != "No Change": st.session_state.df.loc[selected_indices, 'Category'] = new_bulk_cat
                        if new_bulk_type != "No Change": st.session_state.df.loc[selected_indices, 'Transaction_Type'] = new_bulk_type
                        save_database(show_success=False)
                        st.toast(f"✅ Updated {len(selected_indices)} rows and saved to disk!")
                    else:
                        st.warning("No rows selected.")

# === TAB 5: EXPORT ===
with tab5:
    st.subheader(" Advanced Export")
    
    if 'export_presets' not in st.session_state:
        st.session_state.export_presets = load_json_file(FILTER_FILE)
        
    pr_col1, pr_col2 = st.columns(2)
    with pr_col1:
        preset_keys = ["-- Select Preset --"] + list(st.session_state.export_presets.keys())
        sel_preset = st.selectbox("Load Filter Preset", preset_keys, key="load_preset_box")
        if st.button("✅ Apply Preset"):
            if sel_preset != "-- Select Preset --":
                p_data = st.session_state.export_presets[sel_preset]
                st.session_state['ex_type'] = p_data.get('type', 'Both')
                st.session_state['ex_fy'] = p_data.get('fy', 'All')
                st.session_state['ex_cats'] = p_data.get('cats', [])
                st.session_state['ex_merchant'] = p_data.get('merchant', '')
                st.session_state['ex_bank'] = p_data.get('bank', 'All')
                st.rerun()
                
    with pr_col2:
        new_preset = st.text_input("Save Current Filters As:", key="save_preset_name")
        if st.button(" Save Preset"):
            if new_preset:
                st.session_state.export_presets[new_preset] = {
                    'type': st.session_state.get('ex_type', 'Both'),
                    'fy': st.session_state.get('ex_fy', 'All'),
                    'cats': st.session_state.get('ex_cats', []),
                    'merchant': st.session_state.get('ex_merchant', ''),
                    'bank': st.session_state.get('ex_bank', 'All')
                }
                with open(FILTER_FILE, "w", encoding="utf-8") as f:
                    json.dump(st.session_state.export_presets, f)
                st.toast(f"Preset '{new_preset}' saved successfully!")
                st.rerun()

    st.divider()

    if st.button(" Reset Export Filters", key="reset_export"):
        st.session_state['ex_type'] = "Both"
        st.session_state['ex_date'] = ()
        st.session_state['ex_fy'] = "All"
        st.session_state['ex_cats'] = []
        st.session_state['ex_merchant'] = ""
        st.session_state['ex_bank'] = "All"
        st.session_state['ex_rows'] = 20
        st.rerun()
    
    if not st.session_state.df.empty:
        export_df = st.session_state.df.copy()
        export_df = export_df.sort_values('Date', ascending=False)
        
        ex_col1, ex_col2, ex_col3 = st.columns(3)
        ex_type = ex_col1.radio("Transaction Type", ["Both", "Expense", "Income"], horizontal=True, key="ex_type")
        ex_date_range = ex_col2.date_input("Date Range (Leave blank for all)", [], key="ex_date")
        
        all_ex_fys = ['All'] + sorted(list(export_df['Financial_Year'].dropna().unique()))
        ex_fy = ex_col3.selectbox("Financial Year", all_ex_fys, key="ex_fy")
            
        ex_col4, ex_col5, ex_col6 = st.columns(3)
        all_cats = sorted(list(export_df['Category'].dropna().unique()))
        ex_cats = ex_col4.multiselect("Categories", all_cats, key="ex_cats")
        ex_merchant = ex_col5.text_input("Merchant Name contains", "", key="ex_merchant")
        
        all_banks = ['All'] + sorted(list(export_df['Bank'].dropna().unique()))
        ex_bank = ex_col6.selectbox("Bank", all_banks, key="ex_bank")
            
        if ex_type != "Both": export_df = export_df[export_df['Transaction_Type'] == ex_type]
        if ex_fy != "All": export_df = export_df[export_df['Financial_Year'] == ex_fy]
        if len(ex_date_range) == 2:
            export_df = export_df[(export_df['Date'] >= pd.Timestamp(ex_date_range[0])) & (export_df['Date'] <= pd.Timestamp(ex_date_range[1]))]
        if ex_cats: export_df = export_df[export_df['Category'].isin(ex_cats)]
        if ex_merchant: export_df = export_df[export_df['Name'].str.contains(ex_merchant, case=False, na=False)]
        if ex_bank != "All": export_df = export_df[export_df['Bank'] == ex_bank]
            
        st.divider()
        if len(export_df) > 0:
            st.success(f" Found **{len(export_df)}** transactions matching filters.")
            ex_disp_rows = st.selectbox("Table View Size (Rows):", [20, 50, 100, 500, "All"], index=0, key="ex_rows")
            ex_pixel_height = 800 if ex_disp_rows == "All" else int(ex_disp_rows) * 35 + 40
            
            st.dataframe(export_df, use_container_width=True, height=ex_pixel_height, column_config=table_format)
            
            csv_export = export_df.copy()
            csv_export['Date'] = csv_export['Date'].dt.strftime('%d/%m/%Y')
            csv_data = csv_export.to_csv(index=False).encode('utf-8')
            
            st.download_button(label="⬇️ Download Filtered CSV", data=csv_data, file_name="expense_export.csv", mime="text/csv", type="primary", use_container_width=True)
        else:
            st.warning("No transactions match these exact filters.")

# === TAB 6: INTERNAL TRACKING ===
with tab6:
    st.subheader(" Internal Wealth Movements")
    if not st.session_state.df.empty:
        internal_df = st.session_state.df[st.session_state.df['Category'].isin(internal_categories)].copy()
        
        if st.session_state.ignore_legacy:
            internal_df = internal_df[internal_df['Date'] >= '2020-01-01']
            
        if not internal_df.empty:
            int_time_opts = ["All Time", "Last 12 Months", "Last 2 Years", "Last 3 Years", "Last 4 Years"]
            sel_int_time = st.selectbox("Select Timeframe:", int_time_opts, key="int_time_filter")
            
            if sel_int_time != "All Time":
                today = pd.Timestamp.now().normalize()
                if sel_int_time == "Last 12 Months": cutoff = today - pd.DateOffset(months=12)
                elif sel_int_time == "Last 2 Years": cutoff = today - pd.DateOffset(years=2)
                elif sel_int_time == "Last 3 Years": cutoff = today - pd.DateOffset(years=3)
                elif sel_int_time == "Last 4 Years": cutoff = today - pd.DateOffset(years=4)
                
                internal_df = internal_df[internal_df['Date'] >= cutoff]

            if len(internal_df) > 0:
                internal_df['Month_Year'] = internal_df['Date'].dt.to_period('M').astype(str)
                
                int_summary = internal_df.groupby(['Month_Year', 'Category'])['Amount'].sum().reset_index()
                fig_int = px.bar(int_summary, x='Month_Year', y='Amount', color='Category', barmode='stack', title="Internal Flow Timeline")
                st.plotly_chart(fig_int, use_container_width=True)
                
                display_int_df = internal_df.drop(columns=['Month_Year']).sort_values('Date', ascending=False)
                st.dataframe(display_int_df, use_container_width=True, column_config=table_format)
            else:
                st.warning(f"No internal movements found within the {sel_int_time}.")
        else:
            st.info("No internal movements tracked yet.")
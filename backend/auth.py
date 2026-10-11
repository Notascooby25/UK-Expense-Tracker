"""Authentication and secrets loading for the UK Expense Tracker backend."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
import tomllib
from typing import Any

from fastapi import HTTPException, Request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COOKIE_NAME = "uk_expense_session"
SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days

# Ephemeral fallback signing key if no auth password is configured
_FALLBACK_SIGNING_SECRET = secrets.token_hex(32)


def is_truthy(value: object) -> bool:
    """Return True if value represents a boolean truthy string."""
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_secrets_path() -> str:
    """Return path to .streamlit/secrets.toml (or test override)."""
    override = os.getenv("EXPENSE_TRACKER_SECRETS_FILE")
    if override:
        return override
    return os.path.join(BASE_DIR, ".streamlit", "secrets.toml")


def load_secrets_toml() -> dict[str, Any]:
    """Parse .streamlit/secrets.toml safely, returning empty dict if absent."""
    path = get_secrets_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def is_auth_secrets_required() -> bool:
    """Return True if production mode or explicit env var requires auth secrets."""
    app_env = os.getenv("EXPENSE_TRACKER_ENV", "development").strip().lower()
    return (
        is_truthy(os.getenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "")) or app_env == "production"
    )


def has_auth_secrets() -> bool:
    """Return True if [auth] username and password are set in secrets.toml."""
    secrets_data = load_secrets_toml()
    auth_data = secrets_data.get("auth", {})
    if not isinstance(auth_data, dict):
        return False
    return bool(str(auth_data.get("username", "")).strip()) and bool(
        str(auth_data.get("password", "")).strip()
    )


def get_auth_credentials() -> tuple[str | None, str | None, str | None]:
    """
    Return (username, password, notice).
    In production mode without secrets, returns (None, None, error_message).
    """
    secrets_data = load_secrets_toml()
    auth_data = secrets_data.get("auth", {})
    if not isinstance(auth_data, dict):
        auth_data = {}

    username = str(auth_data.get("username", "")).strip()
    password = str(auth_data.get("password", "")).strip()

    if username and password:
        return username, password, None

    if is_auth_secrets_required():
        return (
            None,
            None,
            "Auth secrets are required in production mode. Set [auth] username/password in .streamlit/secrets.toml.",
        )

    dev_user = os.getenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    dev_pass = os.getenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", "admin")
    return (
        dev_user,
        dev_pass,
        "Development fallback auth is active because [auth] secrets are not set.",
    )


def _get_signing_key() -> bytes:
    """Derive HMAC signing key from configured password or ephemeral fallback."""
    _, valid_pass, _ = get_auth_credentials()
    seed = valid_pass if valid_pass else _FALLBACK_SIGNING_SECRET
    return hashlib.sha256(f"uk_expense_tracker_session:{seed}".encode("utf-8")).digest()


def create_session_token(username: str, max_age: int = SESSION_MAX_AGE_SECONDS) -> str:
    """Create an HMAC-SHA256 signed session token with expiration timestamp."""
    exp = int(time.time()) + max_age
    payload = f"{username}|{exp}"
    sig = hmac.new(_get_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"


def verify_session_token(token: str | None) -> str | None:
    """Verify signed session token and return username if valid and unexpired."""
    if not token:
        return None
    parts = token.split("|")
    if len(parts) != 3:
        return None
    username, exp_str, sig = parts
    try:
        exp = int(exp_str)
    except ValueError:
        return None
    if int(time.time()) > exp:
        return None

    payload = f"{username}|{exp_str}"
    expected_sig = hmac.new(_get_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None

    valid_user, _, _ = get_auth_credentials()
    if not valid_user or not secrets.compare_digest(username, valid_user):
        return None
    return username


def require_auth(request: Request) -> str:
    """FastAPI dependency that enforces a valid session cookie."""
    token = request.cookies.get(COOKIE_NAME)
    user = verify_session_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user

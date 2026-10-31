"""Security regression tests: SPA path traversal, docs exposure, and login hardening."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, main

DUMMY_CRED = "secret123"  # pragma: allowlist secret
WRONG_CRED = "wrong123"  # pragma: allowlist secret


@pytest.fixture()
def auth_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """Isolated data dir, dev fallback auth, and a clean login throttle."""
    monkeypatch.setenv("EXPENSE_TRACKER_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    monkeypatch.setenv("EXPENSE_TRACKER_REQUIRE_AUTH_SECRETS", "false")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_USER", "admin")
    monkeypatch.setenv("EXPENSE_TRACKER_DEV_FALLBACK_PASS", DUMMY_CRED)
    monkeypatch.setenv("EXPENSE_TRACKER_SECRETS_FILE", str(tmp_path / "nonexistent_secrets.toml"))
    monkeypatch.delenv("EXPENSE_TRACKER_COOKIE_SECURE", raising=False)
    auth.reset_login_throttle()
    yield tmp_path
    auth.reset_login_throttle()


@pytest.fixture()
def spa_dist(tmp_path):
    """A fake frontend/dist with sensitive canary files placed outside it."""
    root = tmp_path / "site"
    dist = root / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("SPA-INDEX")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "robots.txt").write_text("User-agent: *")
    (root / "secret.txt").write_text("CANARY-SECRET")
    sibling = root / "dist-private"
    sibling.mkdir()
    (sibling / "s.txt").write_text("CANARY-SIBLING")
    (dist / "escape").symlink_to(root / "secret.txt")
    return dist


def _login(client: TestClient, password: str, **kwargs):
    return client.post(
        "/api/auth/login",
        json={"username": "admin", "password": password, "remember_me": True},
        **kwargs,
    )


# --- resolve_spa_file -------------------------------------------------------------


def test_resolve_spa_file_serves_files_inside_dist(spa_dist):
    assert main.resolve_spa_file(str(spa_dist), "assets/app.js") == str(
        (spa_dist / "assets" / "app.js").resolve()
    )
    assert main.resolve_spa_file(str(spa_dist), "index.html") == str(
        (spa_dist / "index.html").resolve()
    )


@pytest.mark.parametrize("requested", ["", "missing.js", "assets", "assets/"])
def test_resolve_spa_file_returns_none_for_missing_or_directories(spa_dist, requested):
    assert main.resolve_spa_file(str(spa_dist), requested) is None


@pytest.mark.parametrize(
    "requested",
    [
        "../secret.txt",
        "../../secret.txt",
        "assets/../../secret.txt",
        "../dist-private/s.txt",  # shares a string prefix with dist
        "escape",  # symlink inside dist that points outside
        "a\x00b",
    ],
)
def test_resolve_spa_file_rejects_escapes(spa_dist, requested):
    assert main.resolve_spa_file(str(spa_dist), requested) is None


def test_resolve_spa_file_rejects_absolute_paths(spa_dist):
    absolute = str((spa_dist.parent / "secret.txt").resolve())
    assert main.resolve_spa_file(str(spa_dist), absolute) is None


# --- serve_spa over HTTP ----------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "/..%2fsecret.txt",
        "/%2e%2e%2fsecret.txt",
        "/%2e%2e/secret.txt",
        "/..%2f..%2fsecret.txt",
        "/..%2fdist-private%2fs.txt",
        "/escape",
    ],
)
def test_serve_spa_never_leaks_files_outside_dist(auth_env, spa_dist, monkeypatch, url):
    monkeypatch.setattr(main, "FRONTEND_DIST", str(spa_dist))
    client = TestClient(main.app)
    resp = client.get(url)
    assert "CANARY" not in resp.text
    assert resp.status_code in (200, 404)


def test_serve_spa_absolute_path_does_not_leak(auth_env, spa_dist, monkeypatch):
    monkeypatch.setattr(main, "FRONTEND_DIST", str(spa_dist))
    absolute = str((spa_dist.parent / "secret.txt").resolve()).lstrip("/")
    resp = TestClient(main.app).get(f"/%2F{absolute}")
    assert "CANARY" not in resp.text


@pytest.mark.parametrize(
    "url",
    [
        "/assets/..%2f..%2fREADME.md",
        "/assets/%2e%2e/%2e%2e/README.md",
        "/assets/..%2f..%2f..%2f.streamlit%2fsecrets.toml.example",
    ],
)
def test_assets_route_never_leaks_repo_files(auth_env, spa_dist, monkeypatch, url):
    """Covers both the static /assets mount (when dist exists) and the SPA fallback."""
    monkeypatch.setattr(main, "FRONTEND_DIST", str(spa_dist))
    resp = TestClient(main.app).get(url)
    assert "Streamlit-based expense tracker" not in resp.text
    assert "[auth]" not in resp.text


def test_serve_spa_still_serves_index_and_assets(auth_env, spa_dist, monkeypatch):
    monkeypatch.setattr(main, "FRONTEND_DIST", str(spa_dist))
    client = TestClient(main.app)
    assert client.get("/").text == "SPA-INDEX"
    assert client.get("/dashboard/deep/link").text == "SPA-INDEX"
    assert client.get("/robots.txt").text == "User-agent: *"
    assert client.get("/api/does-not-exist").status_code == 404


# --- API docs ---------------------------------------------------------------------


def test_api_docs_disabled_in_production(monkeypatch):
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "production")
    kwargs = main.fastapi_docs_kwargs()
    assert kwargs == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    probe = TestClient(FastAPI(**kwargs))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert probe.get(path).status_code == 404


def test_api_docs_enabled_in_development(monkeypatch):
    monkeypatch.setenv("EXPENSE_TRACKER_ENV", "development")
    assert main.fastapi_docs_kwargs() == {}


# --- login hardening --------------------------------------------------------------


def test_non_ascii_credentials_get_401_not_500(auth_env):
    client = TestClient(main.app, raise_server_exceptions=False)
    resp = client.post(
        "/api/auth/login",
        json={
            "username": "admïn",
            "password": "päss",  # pragma: allowlist secret
            "remember_me": True,
        },
    )
    assert resp.status_code == 401


def test_non_ascii_session_token_is_rejected_without_error(auth_env):
    assert auth.verify_session_token("admin|9999999999|éé") is None
    assert auth.verify_session_token("admïn|9999999999|abcd") is None


def test_login_locks_out_after_repeated_failures(auth_env):
    client = TestClient(main.app)
    for _ in range(auth.MAX_FAILED_LOGINS):
        assert _login(client, WRONG_CRED).status_code == 401
    locked = _login(client, DUMMY_CRED)
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0


def test_successful_login_resets_failure_count(auth_env):
    client = TestClient(main.app)
    for _ in range(auth.MAX_FAILED_LOGINS - 1):
        assert _login(client, WRONG_CRED).status_code == 401
    assert _login(client, DUMMY_CRED).status_code == 200
    for _ in range(auth.MAX_FAILED_LOGINS - 1):
        assert _login(client, WRONG_CRED).status_code == 401


def test_lockout_expires(auth_env, monkeypatch):
    clock = {"now": 1000.0}
    monkeypatch.setattr(auth, "_now", lambda: clock["now"])
    client = TestClient(main.app)
    for _ in range(auth.MAX_FAILED_LOGINS):
        _login(client, WRONG_CRED)
    assert _login(client, DUMMY_CRED).status_code == 429
    clock["now"] += auth.LOCKOUT_SECONDS + 1
    assert _login(client, DUMMY_CRED).status_code == 200


# --- session cookie flags ---------------------------------------------------------


def test_cookie_not_secure_on_plain_http(auth_env):
    resp = _login(TestClient(main.app), DUMMY_CRED)
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" not in cookie.replace("httponly", "")


def test_cookie_secure_when_forwarded_proto_is_https(auth_env):
    resp = _login(TestClient(main.app), DUMMY_CRED, headers={"X-Forwarded-Proto": "https"})
    assert "; secure" in resp.headers["set-cookie"].lower()


def test_cookie_secure_when_env_flag_set(auth_env, monkeypatch):
    monkeypatch.setenv("EXPENSE_TRACKER_COOKIE_SECURE", "true")
    resp = _login(TestClient(main.app), DUMMY_CRED)
    assert "; secure" in resp.headers["set-cookie"].lower()

# Differential Security Review: security hotfix v0.8.2

**Date:** 2026-10-31
**Scope:** uncommitted changes on branch `fix/security-hotfix-0.8.2` against `main` at `b45fcf2`
**Strategy:** FOCUSED. Small diff in a small codebase, but it touches authentication and file serving, so it was treated as HIGH risk regardless of size.

# 1. Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 MEDIUM | 1 (conditional, becomes live at the Cloudflare phase) |
| 🟢 LOW | 3 |
| ℹ️ Pre-existing, outside this diff | 2 |

**Overall risk of the change:** LOW. It removes a CRITICAL vulnerability and adds no new attack surface.
**Recommendation:** APPROVE for a local commit. Push only after the NUC backup job is confirmed working and the owner says go (a push to `main` deploys).

**Key metrics**
- Files analysed: 4 of 4 changed source files and 1 of 1 new test file (100%).
- Security regressions detected: 0. No validation, authorisation or constant-time check was removed without a stronger replacement.
- Highest blast radius touched: `verify_session_token` (used by `require_auth`, which guards 28 endpoints). Its change is semantically identical for ASCII input and now also safe for non-ASCII.
- Test gaps: none open. All changed functions have direct tests (see section 4).

# 2. What Changed

**Base:** `b45fcf2` (main). **Head:** working tree. **Commits:** 0 yet.

| File | +Lines | -Lines | Risk | Blast radius |
|------|--------|--------|------|--------------|
| backend/main.py | ~55 | ~15 | HIGH (file serving, login) | HIGH (28 guarded endpoints depend on the login/cookie path) |
| backend/auth.py | ~64 | ~4 | HIGH (auth) | HIGH (`verify_session_token` is on every request) |
| backend/changelog.py, frontend/package.json | 13 / 1 | 1 / 1 | LOW | LOW |
| tests/test_security_hotfix.py (new) | ~190 | 0 | LOW | n/a |

Behavioural changes:
1. `serve_spa` can no longer return files outside `frontend/dist` (new `resolve_spa_file`: `realpath` plus `commonpath`, NUL and absolute-path rejection).
2. `/docs`, `/redoc` and `/openapi.json` are disabled when `EXPENSE_TRACKER_ENV=production`.
3. Login: constant-time comparison now works on bytes (no 500 on non-ASCII); 5 failures in 15 minutes lock a client out for 5 minutes (HTTP 429 with `Retry-After`).
4. Session cookie gets `Secure` when the request is HTTPS, `X-Forwarded-Proto: https`, or `EXPENSE_TRACKER_COOKIE_SECURE` is truthy.
5. The SPA fallback route is now always registered (previously only if `frontend/dist` existed at import time).

# 3. Findings

### 🟡 MEDIUM (conditional): lockout key is the socket peer address
**File:** backend/main.py (`auth_login`, `client_key = request.client.host`)
**Blast radius:** 1 endpoint. **Test coverage:** PARTIAL (lockout tested; proxy topology is not).

Today the NUC is reached directly over the LAN, so each device has its own key and the lockout is correct. Behind `cloudflared` (or any reverse proxy on the same host) every request arrives from the proxy's address, so all internet clients share one key.

**Attack scenario (after the Cloudflare phase, without Access):**
1. An unauthenticated attacker sends 5 wrong passwords.
2. The shared key is locked for 5 minutes and the owner's correct password returns 429.
3. The attacker repeats every 5 minutes: the owner cannot log in; existing sessions are unaffected.

This is a login denial of service, not a bypass. **Recommendation:** at the Cloudflare phase either (a) put Cloudflare Access in front, which blocks the attacker before this code runs, or (b) derive the key from `CF-Connecting-IP` only when the peer address is loopback. Not blocking for this release.

### 🟢 LOW: `EXPENSE_TRACKER_COOKIE_SECURE=true` breaks plain-http LAN login
Browsers will not store or return a Secure cookie over `http://`. If the variable is set while the phone still uses `http://<nuc>:8502`, login appears to succeed and then the next request is 401. Documented in the changelog; the plan only sets it once the HTTPS hostname works.

### 🟢 LOW: tracking table is cleared wholesale at 1,024 clients
`record_login_failure` clears all state when 1,024 distinct keys are tracked. An attacker would need 1,024 distinct peer addresses to wipe active lockouts, which the TCP handshake makes impractical from a single host. Accepted.

### 🟢 LOW: catch-all route is now always registered
A non-GET request to an unknown path returns 405 instead of 404 when `frontend/dist` is absent (for example in CI). No security effect; noted because behaviour changed.

### Pre-existing, outside this diff (recommended follow-up)
1. **Session signing key is an unsalted SHA-256 of the password, and tokens are stateless** ([auth.py `_get_signing_key`](../../../backend/auth.py)). Anyone who captures one cookie (the app is plain http on the LAN) can test password guesses offline, and logout does not revoke a token. Recommend a separate random session secret and a server-side revocation counter. Not changed here to keep the hotfix small and avoid logging the owner out unexpectedly.
2. **`/api/auth/status` is public** and returns the changelog, version and, in development mode, a notice that fallback credentials are active. Production mode requires real secrets, so the notice does not fire there. Low.

# 4. Test Coverage Analysis

**Coverage of changed code: 100% of changed functions have direct tests.**

| Function | Risk | Tests |
|----------|------|-------|
| `resolve_spa_file` | HIGH | 12 unit cases: inside-dist, missing, directory, `../`, nested `../`, sibling directory sharing a string prefix (`dist-private`), symlink escape, NUL byte, absolute path |
| `serve_spa` | HIGH | 8 HTTP cases including `%2e%2e`, `..%2f`, absolute path via `%2F`; index and deep-link fallback; unknown `/api/...` stays 404 |
| `/assets` mount and fallback | HIGH | 3 traversal cases (added during this review) |
| `fastapi_docs_kwargs` | MEDIUM | production disables `/docs`, `/redoc`, `/openapi.json`; development leaves them on |
| `auth_login` throttle | HIGH | lockout at 5, success resets, expiry after `LOCKOUT_SECONDS`, `Retry-After` header |
| `compare_text` / `verify_session_token` | HIGH | non-ASCII username, password and token signature give 401 or `None`, never 500 |
| cookie `Secure` flag | MEDIUM | plain http no, `X-Forwarded-Proto: https` yes, env flag yes |

**Live verification (not just unit tests):** `scratchpad/verify_findings.py` starts the real backend under uvicorn on a scratch tree with fake secrets. All 5 raw-path attacks that previously returned the secrets file and CSV now return the app front page with nothing leaked. The `/assets` mount was separately confirmed to return 404 for traversal URLs.

**Pre-existing tests:** 57 existing tests still pass unchanged, including every flow that logs in (16 login call sites across 2 test files). Suite total after this change: 90 passed (57 existing + 33 new).

# 5. Blast Radius Analysis

| Function | Non-test references | Risk | Priority |
|----------|---------------------|------|----------|
| `verify_session_token` | 3 direct (via `require_auth`: 28 guarded endpoints) | HIGH | P0, covered |
| `require_auth` | 32 | HIGH | P0, behaviour unchanged for valid and invalid ASCII tokens |
| `auth_login` | 1 route, called by the SPA login screen and 16 test call sites | HIGH | P0, covered |
| `serve_spa` / `resolve_spa_file` | 1 route (catch-all) | HIGH | P0, covered |

# 6. Historical Context

- The vulnerable `serve_spa` and the `compare_digest` login lines both come from commit `a5ef119` ("modern React + FastAPI side-by-side app on port 8502", 2026-10-11). **The traversal has existed since 11 Oct 2026 (20 days).** Nothing in the history shows it was ever reviewed for traversal.
- No security-related code is removed: the only deleted lines are the two `secrets.compare_digest` calls, replaced by an equivalent byte-safe constant-time comparison, and the unsafe `os.path.join` lookup.
- No regression pattern: the removed code was never a fix for an earlier issue.
- **Exposure window matters for key rotation:** if port 8502 was reachable beyond the home LAN at any point since 11 Oct, treat `secrets.toml` (login password, Google service-account key) as exposed and rotate it. On a LAN-only network, rotation is not required.

# 7. Recommendations

### Immediate
- [x] Commit this change on its own branch.
- [ ] Before pushing: confirm the NUC nightly backup runs and take a fresh backup (done once on 2026-10-31 07:06; repeat on the day of deploy).

### Before the Cloudflare phase
- [ ] Decide the throttle key strategy (finding MEDIUM) or rely on Cloudflare Access.
- [ ] Only then set `EXPENSE_TRACKER_COOKIE_SECURE=true` and bind the port to localhost.

### Technical debt
- [ ] Separate random session secret plus revocation (pre-existing item 1).
- [ ] Decide whether `/api/auth/status` should hide the changelog until login.

# 8. Analysis Methodology

**Strategy:** FOCUSED. **Files reviewed:** 5 of 5 changed (100%).
**Techniques:** git blame and `-S` history on every removed line; blast-radius counts by grep; test-gap check per changed function; attacker modelling of the file-serving path, login path and cookie handling; live exploit replay on a real server before and after.
**Limitations:**
- Reviewed the working tree; there is no commit hash yet.
- Behaviour behind Cloudflare or another proxy was reasoned about, not tested.
- Did not review the rest of the API for authorisation gaps (out of scope for a diff review); all non-auth routes already sit behind `require_auth`.
- Python 3.14 locally versus 3.11 in the container; no version-specific behaviour is used.
**Confidence:** HIGH for the analysed scope, MEDIUM for deployment topologies not yet in place.

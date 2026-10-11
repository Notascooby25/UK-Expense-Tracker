# App Version Footer & Interactive Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subtle version footer (`v0.6.0 — View Changelog`) at the bottom of the app that opens a clean Changelog modal backfilled with the full development history of the UK Expense Tracker (`v0.1.0` to `v0.6.0`), and update `GEMINI.md` so NUC deployment commands pull `uk-expense-tracker-web:latest` and require bumping the version & changelog on every release.

**Architecture:**
- Centralize `APP_VERSION = "0.6.0"` and the backfilled `CHANGELOG` list in `backend/changelog.py` and return them from `/api/auth/status` and `/api/bootstrap` in `backend/main.py`.
- Create `frontend/src/components/AppFooter.tsx` to display the footer bar and interactive Changelog modal, rendered at the bottom of `frontend/src/App.tsx` (including on the login screen).
- Update `GEMINI.md` with the corrected `uk-expense-tracker-web:latest` Docker pull snippet and version/changelog bump rule.

**Tech Stack:** Python 3.12, FastAPI, Pytest, React 18, TypeScript, Tailwind CSS, Vite.

---

### Task 1: Backend Version & Backfilled Changelog (`backend/changelog.py` & `backend/main.py`)

**Files:**
- Create: `backend/changelog.py`
- Modify: `backend/main.py`
- Modify: `tests/test_backend_api.py`

- [ ] **Step 1: Write failing backend test in `tests/test_backend_api.py`**
  Add `test_version_and_changelog_exposed_in_auth_and_bootstrap(client)` verifying that `/api/auth/status` and `/api/bootstrap` return `version == "0.6.0"` and a `changelog` list of 6 releases from `"0.6.0"` down to `"0.1.0"`.

- [ ] **Step 2: Run `./venv/bin/pytest tests/test_backend_api.py -k test_version_and_changelog`**
  Confirm the test fails before implementation.

- [ ] **Step 3: Create `backend/changelog.py` and wire into `backend/main.py`**
  - Define `APP_VERSION = "0.6.0"` and `CHANGELOG` (`0.6.0`, `0.5.0`, `0.4.0`, `0.3.0`, `0.2.0`, `0.1.0`) in `backend/changelog.py`.
  - Import `APP_VERSION` and `CHANGELOG` in `backend/main.py` and include `"changelog": CHANGELOG` in `/api/auth/status` and `/api/bootstrap`.

- [ ] **Step 4: Re-run `./venv/bin/pytest tests/test_backend_api.py`**
  Confirm all backend tests pass.

---

### Task 2: Frontend Footer & Changelog Modal (`AppFooter.tsx`, `App.tsx`, `types.ts`, `api.ts`)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/components/AppFooter.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update TypeScript types (`frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/package.json`)**
  - Add `ChangelogEntry` interface (`version`, `date`, `title`, `changes`) to `frontend/src/types.ts` and add `changelog: ChangelogEntry[]` to `BootstrapPayload`.
  - Add `changelog: ChangelogEntry[]` to `api.getAuthStatus()` in `frontend/src/api.ts`.
  - Bump `"version"` in `frontend/package.json` to `"0.6.0"`.

- [ ] **Step 2: Create `frontend/src/components/AppFooter.tsx`**
  - Render a subtle footer bar with app branding on the left and a clickable `v{version} — View Changelog` button on the right.
  - Render an accessible Changelog modal when clicked, showing each version (`v0.6.0` down to `v0.1.0`), release date, milestone title, `"Current Release"` badge on the latest version, and bulleted changes.

- [ ] **Step 3: Render `AppFooter` in `frontend/src/App.tsx`**
  - Track `appVersion` and `changelog` from `api.getAuthStatus()` (and update from `bootstrapData` when loaded) so `AppFooter` works both on the login screen and across all authenticated pages.

- [ ] **Step 4: Build frontend and run Impeccable detector**
  - Run `npm --prefix frontend run build` and verify zero TypeScript/Vite errors.
  - Run `npx impeccable detect --json` on modified frontend files.

---

### Task 3: Update Deployment & Versioning Instructions (`GEMINI.md`)

**Files:**
- Modify: `GEMINI.md`

- [ ] **Step 1: Update `GEMINI.md`**
  - Update the NUC SSH snippet to pull `ghcr.io/notascooby25/uk-expense-tracker-web:latest` (and `uk-expense-tracker:latest`).
  - Add instruction requiring every user-facing code change to bump `APP_VERSION` and add a new entry to `CHANGELOG` in `backend/changelog.py` (and `frontend/package.json`).

- [ ] **Step 2: Run full verification suite and differential review**
  - Run `./venv/bin/ruff check .`, `./venv/bin/ruff format .`, `./venv/bin/pytest`, `./venv/bin/pre-commit run --all-files`.
  - Run `differential-review` skill and present results before committing and pushing.

# App Logo, Favicon & PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the selected Option B ("Sterling Growth": rising analytics bars with British Pound £ badge on vibrant red background) as the official app logo across favicon, PWA install icons, web app manifest, and in-app navigation headers.

**Architecture:**
1. Generate pixel-perfect SVG and PNG assets (favicon.svg, favicon.ico, pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png) in `frontend/public/`.
2. Configure `frontend/public/manifest.webmanifest` and update `frontend/index.html` with standard PWA tags, favicon links, and mobile viewport theme colors.
3. Create a reusable React `<BrandLogo />` component in `frontend/src/components/BrandLogo.tsx` rendering Option B with high visual fidelity.
4. Replace existing icon placements in `TopNav.tsx` and `LoginScreen.tsx` with `<BrandLogo />`.
5. Bump version to 0.6.3 in `backend/changelog.py` and `frontend/package.json`.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Python Pillow (for asset generation), FastAPI.

**Spec:** Option B ("Sterling Growth") approved in chat: vibrant red gradient squircle background (`#e74c3c` / crimson), crisp white rising analytics bars, upward trend accent, and British Pound (`£`) badge.

## Global Constraints
- Assets must be placed in `frontend/public/` so Vite copies them cleanly to `frontend/dist/` for production serving.
- Favicon and PWA icons must remain crisp down to 16×16 px and sharp up to 512×512 px.
- All Python code checks (`ruff`, `pytest`) and frontend builds (`tsc -b && vite build`) must pass without errors.
- Version bump in `backend/changelog.py` and `frontend/package.json` must stay synchronized.

## Review Focus
- Browser tab favicon displays correctly in both light and dark browser Chrome.
- PWA manifest validates with valid MIME types and dimensions (192×192 and 512×512 with `purpose: "any maskable"`).
- Apple Touch Icon renders without transparent edge artifacts on iOS home screens.
- In-app TopNav brand logo aligns cleanly with the "UK Expense Tracker" title across mobile and desktop breakpoints.
- Production static asset routing in FastAPI serves `/favicon.ico` and `/manifest.webmanifest` without 404s.

---

### Task 1: Generate Visual Logo Assets and PWA Manifest

**Files:**
- Create: `frontend/public/favicon.svg`
- Create: `frontend/public/favicon.ico`
- Create: `frontend/public/favicon-32x32.png`
- Create: `frontend/public/favicon-16x16.png`
- Create: `frontend/public/apple-touch-icon.png`
- Create: `frontend/public/pwa-192x192.png`
- Create: `frontend/public/pwa-512x512.png`
- Create: `frontend/public/manifest.webmanifest`

**Interfaces:**
- Consumes: Option B SVG design specification.
- Produces: Static web assets ready for Vite build and browser loading.

- [ ] **Step 1: Write asset generation script and produce PNG/ICO files**
  Use Python Pillow in `scratch/generate_icons.py` to render high-resolution 512x512, 192x192, 180x180, 32x32, 16x16 PNGs and composite multi-size `favicon.ico`.

- [ ] **Step 2: Create `frontend/public/favicon.svg`**
  Write scalable vector graphic for high-DPI modern browser tab favicons with Option B geometry.

- [ ] **Step 3: Create `frontend/public/manifest.webmanifest`**
  Add JSON configuration:
  - `name`: "UK Expense Tracker"
  - `short_name`: "UK Expenses"
  - `start_url`: "/"
  - `display`: "standalone"
  - `background_color`: "#121a21"
  - `theme_color`: "#e74c3c"
  - `icons`: 192x192 and 512x512 entries with `purpose: "any maskable"`.

- [ ] **Step 4: Verify asset existence and dimensions**
  Verify with `ls -la frontend/public/` and PIL inspection to ensure proper bit depths and dimensions.

---

### Task 2: Configure HTML Header and PWA Meta Tags

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: Assets generated in Task 1.
- Produces: Fully wired HTML head for desktop browser tabs, mobile bookmarks, and PWA install prompt.

- [ ] **Step 1: Update `frontend/index.html`**
  Add link tags:
  - `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
  - `<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />`
  - `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`
  - `<link rel="manifest" href="/manifest.webmanifest" />`
  - `<meta name="theme-color" content="#e74c3c" />`
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-title" content="UK Expenses" />`

- [ ] **Step 2: Test frontend build**
  Run: `npm --prefix frontend run build`
  Expected: Clean build with all public assets copied to `frontend/dist/`.

---

### Task 3: Implement Reusable BrandLogo Component and Update UI

**Files:**
- Create: `frontend/src/components/BrandLogo.tsx`
- Modify: `frontend/src/components/TopNav.tsx`
- Modify: `frontend/src/components/LoginScreen.tsx`

**Interfaces:**
- Consumes: Option B SVG design.
- Produces: `<BrandLogo className="..." size={...} />` component.

- [ ] **Step 1: Create `frontend/src/components/BrandLogo.tsx`**
  Build clean component rendering the Option B red squircle with rising chart bars, dotted trendline, and British Pound (£) badge.

- [ ] **Step 2: Replace icon in `frontend/src/components/TopNav.tsx`**
  Replace `<Wallet className="w-4 h-4" />` with `<BrandLogo size="sm" />`.

- [ ] **Step 3: Update `frontend/src/components/LoginScreen.tsx`**
  Replace login modal icon with `<BrandLogo size="md" />` for unified branding.

- [ ] **Step 4: Verify frontend TypeScript and build**
  Run: `npm --prefix frontend run build`
  Expected: PASS without compile warnings or errors.

---

### Task 4: Version Bump, Verification, and Pre-Commit Checks

**Files:**
- Modify: `backend/changelog.py`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: Changes from Tasks 1-3.
- Produces: Synchronized release 0.6.3 entry.

- [ ] **Step 1: Bump version and update changelog**
  Set `APP_VERSION = "0.6.3"` in `backend/changelog.py` and add changelog entry for v0.6.3 detailing the new Sterling Growth logo, favicon, and PWA install support. Update `frontend/package.json` version to `"0.6.3"`.

- [ ] **Step 2: Run test suite and linters**
  Run `./venv/bin/ruff check .`
  Run `./venv/bin/pytest`
  Run `npm --prefix frontend run build`
  Run `./venv/bin/pre-commit run --all-files`

- [ ] **Step 3: Run differential-review skill**
  Execute differential review for security, blast radius, and regressions.

- [ ] **Step 4: Git commit and push**
  Commit with descriptive commit message and push to `origin/main` to trigger the Docker build workflow.

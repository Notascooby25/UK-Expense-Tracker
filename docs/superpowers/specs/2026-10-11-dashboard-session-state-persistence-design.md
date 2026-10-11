# Dashboard Session Filter Persistence Design

**Date:** 2026-10-11
**Status:** Draft for User Review

## 1. Root Cause Analysis
Currently, `App.tsx` conditionally renders `<DashboardPage />` only when `activePage === 'dashboard'`. Inside `DashboardPage.tsx`, all filter states (`timeMode`, `selectedPeriod`, `selectedMonths`, `bank`, `hideInternal`, `netSpendMode`, `ignoreLegacy`, `excludeExceptional`, `includeCategories`, `excludeCategories`, and `inspectCategory`) are initialized with `useState(...)` using the current calendar year and current month (`October 2026`).

When the user navigates away from the Dashboard (for example, clicking **Open in Transactions Editor** after inspecting July 2026) and then returns to the Dashboard, React unmounts and remounts `DashboardPage`, resetting every `useState` hook back to the default current month.

## 2. Goals
1. **Default to Current Month on First Load:** When opening the app in a new browser session, the Dashboard still defaults to the current calendar year and current month (`Calendar Year`, `currentYear`, `[currentMonthName]`).
2. **Remember Dashboard State Across the Session:** Once the user changes any filter on the Dashboard (such as selecting `July 2026`, changing Financial Year, toggling Net Spend, or inspecting a category), that state persists in `sessionStorage` (keyed by account scope: `uk_expense_dashboard_state_Personal` / `uk_expense_dashboard_state_Joint`) for the duration of the browser session.
3. **Preserve Reset Button Behavior:** Clicking **Reset Filters** on the Dashboard resets the filters back to the current month default and updates `sessionStorage`.

## 3. Architecture & Data Flow
- Define a `DashboardSessionState` interface in `frontend/src/pages/DashboardPage.tsx` (or `frontend/src/types.ts`):
  ```ts
  interface DashboardSessionState {
    timeMode: 'Financial Year' | 'Calendar Year' | 'Rolling Period';
    selectedPeriod: string;
    bank: string;
    hideInternal: boolean;
    netSpendMode: boolean;
    ignoreLegacy: boolean;
    excludeExceptional: boolean;
    selectedMonths: string[];
    includeCategories: string[];
    excludeCategories: string[];
    inspectCategory: string | null;
  }
  ```
- Load initial state on mount from `sessionStorage.getItem('uk_expense_dashboard_state_' + scope)` with safe JSON parsing and fallback to the default current-month state.
- Save updates to `sessionStorage` inside a `useEffect` whenever any filter or `inspectCategory` changes.
- Pass `key={scope}` to `<DashboardPage key={scope} ... />` in `frontend/src/App.tsx` so switching between `Personal` and `Joint` scopes cleanly loads each scope's own session state.
- Bump `APP_VERSION` to `"0.6.1"` in `backend/changelog.py` and `frontend/package.json` and prepend a `0.6.1` release entry to `CHANGELOG`.

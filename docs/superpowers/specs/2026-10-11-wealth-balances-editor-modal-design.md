# Wealth Balances & Accounts Editor Modal Design

**Date:** 2026-10-11
**Status:** Draft for User Review

## 1. Problem Statement
On the **Wealth & Net Worth** page (`WealthPage.tsx`), the **Monthly Balance Logger** only lets the user pick one `YYYY-MM` month at a time and overwrite positive numbers. There is currently:
- No scrollable view showing all recorded months and their saved balances in one place.
- No way to delete an entire month snapshot if a month was entered by mistake (even clearing all inputs leaves an empty `{}` entry in `assets.json`, creating a `£0.00` drop on the Net Worth chart).
- No way to delete or rename an account/asset once added.

## 2. Goals
1. **Add an "Edit / Manage History" Button & Popup Modal (`WealthPage.tsx`):**
   - Place a clear **Edit History** button in the **Monthly Balance Logger** header.
   - Clicking it opens a scrollable popup modal with two clear sections:
     - **Recorded Monthly Snapshots:** Lists every recorded month (`YYYY-MM`, newest first) with editable balance inputs for each account, a button to remove an individual account from that month, a **Save Month** button, and a **Delete Month** button to completely remove a mistaken month entry.
     - **Manage Accounts:** Lists all tracked account names with a **Delete Account** button (removes that account across all recorded months) and inline **Rename Account** option.
2. **Add Quick Remove Icon in the Main Logger (`WealthPage.tsx`):**
   - Next to each account input in the Monthly Balance Logger card, add a subtle clear/delete button so an unwanted account row can also be removed directly before saving.
3. **Backend API Support (`backend/main.py`):**
   - Update `POST /api/wealth/balances` so that if `balances` is empty (`{}`), the month key is removed from `assets_data` rather than storing an empty `{}` dict that plots as `£0` net worth.
   - Add `DELETE /api/wealth/balances/{month}` to delete an entire month snapshot.
   - Add `DELETE /api/wealth/accounts` (or `POST /api/wealth/accounts/manage`) to delete or rename an account key across all months in `assets_data`.
4. **Version Bump (`v0.6.2`):**
   - Bump `APP_VERSION` to `"0.6.2"` in `backend/changelog.py` and `frontend/package.json` and prepend a `0.6.2` entry to `CHANGELOG`.

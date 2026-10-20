"""Application version and chronological release changelog for UK Expense Tracker."""

from __future__ import annotations

from typing import Any

APP_VERSION = "0.7.0"

CHANGELOG: list[dict[str, Any]] = [
    {
        "version": "0.7.0",
        "date": "20 Oct 2026",
        "title": "Mortgage Tracker, Overpayment Simulator & App Rebrand",
        "changes": [
            "Rebranded the application to UK Finance Tracker to reflect a complete personal finance suite covering expenses, wealth, and mortgages.",
            "Added a dedicated Mortgage tab in top navigation with support for separate Personal and Joint mortgage profiles.",
            "Added saved mortgage profile storage recording balance, interest rate, monthly payment, remaining term, and fixed-rate deal expiry countdown.",
            "Implemented an interactive Overpayment Impact Calculator and Simulator with instant recalculation of years shaved off and interest saved.",
            "Added an interactive Payoff Trajectory comparison graph (Recharts) visualizing standard vs accelerated mortgage payoff curves.",
            "Added a standalone Overpayment History log to track extra payments without altering day-to-day split expense databases.",
            "Added UK 10% annual penalty-free overpayment allowance helper with real-time tracking of current year overpayments.",
        ],
    },
    {
        "version": "0.6.6",
        "date": "19 Oct 2026",
        "title": "Loan & Debt Tracking in Wealth & Net Worth",
        "changes": [
            "Added dedicated Loan & Liability tracking to the Wealth tab, ensuring debts (such as Monzo personal loans) accurately offset assets for a true Total Net Worth.",
            "Added a highlighted Outstanding Loan KPI summary box showing total debt, initial principal, repaid amount, and repayment percentage progress.",
            "Enhanced the Wealth Balance Logger with side-by-side Asset and Loan entry sections and quick-add support for loan/debt accounts.",
            "Updated the Edit History & Account Management modal with a dedicated 'Loans & Liabilities' tab to rename, delete, or inspect loan snapshots independently from assets.",
            "Integrated loan liabilities into the Net Worth progression chart timeline with forward-filled balances across snapshots.",
        ],
    },
    {
        "version": "0.6.5",
        "date": "18 Oct 2026",
        "title": "Exact Day-Level Wealth & Account Balance Tracking",
        "changes": [
            "Upgraded the Wealth Balance Logger from month-only entry to specific date selection (DD/MM/YYYY) with a quick 'Set Today' shortcut.",
            "Enabled recording multiple balance snapshots within the same month (e.g. 30 Oct and 04 Nov) to track precise account balance changes across short intervals.",
            "Updated Net Worth progression and asset breakdown charts to display clean, human-readable UK dates on chart axes and inspection tooltips.",
            "Enhanced the Edit History modal to manage and delete specific date snapshots while keeping full backward compatibility with older monthly records.",
        ],
    },
    {
        "version": "0.6.4",
        "date": "12 Oct 2026",
        "title": "Category Conflict Protection on Monzo Sync & Imports",
        "changes": [
            "Protected manual category changes made in the app from being overwritten during Monzo Google Sheet sync or CSV imports.",
            "Added automatic category conflict detection that highlights whenever an incoming transaction has a different category from the app.",
            "Introduced an interactive Category Differences Review section in the sync modal with per-transaction 'Keep Mine' / 'Use Monzo' actions and one-click bulk 'Keep All in App' / 'Update All to Monzo' buttons.",
            "Kept user app categories safe by default if the sync window is closed without resolving differences.",
        ],
    },
    {
        "version": "0.6.3",
        "date": "11 Oct 2026",
        "title": "Sterling Growth Logo, Favicon & PWA Install Support",
        "changes": [
            "Introduced new 'Sterling Growth' brand identity featuring rising analytics bars and a British Pound (£) badge on a vibrant red background.",
            "Integrated custom favicon across SVG, ICO, and high-DPI PNG formats.",
            "Added Progressive Web App (PWA) manifest and Apple Touch icons for installing the app to mobile and desktop home screens.",
            "Updated in-app header navigation and login screens with the new unified brand logo.",
        ],
    },
    {
        "version": "0.6.2",
        "date": "11 Oct 2026",
        "title": "Wealth History Editor & Account Management Modal",
        "changes": [
            "Added an 'Edit History' button and scrollable popup modal on the Wealth & Net Worth page to edit or delete any recorded monthly balance snapshot.",
            "Added account management tools to rename mistyped accounts or delete unwanted accounts across all recorded months.",
            "Automatically clean up empty month entries when all balances for a month are cleared.",
        ],
    },
    {
        "version": "0.6.1",
        "date": "11 Oct 2026",
        "title": "Dashboard Session Filter Memory",
        "changes": [
            "Preserved Dashboard time period, month selection, toggles, and open Category Inspector state across tab switches during the active session while still defaulting to the current month on initial app load.",
        ],
    },
    {
        "version": "0.6.0",
        "date": "11 Oct 2026",
        "title": "Version Footer, Changelog & Category Inspector Handoff",
        "changes": [
            "Added app version footer (v0.6.0 — View Changelog) and interactive Changelog modal to verify live deployments at a glance.",
            "Added inline Category dropdown editing directly inside the Dashboard's Category Inspector transactions table with automatic refresh.",
            "Updated 'Open in Transactions Editor' to carry over the active Dashboard time period (Date From / Date To, Financial Year, or selected Months) and Bank filter alongside the Category.",
            "Added Exceptional / One-Off Spend category tagging in Settings and a Dashboard callout banner to exclude large one-off costs from monthly run-rate averages.",
            "Made Savings & Investments categories clickable for Category Inspector drilldown and added Income/Expense indicator dots.",
        ],
    },
    {
        "version": "0.5.0",
        "date": "11 Oct 2026",
        "title": "Modern React + FastAPI Web Application",
        "changes": [
            "Launched the full React + TypeScript + FastAPI web application (uk-expense-tracker-web on port 8502) alongside the legacy Streamlit container.",
            "Defaulted the Dashboard time period to Current Month and added an interactive month-pill filter toolbar.",
            "Added Shift-click multi-row range selection in the Transactions Editor table.",
            "Configured native linux/amd64 Docker builds in GitHub Actions for fast deployments on the Intel NUC.",
        ],
    },
    {
        "version": "0.4.0",
        "date": "10 Oct 2026",
        "title": "Subscriptions Intelligence & Design System Overhaul",
        "changes": [
            "Replaced category-based subscription tracking with a dedicated Is_Subscription flag, smart keyword dictionary, bulk mark actions, and one-click database subscription scanning.",
            "Applied the Impeccable high-contrast slate & coral design system across the application.",
            "Added a responsive Desktop Grid vs. Mobile Tabs view toggle for the Dashboard 4-column Cash Flow breakdown.",
            "Introduced automated Ruff linting, Pytest integration testing, and pre-commit secret detection.",
        ],
    },
    {
        "version": "0.3.0",
        "date": "6–9 Oct 2026",
        "title": "Wealth Tracker, Smart Insights & Category Drilldown",
        "changes": [
            "Introduced the Wealth / Assets Tracker, What-If Calculator, Smart Insights, and 4-Column Cash Flow Breakdown (Income, Committed Bills, Variable Spend, Savings).",
            "Added Category Drilldown with merchant summaries (last transaction date, transaction count) and individual transaction notes.",
            "Added max_amount threshold support to auto-categorisation rules and a button to retrospectively apply rules to existing transactions.",
            "Added bulk row deletion and direct table editing even while filters are active.",
        ],
    },
    {
        "version": "0.2.0",
        "date": "5 Jun – 28 Sep 2026",
        "title": "Personal/Joint Account Scopes & Auto-Categorisation Engine",
        "changes": [
            "Added isolated Personal and Joint account scopes with separate transaction databases, settings, and automated daily self-checking backups.",
            "Built the Auto-Categorisation Rules Engine with priority ordering, live rule test preview, rule editing, and notes filtering.",
            "Optimised mobile layouts and added persistent multi-week login sessions.",
        ],
    },
    {
        "version": "0.1.0",
        "date": "30 Apr – 2 May 2026",
        "title": "Initial Release & Intel NUC Docker Architecture",
        "changes": [
            "Initial release of the UK Expense Tracker with UK Financial Year (YYYY/YY) calculations, multi-bank CSV/TSV import, and Google Sheets Monzo sync.",
            "Set up automated GitHub Container Registry (ghcr.io) image builds and Watchtower deployment for the Intel NUC.",
        ],
    },
]

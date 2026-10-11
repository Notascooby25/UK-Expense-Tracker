"""Application version and chronological release changelog for UK Expense Tracker."""

from __future__ import annotations

from typing import Any

APP_VERSION = "0.6.3"

CHANGELOG: list[dict[str, Any]] = [
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

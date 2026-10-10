# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Python, Streamlit, Pandas, Plotly (Local CSV flat-file architecture)

## Users

Andy (Single-user instance. Although a joint account is technically supported, the app is built exclusively for his personal, day-to-day workflow).

## Product Purpose

A fast, private, locally-hosted personal finance and expense tracking hub. It allows the user to sync bank transactions, intelligently categorize income vs. expenses, manage internal wealth movements, and view analytics without relying on a third-party SaaS backend.

## Operating Context

- The app is deployed locally on a NUC via Docker and Watchtower.
- Frequent usage occurs on a mobile phone (necessitating responsive sidebar navigation and collapsible filters).
- Data is stored in a local `.csv` file. Edits must be explicitly saved to disk via the UI to persist.

## Capabilities and Constraints

- **Capabilities:** Auto-suggest category dropdowns, bulk data editing, rolling period dashboards, intelligent committed vs. variable spend tracking.
- **Constraints:** Must operate entirely in-memory (`st.session_state`) during user sessions to prevent accidental data wipes before saving. Cannot use horizontal tabs (`st.tabs`) due to mobile constraints.

## Evidence on Hand

- A robust, monolithic `app.py` Streamlit frontend.
- Existing `expense_database.csv` format and category mappings.

## Product Principles

1. **Mobile-First UX:** Navigation and daily data-entry workflows must be frictionless on a small screen.
2. **Local Control:** Data lives in flat files on the user's hardware. No external databases.
3. **Explicit Persistence:** Changes are staged in-memory and require explicit user consent to write to disk.

# AI Agent Instructions

- **Coding Standard and Style**: This project uses Python and the Streamlit framework. Follow the **PEP 8** style guide for Python code.
- **Linters and Tests**: There are currently no automated linters or Python tests set up. Because of this, after every change, you must run the app, manually verify the changes, and explicitly describe what you checked in your response.
- **Secrets Handling**: Passwords, API keys, and credentials must never be committed to version control. Use environment variables or place them in `.streamlit/secrets.toml` (which is git-ignored). 
- **Security Risks**: This is a personal finance tracker handling sensitive financial data. 
  - *Data Corruption*: Prevent errors that could overwrite or corrupt the local CSV database.
  - *Unauthorized Access*: Do not bypass or weaken Streamlit authentication checks.
  - *XSS (Cross-Site Scripting)*: Validate and sanitize any user-provided transaction data before displaying it.
- **Review Requirement**: You must run the `differential-review` skill before any changes are committed.
- **Do Not Edit**: Never manually edit `.git/`, `venv/`, `__pycache__/`, or the local runtime data files in `data/` (like `expense_database.csv`, `settings.json`, and `saved_filters.json`).

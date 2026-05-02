#!/usr/bin/env bash
set -euo pipefail

WATCH_DIR="${1:-.}"
REMOTE="${2:-$(git remote | head -n 1)}"
BRANCH="${3:-$(git branch --show-current)}"

# Default: safer on laptops. Set AUTO_PUSH=1 to re-enable automatic push.
AUTO_PUSH="${AUTO_PUSH:-0}"
DEBOUNCE_SECONDS="${DEBOUNCE_SECONDS:-15}"

[[ -z "${REMOTE}" ]] && REMOTE="origin"
[[ -z "${BRANCH}" ]] && BRANCH="main"

export GIT_EDITOR="code --wait"

# Keep auto-commit focused on source/config files; never stage personal data.
TRACKED_PATHS=(
    "app.py"
    "requirements.txt"
    "Dockerfile"
    "docker-compose.yml"
    "scripts"
    ".streamlit/config.toml"
    ".streamlit/secrets.toml.example"
    ".github"
    "expense_database.example.csv"
    "settings.example.json"
    "saved_filters.example.json"
    ".gitignore"
    ".dockerignore"
    "README.md"
)

EXCLUDE_REGEX='(\.git|\.venv|__pycache__|\.history|\.cutover_snapshot_|data/|expense_database[^.]*\.csv$|settings\.json$|saved_filters\.json$|\.streamlit/secrets\.toml$)'

commit_with_prompt() {
    if [[ -n "${VSCODE_IPC_HOOK_CLI:-}" || -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; then
        git -c core.editor="code --wait" commit
        return $?
    fi
    if [[ -t 0 ]]; then
        local msg
        read -r -p "Commit message: " msg
        [[ -z "${msg}" ]] && echo "Skipping commit: empty message." && return 1
        git commit -m "${msg}"
        return $?
    fi
    echo "Cannot prompt for commit message: no GUI or interactive terminal."
    return 1
}

stage_tracked_paths() {
    git add -A -- "${TRACKED_PATHS[@]}" 2>/dev/null || true
}

echo "Watching ${WATCH_DIR} (branch: ${BRANCH}, remote: ${REMOTE})"
echo "Auto-push: ${AUTO_PUSH}. Debounce: ${DEBOUNCE_SECONDS}s"

while true; do
    inotifywait -r -e modify,create,delete,move \
        --exclude "${EXCLUDE_REGEX}" \
        "${WATCH_DIR}" 2>/dev/null || sleep "${DEBOUNCE_SECONDS}"

    sleep "${DEBOUNCE_SECONDS}"

    stage_tracked_paths

    if git diff --cached --quiet; then
        echo "No staged changes."
        continue
    fi

    git diff --cached --stat

    if commit_with_prompt; then
        if [[ "${AUTO_PUSH}" == "1" ]]; then
            git push "${REMOTE}" "${BRANCH}"
        fi
    fi
done

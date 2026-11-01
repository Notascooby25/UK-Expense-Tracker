#!/usr/bin/env bash
# Run a private copy of this branch on the owner's PC, with a copy of live data.
#
#   scripts/preview.sh up            build, copy live data if needed, print the link
#   scripts/preview.sh up --phone    the same, and open it to your home Wi-Fi as well
#   scripts/preview.sh down          stop it and delete its data copy
#   scripts/preview.sh status        show what's running
#   scripts/preview.sh refresh-data  start again from a fresh copy of live data
#
# Server details live in ~/.config/safe-change/preview.env, never in this repo:
#   PREVIEW_PROD_HOST, PREVIEW_PROD_USER, PREVIEW_LAN_ADDRESS (optional)
# The live server is only ever asked to send a copy of its data folder. That goes
# through the app container, because the files are private to the container's user.
set -euo pipefail

PROJECT=expense-tracker-preview
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PREVIEWS_ROOT="$HOME/.local/share/safe-change/previews"
export PREVIEW_DATA_DIR=${PREVIEW_DATA_DIR:-$PREVIEWS_ROOT/expense-tracker}
DATA_DIR=$PREVIEW_DATA_DIR
SETTINGS="$HOME/.config/safe-change/preview.env"
SECRETS="$DATA_DIR/secrets.toml"
PROD_CONTAINER=${PREVIEW_EXPENSE_CONTAINER:-uk_expense_tracker_web}
PORT=18502

die() { echo "Preview stopped: $*" >&2; exit 1; }

check_safe_to_run() {
    case "${DOCKER_HOST:-}" in
        "" | unix://*) ;;
        *) die "DOCKER_HOST points at another machine. Previews only run on this PC." ;;
    esac
    case "$DATA_DIR" in
        *..*) die "the data folder path can't contain '..'." ;;
        "$PREVIEWS_ROOT"/*) ;;
        *) die "the data folder must be inside $PREVIEWS_ROOT." ;;
    esac
}

compose() {
    docker compose -p "$PROJECT" -f "$ROOT/docker-compose.preview.yml" "$@"
}

copy_live_data() {
    [ -d "$DATA_DIR/data" ] && return 0
    local partial="$DATA_DIR/data.tar.partial"
    echo "Copying live data (read-only)..."
    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$PREVIEW_PROD_USER@$PREVIEW_PROD_HOST" \
        "docker exec $PROD_CONTAINER tar -C /app -cf - data" > "$partial" 2>/dev/null \
        || ! listing=$(tar -tf "$partial" 2>/dev/null) \
        || ! grep -Eq '^data/.*\.csv$' <<< "$listing"; then
        rm -f "$partial"
        die "couldn't copy live data, so nothing was started. Check the server is reachable."
    fi
    tar -C "$DATA_DIR" -xf "$partial"
    rm -f "$partial"
}

write_secrets() {
    [ -f "$SECRETS" ] && return 0
    (
        umask 077
        python3 - > "$SECRETS" <<'PY'
import secrets
print("[auth]")
print('username = "preview"')
print(f'password = "{secrets.token_urlsafe(16)}"')
PY
    )
}

cmd_up() {
    # Private to this PC unless asked: signing in shows real financial data.
    export PREVIEW_BIND=127.0.0.1
    if [ "${1:-}" = "--phone" ]; then
        export PREVIEW_BIND=0.0.0.0
    fi
    [ -f "$SETTINGS" ] || die "add the server details to $SETTINGS first (see the top of this script)."
    # shellcheck disable=SC1090
    . "$SETTINGS"
    if [ -z "${PREVIEW_PROD_HOST:-}" ] || [ -z "${PREVIEW_PROD_USER:-}" ]; then
        die "$SETTINGS needs PREVIEW_PROD_HOST and PREVIEW_PROD_USER."
    fi
    mkdir -p "$DATA_DIR"
    chmod 700 "$DATA_DIR"
    copy_live_data
    write_secrets
    compose up -d --build --wait web

    echo
    echo "Preview is running (commit $(git -C "$ROOT" rev-parse --short HEAD), branch $(git -C "$ROOT" branch --show-current))."
    echo "  On this PC: http://localhost:$PORT"
    if [ "$PREVIEW_BIND" = 0.0.0.0 ] && [ -n "${PREVIEW_LAN_ADDRESS:-}" ]; then
        echo "  On your phone (home Wi-Fi): http://$PREVIEW_LAN_ADDRESS:$PORT"
        echo "  Anyone on your Wi-Fi could reach that link, so stop the preview when you are done."
    else
        echo "  Private to this PC. For your phone, run: scripts/preview.sh up --phone"
    fi
    echo "  Sign in as preview, password: $(sed -n 's/^password = "\(.*\)"/\1/p' "$SECRETS")"
    echo "  This is a copy, so changes here never reach your real data."
    echo "  When finished: scripts/preview.sh down"
}

cmd_down() {
    compose down -v --remove-orphans
    rm -rf -- "$DATA_DIR"
    echo "Preview stopped and its data copy deleted."
}

cmd_status() {
    compose ps
    if [ -d "$DATA_DIR/data" ]; then
        echo "Data copy taken: $(date -r "$DATA_DIR/data" '+%Y-%m-%d %H:%M')"
    else
        echo "No data copy on this PC."
    fi
}

check_safe_to_run
case "${1:-}" in
    up) cmd_up "${2:-}" ;;
    down) cmd_down ;;
    status) cmd_status ;;
    refresh-data)
        cmd_down
        cmd_up
        ;;
    *) die "use: scripts/preview.sh up|up --phone|down|status|refresh-data" ;;
esac

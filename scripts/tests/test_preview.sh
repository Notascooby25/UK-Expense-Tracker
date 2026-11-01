#!/usr/bin/env bash
# Fixture tests: scripts/preview.sh
#
# Hermetic: docker and ssh are stubs on PATH and HOME is a temp folder, so
# nothing here can reach a real container or the production server.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
SCRIPT="$ROOT/scripts/preview.sh"
# shellcheck source=/dev/null
. "$HERE/lib.sh"

setup() {
    T=$(mktemp -d)
    export HOME="$T/home"
    DATA="$HOME/.local/share/safe-change/previews/expense-tracker"
    mkdir -p "$HOME/.config/safe-change" "$T/bin" "$T/src/data"
    # Big enough that cutting the archive at 2000 bytes lands inside the file.
    { echo "Date,Name,Amount"; seq 1 5000; } > "$T/src/data/expense_database.csv"
    tar -C "$T/src" -cf "$T/good.tar" data
    head -c 2000 "$T/good.tar" > "$T/cut.tar"
    tar -C "$T/src" -cf "$T/empty.tar" --exclude='data/*' data
    cat > "$HOME/.config/safe-change/preview.env" <<'EOF'
PREVIEW_PROD_HOST=fake-host
PREVIEW_PROD_USER=fake-user
PREVIEW_LAN_ADDRESS=10.0.0.5
EOF
    cat > "$T/bin/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >> "$T/docker.log"
echo "PREVIEW_BIND=\${PREVIEW_BIND:-}" >> "$T/env.log"
exit 0
EOF
    cat > "$T/bin/ssh" <<EOF
#!/usr/bin/env bash
echo "ssh \$*" >> "$T/ssh.log"
case "\${FAKE_SSH_MODE:-ok}" in
  fail) exit 1 ;;
  partial) cat "$T/good.tar" | head -c 500; exit 1 ;;
  truncated) cat "$T/cut.tar" ;;
  empty) cat "$T/empty.tar" ;;
  *) cat "$T/good.tar" ;;
esac
EOF
    chmod +x "$T/bin/docker" "$T/bin/ssh"
    export PATH="$T/bin:$PATH"
    unset DOCKER_HOST PREVIEW_DATA_DIR FAKE_SSH_MODE
}

run() { bash "$SCRIPT" "$@" > "$T/out.txt" 2>&1; }
every_compose_call_uses_preview_project() {
    ! grep 'compose' "$T/docker.log" | grep -qv -- '-p expense-tracker-preview'
}

echo "down only targets the preview project"
setup; mkdir -p "$DATA/data"; touch "$DATA/data/x"
run down
check "exits cleanly" test $? -eq 0
check "called compose" grep -q compose "$T/docker.log"
check "every call names the preview project" every_compose_call_uses_preview_project
check "data folder removed" test ! -e "$DATA"

echo "down refuses a data folder outside the previews area"
setup; mkdir -p "$T/precious"; touch "$T/precious/keep"
PREVIEW_DATA_DIR="$T/precious" run down; rc=$?
check "exits non-zero" test "$rc" -ne 0
check "file kept" test -e "$T/precious/keep"
check "docker not called" test ! -e "$T/docker.log"
PREVIEW_DATA_DIR="$DATA/../../../../../precious" run down; rc=$?
check "refuses .. in the path" test "$rc" -ne 0

echo "up stops plainly when the server can't be reached"
setup
FAKE_SSH_MODE=fail run up; rc=$?
check "exits non-zero" test "$rc" -ne 0
check "plain message" grep -qi "couldn't copy" "$T/out.txt"
check "nothing started" test ! -e "$T/docker.log"

echo "a partial, truncated or empty copy is never used"
for mode in partial truncated empty; do
    setup
    FAKE_SSH_MODE=$mode run up; rc=$?
    check "$mode: exits non-zero" test "$rc" -ne 0
    check "$mode: no data left" test ! -e "$DATA/data"
    check "$mode: no temp file left" test ! -e "$DATA/data.tar.partial"
    check "$mode: nothing started" test ! -e "$T/docker.log"
done

echo "a copy that fails while unpacking is never used"
setup
cat > "$T/bin/tar" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *-xf*) /usr/bin/tar "\$@"; exit 2 ;;
  *) exec /usr/bin/tar "\$@" ;;
esac
EOF
chmod +x "$T/bin/tar"
run up; rc=$?
check "exits non-zero" test "$rc" -ne 0
check "no data left" test ! -e "$DATA/data"
check "no unpacking folder left" test ! -e "$DATA/data.unpacking"
check "nothing started" test ! -e "$T/docker.log"

echo "refuses a remote docker"
setup
DOCKER_HOST=tcp://10.0.0.9:2375 run up; rc=$?
check "exits non-zero" test "$rc" -ne 0
check "docker not called" test ! -e "$T/docker.log"

echo "a missing server setting stops plainly"
setup; rm "$HOME/.config/safe-change/preview.env"
run up; rc=$?
check "exits non-zero" test "$rc" -ne 0
check "names the settings file" grep -q preview.env "$T/out.txt"

echo "a good run"
setup
run up; rc=$?
check "exits cleanly" test "$rc" -eq 0
check "every call names the preview project" every_compose_call_uses_preview_project
check "server only asked for a copy" bash -c "[ \$(grep -c . '$T/ssh.log') -eq 1 ] && grep -q 'tar ' '$T/ssh.log'"
check "copy goes through the app container" grep -q 'docker exec uk_expense_tracker_web tar -C /app -cf - data' "$T/ssh.log"
check "server copy is read-only" bash -c "! grep -Eq 'rm |mv |>|compose' '$T/ssh.log'"
check "data unpacked" test -f "$DATA/data/expense_database.csv"
check "PC link printed" grep -q "http://localhost:18502" "$T/out.txt"
check "commit printed" grep -qi "commit" "$T/out.txt"
check "data folder is private" test "$(stat -c %a "$DATA")" = 700
check "secrets file is private" test "$(stat -c %a "$DATA/secrets.toml")" = 600
check "throwaway password set" grep -q '^password = ' "$DATA/secrets.toml"
check "no live key material" hasnt "$DATA/secrets.toml" "connections.gsheets"
pw=$(sed -n 's/^password = "\(.*\)"/\1/p' "$DATA/secrets.toml")
check "password shown once to sign in" grep -qF "$pw" "$T/out.txt"

echo "private to this PC unless the phone is asked for"
setup
PREVIEW_BIND=wrong run up
check "no phone link by default" hasnt "$T/out.txt" "http://10.0.0.5"
check "says how to get a phone link" grep -q -- "--phone" "$T/out.txt"
check "binds to this PC only" grep -q "PREVIEW_BIND=127.0.0.1" "$T/env.log"
setup
run up --phone
check "phone link when asked" grep -q "http://10.0.0.5:18502" "$T/out.txt"
check "warns about the Wi-Fi" grep -qi "anyone on your Wi-Fi" "$T/out.txt"
check "binds to the network" grep -q "PREVIEW_BIND=0.0.0.0" "$T/env.log"

echo "the preview stack is isolated"
C="$ROOT/docker-compose.preview.yml"
check "own project name" grep -q '^name: expense-tracker-preview' "$C"
check "no legacy app" bash -c "! grep -Eq '^  expense-tracker:' '$C'"
check "no watchtower" hasnt "$C" "watchtower"
check "never mounts the repo data folder" bash -c "! grep -Eq '^ *- *\./data' '$C'"
check "never mounts the repo secrets" bash -c "! grep -q '\./\.streamlit' '$C'"
check "port follows the chosen address" grep -q 'PREVIEW_BIND' "$C"
check "runs as production" grep -q 'EXPENSE_TRACKER_ENV=production' "$C"

summary

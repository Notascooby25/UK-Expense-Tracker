#!/usr/bin/env bash
# Fixture tests: expense scripts/data_backup.sh + scripts/setup_backup_cron.sh
#
# Hermetic: every external tool the script talks to (rclone, curl, ssh, rsync, crontab,
# verify script...) is replaced by a stub on PATH, and all state lives in a temp dir that
# is removed on exit. Nothing here touches a real remote, crontab or backup directory.
# Needs: bash, GNU coreutils/find/date (Linux), python3 (large-CSV case).
# Run:   scripts/tests/test_data_backup.sh
set -uo pipefail
SP=$(cd "$(dirname "$0")" && pwd); . "$SP/lib.sh"
SRC="$(cd "$SP/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

mk_repo() {   # mk_repo <dir> : temp repo with the scripts and realistic data/
    rm -rf "$1"; mkdir -p "$1/scripts" "$1/data"
    cp "$SRC/data_backup.sh" "$SRC/setup_backup_cron.sh" "$1/scripts/"
    printf 'Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year\n01/01/2026,Tesco,12.50,Expense,Barclays,Food,,2025-2026\n' > "$1/data/expense_database.csv"
    echo '{"a":1}' > "$1/data/settings.json"; echo '{}' > "$1/data/saved_filters.json"
    printf 'Date,Name\n01/01/2026,Joint\n' > "$1/data/expense_database_joint.csv"; echo '{"j":1}' > "$1/data/settings_joint.json"
    : > "$1/data/.gitkeep"; echo x > "$1/data/scratch.tmp"; echo x > "$1/data/app.lock"
}

echo "== data_backup.sh"
R=$T/repo; OUT=$T/out; mk_repo "$R"
"$R/scripts/data_backup.sh" "$OUT" 3 > "$T/run1.log" 2>&1; rc=$?
check "exits 0 on a normal run" test $rc -eq 0
A=$(ls "$OUT"/expense_tracker_data_*.tar.gz | head -1)
tar -tzf "$A" > "$T/members.txt"
check "archive contains main CSV"                has "$T/members.txt" "data/expense_database.csv"
check "archive contains joint CSV"               has "$T/members.txt" "data/expense_database_joint.csv"
check "archive contains joint settings"          has "$T/members.txt" "data/settings_joint.json"
check "archive contains settings + filters"      bash -c "grep -q settings.json '$T/members.txt' && grep -q saved_filters.json '$T/members.txt'"
check "archive excludes .gitkeep"                hasnt "$T/members.txt" ".gitkeep"
check "archive excludes *.tmp"                   hasnt "$T/members.txt" "scratch.tmp"
check "archive excludes *.lock"                  hasnt "$T/members.txt" "app.lock"
check "archive excludes secrets.toml"            hasnt "$T/members.txt" "secrets"
check "no .tmp archive left behind"              bash -c "! ls '$OUT'/*.tmp"
CS=${A%.tar.gz}.sha256
check "checksum file uses a basename, not a path" bash -c "! grep -q '/' '$CS'"
check "checksum verifies from the archive's dir"  bash -c "cd '$OUT' && sha256sum -c --quiet '$(basename "$CS")'"
check "checksum verifies after moving the pair"   bash -c "mkdir '$T/moved' && cp '$A' '$CS' '$T/moved/' && cd '$T/moved' && sha256sum -c --quiet '$(basename "$CS")'"
# restored content is byte-identical
mkdir "$T/restore"; tar -xzf "$A" -C "$T/restore"
check "restored joint CSV identical to source"   cmp -s "$T/restore/data/expense_database_joint.csv" "$R/data/expense_database_joint.csv"

echo "== retention (keep 3)"
for _ in 1 2 3 4; do sleep 1.1; "$R/scripts/data_backup.sh" "$OUT" 3 >/dev/null 2>&1; done
check "only 3 archives remain"                   test "$(ls "$OUT"/*.tar.gz | wc -l)" -eq 3
check "only 3 checksums remain (no orphans)"     test "$(ls "$OUT"/*.sha256 | wc -l)" -eq 3
check "newest archive kept"                      bash -c "ls -1 '$OUT'/*.tar.gz | sort | tail -1 | grep -q ."

echo "== regression: CSV larger than the pipe buffer (SIGPIPE under pipefail)"
mk_repo "$R"; python3 - "$R/data/expense_database.csv" <<'PY'
import sys
with open(sys.argv[1], "w") as f:
    f.write("Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year\n")
    for i in range(20000): f.write(f"01/01/2026,Merchant {i},1.00,Expense,Bank,Cat,note {i},2025-2026\n")
PY
rm -rf "$T/out2"; "$R/scripts/data_backup.sh" "$T/out2" 2 >/dev/null 2>&1; check "2 MB CSV backs up successfully" test $? -eq 0

echo "== failure modes"
mk_repo "$R"; rm "$R/data/expense_database.csv"; rm -rf "$T/out3"
"$R/scripts/data_backup.sh" "$T/out3" 3 >/dev/null 2>&1; check "missing main CSV -> non-zero"  test $? -ne 0
check "missing main CSV -> no archive written"   bash -c "! ls '$T/out3'/expense_tracker_data_* 2>/dev/null"
mk_repo "$R"; : > "$R/data/expense_database.csv"; rm -rf "$T/out4"
"$R/scripts/data_backup.sh" "$T/out4" 3 >/dev/null 2>&1; check "empty (headerless) CSV -> non-zero" test $? -ne 0
check "empty CSV -> no archive promoted"         bash -c "! ls '$T/out4'/*.tar.gz 2>/dev/null"
check "empty CSV -> no .tmp left"                bash -c "! ls '$T/out4'/*.tmp 2>/dev/null"
mk_repo "$R"; "$R/scripts/data_backup.sh" "$T/out5" 0 >/dev/null 2>&1; check "retention 0 rejected" test $? -ne 0
"$R/scripts/data_backup.sh" "$T/out5" abc >/dev/null 2>&1;              check "retention 'abc' rejected" test $? -ne 0
mk_repo "$R"; chmod 000 "$R/data/expense_database_joint.csv"
"$R/scripts/data_backup.sh" "$T/out6" 3 >/dev/null 2>&1; rc=$?; chmod 644 "$R/data/expense_database_joint.csv"
if [[ $(id -u) -ne 0 ]]; then
  check "unreadable data file -> non-zero (loud, not partial)" test $rc -ne 0
  check "unreadable data file -> no archive promoted"  bash -c "! ls '$T/out6'/*.tar.gz 2>/dev/null"
fi

echo "== setup_backup_cron.sh (stub crontab)"
mkdir -p "$T/bin"; CT=$T/crontab.txt
cat > "$T/bin/crontab" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == "-l" ]]; then [[ -f "$CT" ]] || { echo "no crontab for x" >&2; exit 1; }; cat "$CT"; else cp "\$1" "$CT"; fi
EOF
chmod +x "$T/bin/crontab"; export PATH="$T/bin:$PATH"
mk_repo "$R"; chmod +x "$R"/scripts/*.sh
active() { grep -v '^[[:space:]]*#' "$CT" | grep -c 'scripts/data_backup.sh'; }

rm -f "$CT"; (cd "$T" && "$R/scripts/setup_backup_cron.sh" "$T/cronout" >/dev/null 2>&1)
check "installs into an empty crontab"           test "$(active)" -eq 1
check "default schedule is daily 03:00"          bash -c "grep -q '^0 3 \* \* \* ' '$CT'"
check "default retention is 14"                  bash -c "grep -q ' 14 >> ' '$CT'"
check "block markers present"                    bash -c "grep -q 'BEGIN expense_tracker_data_backup' '$CT' && grep -q 'END expense_tracker_data_backup' '$CT'"

cat > "$CT" <<EOF
# EXPENSE TRACKER: mentions scripts/data_backup.sh in a comment only
MAILTO=me
0 3 */4 * * $R/scripts/data_backup.sh /srv/shared/backups 4 >> /srv/shared/backups/expense_tracker_backup_cron.log 2>&1
15 */6 * * * /srv/sleepwell/scripts/mood_images_backup.sh >> /x.log 2>&1
EOF
(cd "$T" && "$R/scripts/setup_backup_cron.sh" "$T/cronout" 14 >/dev/null 2>&1)
check "hand-edited line replaced, exactly one job" test "$(active)" -eq 1
check "the old */4 line is gone"                 hasnt "$CT" '*/4'
check "unrelated jobs preserved"                 has "$CT" 'mood_images_backup.sh'
check "unrelated env line preserved"             has "$CT" 'MAILTO=me'
check "comment mentioning the script preserved"  has "$CT" 'mentions scripts/data_backup.sh in a comment only'
cp "$CT" "$T/after1.txt"; (cd "$T" && "$R/scripts/setup_backup_cron.sh" "$T/cronout" 14 >/dev/null 2>&1)
check "re-run is idempotent"                     cmp -s "$CT" "$T/after1.txt"

cp "$CT" "$T/before_bad.txt"
(cd "$T" && "$R/scripts/setup_backup_cron.sh" "$T/cronout" 14 "* * *" >/dev/null 2>&1); check "3-field schedule rejected" test $? -ne 0
check "rejected schedule left crontab untouched" cmp -s "$CT" "$T/before_bad.txt"
mkdir "$T/globdir"; touch "$T/globdir"/{a,b,c,d,e,f}
(cd "$T/globdir" && "$R/scripts/setup_backup_cron.sh" "$T/cronout" 14 "0 3 * * *" >/dev/null 2>&1)
check "'*' fields are not glob-expanded by cwd files" test $? -eq 0
(cd "$T" && "$R/scripts/setup_backup_cron.sh" "$T/cronout" 0 >/dev/null 2>&1); check "retention 0 rejected" test $? -ne 0

summary

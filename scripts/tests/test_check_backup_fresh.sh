#!/usr/bin/env bash
# Fixture tests: scripts/check_backup_fresh.sh
#
# Hermetic: all state lives in a temp dir that is removed on exit; no real backup
# directory is read. Needs: bash, GNU coreutils/find/date/touch (Linux).
# Run:   scripts/tests/test_check_backup_fresh.sh
set -uo pipefail
SP=$(cd "$(dirname "$0")" && pwd); . "$SP/lib.sh"
SRC="$(cd "$SP/.." && pwd)"
SCRIPT="$SRC/check_backup_fresh.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

mk_archive() {   # mk_archive <dir> <stamp> <hours_old>
    local dir=$1 stamp=$2 hours=$3
    mkdir -p "$dir/payload/data"; echo "a,b" > "$dir/payload/data/expense_database.csv"
    tar -czf "$dir/expense_tracker_data_${stamp}.tar.gz" -C "$dir/payload" data
    ( cd "$dir" && sha256sum "expense_tracker_data_${stamp}.tar.gz" > "expense_tracker_data_${stamp}.sha256" )
    touch -d "-${hours} hours" "$dir/expense_tracker_data_${stamp}.tar.gz"
    rm -rf "$dir/payload"
}

echo "== check_backup_fresh.sh"
D=$T/fresh; mk_archive "$D" 20261031_030000 2
"$SCRIPT" "$D" 26 > "$T/o1" 2>&1; rc=$?
check "fresh verified archive exits 0"          test $rc -eq 0
check "reports OK"                              has "$T/o1" "OK: expense_tracker_data_20261031_030000.tar.gz"

D=$T/old; mk_archive "$D" 20261001_030000 100
"$SCRIPT" "$D" 26 > "$T/o2" 2>&1; rc=$?
check "archive older than the limit exits 1"    test $rc -eq 1
check "says how old it is"                      has "$T/o2" "100h old"

D=$T/mixed; mk_archive "$D" 20261001_030000 100; mk_archive "$D" 20261031_030000 3
"$SCRIPT" "$D" 26 > "$T/o3" 2>&1; rc=$?
check "judges by the NEWEST archive, not the oldest" test $rc -eq 0

D=$T/empty; mkdir -p "$D"
"$SCRIPT" "$D" > "$T/o4" 2>&1; rc=$?
check "no archives exits 1"                     test $rc -eq 1
check "says no archive found"                   has "$T/o4" "no expense_tracker_data_"

"$SCRIPT" "$T/does-not-exist" > "$T/o5" 2>&1; rc=$?
check "missing directory exits 1"               test $rc -eq 1

D=$T/badsum; mk_archive "$D" 20261031_030000 1
echo "0000000000000000000000000000000000000000000000000000000000000000  expense_tracker_data_20261031_030000.tar.gz" > "$D/expense_tracker_data_20261031_030000.sha256"
"$SCRIPT" "$D" 26 > "$T/o6" 2>&1; rc=$?
check "checksum mismatch exits 1"               test $rc -eq 1
check "says checksum mismatch"                  has "$T/o6" "checksum mismatch"

D=$T/nosum; mk_archive "$D" 20261031_030000 1; rm "$D/expense_tracker_data_20261031_030000.sha256"
"$SCRIPT" "$D" 26 > "$T/o7" 2>&1; rc=$?
check "missing checksum file exits 1"           test $rc -eq 1

D=$T/corrupt; mkdir -p "$D"; echo "not a tarball" > "$D/expense_tracker_data_20261031_030000.tar.gz"
( cd "$D" && sha256sum expense_tracker_data_20261031_030000.tar.gz > expense_tracker_data_20261031_030000.sha256 )
"$SCRIPT" "$D" 26 > "$T/o8" 2>&1; rc=$?
check "unreadable archive exits 1"              test $rc -eq 1

"$SCRIPT" "$T/fresh" 0 > "$T/o9" 2>&1; rc=$?
check "zero hours is rejected as bad usage (2)" test $rc -eq 2
"$SCRIPT" "$T/fresh" abc > "$T/o10" 2>&1; rc=$?
check "non-numeric hours is rejected (2)"       test $rc -eq 2

summary

#!/usr/bin/env bash
# Fixture tests: expense scripts/restore_data_backup.sh
#
# Hermetic: all state lives in a temp dir removed on exit; real archives are produced by
# scripts/data_backup.sh run against a temp copy of the project. Nothing here touches a real
# backup directory, the real data/ folder or any remote. Test data is synthetic.
# Needs: bash, GNU coreutils/tar, python3.
# Run:   scripts/tests/test_restore_data_backup.sh
set -uo pipefail
SP=$(cd "$(dirname "$0")" && pwd); . "$SP/lib.sh"
SRC="$(cd "$SP/.." && pwd)"
SCRIPT="$SRC/restore_data_backup.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/tmp"; export TMPDIR="$T/tmp"

HEADER='Date,Name,Amount,Transaction_Type,Bank,Category,Notes,Financial_Year'

mk_repo() {   # mk_repo <dir> : temp project with the backup script and realistic synthetic data/
    rm -rf "$1"; mkdir -p "$1/scripts" "$1/data"
    cp "$SRC/data_backup.sh" "$1/scripts/"
    printf '%s\n01/01/2026,Tesco,12.50,Expense,Bank A,Food,,2025-2026\n02/01/2026,Shop,3.00,Expense,Bank A,Food,,2025-2026\n' "$HEADER" > "$1/data/expense_database.csv"
    echo '{"a":1}' > "$1/data/settings.json"; echo '{}' > "$1/data/saved_filters.json"
    printf 'Date,Name\n01/01/2026,Joint\n' > "$1/data/expense_database_joint.csv"; echo '{"j":1}' > "$1/data/settings_joint.json"
}
backup() {    # backup <repo> <outdir> : run data_backup.sh, print the newest archive path
    "$1/scripts/data_backup.sh" "$2" 20 >/dev/null 2>&1
    ls -1 "$2"/expense_tracker_data_*.tar.gz | sort | tail -1
}
manual_archive() {  # manual_archive <outdir> <tar args...> : archive built by hand, with a matching checksum
    local out=$1; shift
    mkdir -p "$out"; local a="$out/expense_tracker_data_19990101_000000.tar.gz"
    tar -czf "$a" "$@" 2>/dev/null
    ( cd "$out" && sha256sum "$(basename "$a")" > "${a%.tar.gz}.sha256" )
    echo "$a"
}
run() { rm -f "$T/out.txt"; "$SCRIPT" "$@" > "$T/out.txt" 2>&1; RC=$?; }
tree_hash() { ( cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) | sha256sum; }

echo "== valid archive"
R=$T/repo; mk_repo "$R"
A=$(backup "$R" "$T/o1")
run "$A" --dest "$T/d1"
check "exits 0"                                    test $RC -eq 0
check "reports RESTORE OK"                         has "$T/out.txt" "RESTORE OK"
check "reports the expense row count (2)"          has "$T/out.txt" "2 expense rows"
check "main CSV restored byte-identical"           cmp -s "$T/d1/data/expense_database.csv" "$R/data/expense_database.csv"
check "joint CSV restored byte-identical"          cmp -s "$T/d1/data/expense_database_joint.csv" "$R/data/expense_database_joint.csv"
check "settings restored"                          cmp -s "$T/d1/data/settings.json" "$R/data/settings.json"

echo "== default destination"
run "$A"
check "exits 0 without --dest"                     test $RC -eq 0
DEST=$(sed -n 's/.*restored to //p' "$T/out.txt" | tail -1)
check "prints a destination that exists"           test -d "$DEST/data"
check "default destination is under TMPDIR"        bash -c "[[ '$DEST' == '$T/tmp/'* ]]"

echo "== --latest"
sleep 1.1; echo '03/01/2026,Newer,1.00,Expense,Bank A,Food,,2025-2026' >> "$R/data/expense_database.csv"
backup "$R" "$T/o1" >/dev/null
run --latest --backup-dir "$T/o1" --dest "$T/d2"
check "--latest exits 0"                           test $RC -eq 0
check "--latest restored the newest archive (3 rows)" bash -c "cmp -s '$T/d2/data/expense_database.csv' '$R/data/expense_database.csv' && grep -q Newer '$T/d2/data/expense_database.csv'"
run --latest --backup-dir "$T/nonexistent" --dest "$T/d2b"
check "--latest on a missing directory -> exit 1"  test $RC -eq 1

echo "== older archive without joint-account files"
mk_repo "$T/repo_old"; rm "$T/repo_old/data/expense_database_joint.csv" "$T/repo_old/data/settings_joint.json"
AO=$(backup "$T/repo_old" "$T/o_old")
run "$AO" --dest "$T/d_old"
check "old-style archive restores (exit 0)"        test $RC -eq 0

echo "== refuse bad archives (nothing extracted)"
mk_repo "$T/repo_c"; AC=$(backup "$T/repo_c" "$T/o_c")
cp -r "$T/o_c" "$T/o_flip"; AF=$(ls "$T/o_flip"/*.tar.gz); printf 'X' | dd of="$AF" bs=1 seek=40 conv=notrunc 2>/dev/null
run "$AF" --dest "$T/d_flip"
check "flipped byte -> checksum mismatch, exit 1"  test $RC -eq 1
check "-> message mentions checksum"               has "$T/out.txt" "checksum"
check "-> destination not created"                 test ! -e "$T/d_flip"

cp -r "$T/o_c" "$T/o_nosum"; rm "$T/o_nosum"/*.sha256; AN=$(ls "$T/o_nosum"/*.tar.gz)
run "$AN" --dest "$T/d_nosum"
check "checksum file missing -> exit 1"            test $RC -eq 1
check "-> destination not created"                 test ! -e "$T/d_nosum"

mkdir -p "$T/o_trunc"; head -c 100 "$AC" > "$T/o_trunc/expense_tracker_data_19990101_000000.tar.gz"
( cd "$T/o_trunc" && sha256sum expense_tracker_data_19990101_000000.tar.gz > expense_tracker_data_19990101_000000.sha256 )
run "$T/o_trunc/expense_tracker_data_19990101_000000.tar.gz" --dest "$T/d_trunc"
check "truncated archive (checksum matches) -> exit 1" test $RC -eq 1
check "-> message says unreadable"                 has "$T/out.txt" "unreadable"
check "-> no destination left behind"              test ! -e "$T/d_trunc"

mkdir -p "$T/o_text"; echo "not a tarball" > "$T/o_text/expense_tracker_data_19990101_000000.tar.gz"
( cd "$T/o_text" && sha256sum expense_tracker_data_19990101_000000.tar.gz > expense_tracker_data_19990101_000000.sha256 )
run "$T/o_text/expense_tracker_data_19990101_000000.tar.gz" --dest "$T/d_text"
check "not a tarball -> exit 1"                    test $RC -eq 1

mk_repo "$T/repo_m"
AM=$(manual_archive "$T/o_nomain" -C "$T/repo_m" data/settings.json)
run "$AM" --dest "$T/d_nomain"
check "archive without the main CSV -> exit 1"     test $RC -eq 1
check "-> message names expense_database.csv"      has "$T/out.txt" "expense_database.csv"

echo "== refuse unsafe members"
mk_repo "$T/repo_s"; mkdir -p "$T/repo_s/.streamlit"; echo 'key = "x"' > "$T/repo_s/.streamlit/secrets.toml"
AS=$(manual_archive "$T/o_sec" -C "$T/repo_s" data .streamlit/secrets.toml)
run "$AS" --dest "$T/d_sec"
check "archive holding secrets.toml -> exit 1"     test $RC -eq 1
check "-> message mentions secrets"                has "$T/out.txt" "secrets"
check "-> secrets.toml not extracted anywhere"     bash -c "! find '$T' -name secrets.toml -not -path '$T/repo_s/*' | grep -q ."
mkdir -p "$T/o_trav"
python3 - "$T/o_trav/expense_tracker_data_19990101_000000.tar.gz" <<'PY'
import sys, tarfile, io
with tarfile.open(sys.argv[1], "w:gz") as t:
    for name in ("data/expense_database.csv", "data/../../evil.txt"):
        b = b"x\n"; i = tarfile.TarInfo(name); i.size = len(b); t.addfile(i, io.BytesIO(b))
PY
( cd "$T/o_trav" && sha256sum expense_tracker_data_19990101_000000.tar.gz > expense_tracker_data_19990101_000000.sha256 )
run "$T/o_trav/expense_tracker_data_19990101_000000.tar.gz" --dest "$T/d_trav"
check "member with .. in its path -> exit 1"       test $RC -eq 1
check "-> message says why (.. in a path)"         has "$T/out.txt" "'..'"
check "-> nothing written outside the destination" test ! -e "$T/evil.txt"

echo "== refuse bad content"
mk_repo "$T/repo_h"; printf '%s\n' "$HEADER" > "$T/repo_h/data/expense_database.csv"
run "$(backup "$T/repo_h" "$T/o_h")" --dest "$T/d_h"
check "header-only main CSV -> exit 1"             test $RC -eq 1
check "-> message says no data rows"               has "$T/out.txt" "no data rows"
check "-> destination not created"                 test ! -e "$T/d_h"
mk_repo "$T/repo_r"; echo '03/01/2026,Extra,1.00,Expense,Bank A,Food,,2025-2026,SURPLUS' >> "$T/repo_r/data/expense_database.csv"
run "$(backup "$T/repo_r" "$T/o_r")" --dest "$T/d_r"
check "ragged CSV row -> exit 1"                   test $RC -eq 1
check "-> message mentions columns"                has "$T/out.txt" "columns"
mk_repo "$T/repo_j"; echo '{bad json' > "$T/repo_j/data/settings.json"
run "$(backup "$T/repo_j" "$T/o_j")" --dest "$T/d_j"
check "invalid settings.json -> exit 1"            test $RC -eq 1
check "-> message names settings.json"             has "$T/out.txt" "settings.json"
mk_repo "$T/repo_jj"; printf 'Date,Name\n01/01/2026,a,b\n' > "$T/repo_jj/data/expense_database_joint.csv"
run "$(backup "$T/repo_jj" "$T/o_jj")" --dest "$T/d_jj"
check "ragged joint CSV -> exit 1"                 test $RC -eq 1

echo "== destination safety and usage"
mkdir -p "$T/d_full"; echo keep > "$T/d_full/keep.txt"
run "$A" --dest "$T/d_full"
check "non-empty destination -> exit 1"            test $RC -eq 1
check "-> message says not empty"                  has "$T/out.txt" "not empty"
check "-> existing file untouched"                 bash -c "[[ \$(cat '$T/d_full/keep.txt') == keep ]]"
mkdir -p "$T/d_empty"; run "$A" --dest "$T/d_empty"
check "existing EMPTY destination is allowed"      test $RC -eq 0
run
check "no arguments -> usage, exit 2"              test $RC -eq 2

echo "== links, special files and members outside data/ (review findings I1, I2, I5)"
run_t() { rm -f "$T/out.txt"; timeout 20 "$SCRIPT" "$@" > "$T/out.txt" 2>&1; RC=$?; }   # 124 = hung
py_archive() {  # py_archive <outdir> : python for the members is read from stdin; prints the archive path
    local out=$1 a="$1/expense_tracker_data_19990101_000000.tar.gz"; mkdir -p "$out"
    python3 -c 'import sys, tarfile, io
t = tarfile.open(sys.argv[1], "w:gz")
def add(name, data=b"x\n", type=tarfile.REGTYPE, linkname=""):
    i = tarfile.TarInfo(name); i.type = type; i.linkname = linkname
    if type == tarfile.REGTYPE:
        i.size = len(data); t.addfile(i, io.BytesIO(data))
    else:
        t.addfile(i)
exec(sys.stdin.read())
t.close()' "$a"
    ( cd "$out" && sha256sum "$(basename "$a")" > "${a%.tar.gz}.sha256" )
    echo "$a"
}
mkdir -p "$T/outside"; printf '%s\n01/01/2026,Leak,1.00,Expense,Bank A,Food,,2025-2026\n' "$HEADER" > "$T/outside/leak.csv"
GOODCSV="$(printf '%s\n01/01/2026,Tesco,12.50,Expense,Bank A,Food,,2025-2026\n' "$HEADER")"

A1=$(py_archive "$T/o_sym" <<PY
add("data/expense_database.csv", type=tarfile.SYMTYPE, linkname="$T/outside/leak.csv")
PY
)
run_t "$A1" --dest "$T/d_sym"
check "main CSV that is a symlink -> exit 1 (not OK, not a hang)" test $RC -eq 1
check "-> message mentions a link"                 has "$T/out.txt" "link"
check "-> destination not created"                 test ! -e "$T/d_sym"
A2=$(py_archive "$T/o_sym2" <<PY
add("data/expense_database.csv", data=b"""$GOODCSV
""")
add("data/x.json", type=tarfile.SYMTYPE, linkname="$T/repo_s/.streamlit/secrets.toml")
PY
)
run_t "$A2" --dest "$T/d_sym2"
check "json symlink pointing at secrets -> exit 1" test $RC -eq 1
A3=$(py_archive "$T/o_fifo" <<PY
add("data/expense_database.csv", data=b"""$GOODCSV
""")
add("data/s.json", type=tarfile.FIFOTYPE)
PY
)
run_t "$A3" --dest "$T/d_fifo"
check "FIFO member -> exit 1, does not hang"       test $RC -eq 1
A4=$(py_archive "$T/o_foreign" <<PY
add("data/expense_database.csv", data=b"""$GOODCSV
""")
add("app.py", data=b"print('overwrite me')\n")
PY
)
run_t "$A4" --dest "$T/d_foreign"
check "member outside data/ -> exit 1"             test $RC -eq 1
check "-> message says outside data/"              has "$T/out.txt" "outside data/"
check "-> destination not created"                 test ! -e "$T/d_foreign"
A5=$(py_archive "$T/o_abs" <<PY
add("data/expense_database.csv", data=b"""$GOODCSV
""")
add("/tmp/absolute-evil.txt")
PY
)
run_t "$A5" --dest "$T/d_abs"
check "absolute-path member -> exit 1"             test $RC -eq 1
check "-> message mentions absolute path"          has "$T/out.txt" "absolute"

echo "== checksum must bind to the archive (I3)"
mk_repo "$T/repo_k"; AK=$(backup "$T/repo_k" "$T/o_k")
cp -r "$T/o_k" "$T/o_decoy"; AD=$(ls "$T/o_decoy"/*.tar.gz); echo decoy > "$T/o_decoy/decoy.txt"
( cd "$T/o_decoy" && sha256sum decoy.txt > "$(basename "${AD%.tar.gz}").sha256" )
run "$AD" --dest "$T/d_decoy"
check "checksum file hashing a different file -> exit 1" test $RC -eq 1
check "-> message mentions checksum"               has "$T/out.txt" "checksum"
cp -r "$T/o_k" "$T/o_garbage"; echo "not a checksum" > "$(ls "$T/o_garbage"/*.sha256)"
run "$(ls "$T/o_garbage"/*.tar.gz)" --dest "$T/d_garbage"
check "malformed checksum file -> exit 1"          test $RC -eq 1
check "-> message says malformed"                  has "$T/out.txt" "malformed"
mkdir -p "$T/o_renamed"; cp "$AK" "$T/o_renamed/expense_tracker_data_20000101_000000.tar.gz"
cp "${AK%.tar.gz}.sha256" "$T/o_renamed/expense_tracker_data_20000101_000000.sha256"
run "$T/o_renamed/expense_tracker_data_20000101_000000.tar.gz" --dest "$T/d_renamed"
check "renamed archive + checksum pair still restores" test $RC -eq 0

echo "== real-world CSV content (I4)"
mk_repo "$T/repo_l1"; printf '%s\n01/01/2026,Shop,3.00,Expense,Bank A,Food,\xa3 note,2025-2026\n' "$HEADER" > "$T/repo_l1/data/expense_database.csv"
run "$(backup "$T/repo_l1" "$T/o_l1")" --dest "$T/d_l1"
check "Latin-1 CSV (the app accepts these) restores"  test $RC -eq 0
mk_repo "$T/repo_big"; python3 -c "
import sys
print(sys.argv[1]); print('01/01/2026,Shop,3.00,Expense,Bank A,Food,' + 'x' * 200000 + ',2025-2026')" "$HEADER" > "$T/repo_big/data/expense_database.csv"
run "$(backup "$T/repo_big" "$T/o_big")" --dest "$T/d_big"
check "CSV with an oversized field -> exit 1"      test $RC -eq 1
check "-> clean RESTORE FAILED message"            has "$T/out.txt" "RESTORE FAILED"
check "-> no Python traceback shown"               hasnt "$T/out.txt" "Traceback"

echo "== destination checks (I6)"
run "$A" --dest "$T/np/a/b"
check "destination whose parent is missing -> exit 1" test $RC -eq 1
check "-> message mentions the parent"             has "$T/out.txt" "parent"
check "-> no directories created"                  test ! -e "$T/np"
mkdir -p "$T/d_real_empty"; ln -s "$T/d_real_empty" "$T/d_link"
run "$A" --dest "$T/d_link"
check "destination that is a symlink -> exit 1"    test $RC -eq 1
check "-> message mentions symlink"                has "$T/out.txt" "symlink"
check "-> clean RESTORE FAILED message"            has "$T/out.txt" "RESTORE FAILED"

echo "== the live data folder is never touched"
mk_repo "$T/repo_live"; cp "$SCRIPT" "$T/repo_live/scripts/"; AL=$(backup "$T/repo_live" "$T/o_live")
LB=$(tree_hash "$T/repo_live/data"); MT=$(stat -c %Y "$T/repo_live/data")
run_in_repo() { rm -f "$T/out.txt"; "$T/repo_live/scripts/restore_data_backup.sh" "$@" > "$T/out.txt" 2>&1; RC=$?; }
run_in_repo "$AL" --dest "$T/repo_live/data/restore"
check "destination inside the repo's data/ -> exit 1" test $RC -eq 1
check "-> message mentions live data"              has "$T/out.txt" "live data"
run_in_repo "$AL" --dest "$T/d_live"
check "a normal restore from inside the repo works" test $RC -eq 0
check "data/ content unchanged"                    bash -c "[[ \$(cat <<<'$(tree_hash "$T/repo_live/data")') == '$LB' ]]"
check "data/ mtime unchanged"                      bash -c "[[ \$(stat -c %Y '$T/repo_live/data') == '$MT' ]]"

echo "== no staging directories survive any run"
check "no .expense_restore_stage.* left anywhere"  bash -c "! find '$T' -name '.expense_restore_stage.*' | grep -q ."

summary

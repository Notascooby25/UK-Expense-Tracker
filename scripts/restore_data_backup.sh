#!/usr/bin/env bash
# restore_data_backup.sh — restore an expense tracker data backup into a SCRATCH folder and
# prove it is complete and usable. It never writes to the app's live data/ folder.
#
# Usage:
#   ./scripts/restore_data_backup.sh <archive.tar.gz>            [--dest DIR]
#   ./scripts/restore_data_backup.sh --latest [--backup-dir DIR] [--dest DIR]
#
#   --latest       use the newest expense_tracker_data_*.tar.gz in --backup-dir
#   --backup-dir   default /srv/shared/backups
#   --dest         where to restore to: must not exist, or be an empty directory.
#                  Default: a new directory under $TMPDIR (or /tmp), printed at the end.
#
# What it checks before and after extracting:
#   - the sibling .sha256 file exists and matches the archive
#   - the archive is a readable tarball and holds data/expense_database.csv
#   - no member is an absolute path, contains "..", or is a secrets.toml (the backup never
#     contains credentials, so an archive that does is refused)
#   - the main CSV has a header, at least one data row, and every row has the header's
#     number of columns; the joint-account CSV (when present) has consistent columns
#   - every data/*.json file parses
#
# The restore happens in a staging folder that is moved into place only after every check
# passes, so a failed run leaves no destination behind.
#
# Archives from before 2026-09-21 hold only the three main files; they are accepted.
# Exit: 0 restored and valid, 1 refused / invalid, 2 bad usage.
#
# To restore for real, follow the commands in README.md ("Restore"); this script is the
# rehearsal that tells you the archive will work.

set -euo pipefail

die()   { echo "RESTORE FAILED: $*" >&2; exit 1; }
info()  { echo "[restore_data_backup] $*"; }
usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

ARCHIVE=""
LATEST=false
BACKUP_DIR="/srv/shared/backups"
DEST=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --latest)     LATEST=true; shift ;;
        --backup-dir) [[ $# -ge 2 ]] || usage; BACKUP_DIR="$2"; shift 2 ;;
        --dest)       [[ $# -ge 2 ]] || usage; DEST="$2"; shift 2 ;;
        -h|--help)    usage ;;
        -*)           echo "Unknown option: $1" >&2; usage ;;
        *)            [[ -z "$ARCHIVE" ]] || usage; ARCHIVE="$1"; shift ;;
    esac
done

if [[ "$LATEST" == true && -n "$ARCHIVE" ]]; then usage; fi
if [[ "$LATEST" == false && -z "$ARCHIVE" ]]; then usage; fi

# ── pick the archive ──────────────────────────────────────────────────────────
if [[ "$LATEST" == true ]]; then
    [[ -d "$BACKUP_DIR" ]] || die "backup directory not found: $BACKUP_DIR"
    newest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'expense_tracker_data_*.tar.gz' -printf '%f\n' | sort | tail -n 1)"
    [[ -n "$newest" ]] || die "no expense_tracker_data_*.tar.gz archive in $BACKUP_DIR"
    ARCHIVE="$BACKUP_DIR/$newest"
fi
[[ -f "$ARCHIVE" ]] || die "archive not found: $ARCHIVE"

# ── verify before extracting ─────────────────────────────────────────────────
CHECKSUM_FILE="${ARCHIVE%.tar.gz}.sha256"
[[ -f "$CHECKSUM_FILE" ]] || die "no checksum file next to the archive (expected $(basename "$CHECKSUM_FILE"))"
# Compare the hash directly: `sha256sum -c` would verify whatever file the .sha256 names,
# which need not be this archive (and breaks when the pair has been renamed).
expected="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_FILE")"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || die "checksum file is malformed (no SHA-256 on its first line): $(basename "$CHECKSUM_FILE")"
actual="$(sha256sum < "$ARCHIVE" | awk '{ print $1 }')"
[[ "$expected" == "$actual" ]] \
    || die "checksum mismatch for $(basename "$ARCHIVE"): the archive is damaged or was altered"

members="$(tar -tzf "$ARCHIVE" 2>/dev/null)" || die "archive is unreadable (truncated or not a gzip tarball): $ARCHIVE"

if grep -qE '(^/|(^|/)\.\.(/|$))' <<<"$members"; then
    die "archive has a member with an absolute path or '..' in it; refusing to extract"
fi
# The backup holds only data/. Anything else would be overwritten onto the app by a real restore.
if grep -qvE '^data(/|$)' <<<"$members"; then
    die "archive has members outside data/ (for example $(grep -vE '^data(/|$)' <<<"$members" | head -n 1)); refusing to extract"
fi
if grep -qE '(^|/)secrets\.toml$' <<<"$members"; then
    die "archive contains secrets.toml; the backup should never hold credentials, so it is refused"
fi
grep -qx 'data/expense_database.csv' <<<"$members" || die "archive is missing data/expense_database.csv"

# ── destination and staging ──────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "$DEST" ]]; then
    PARENT="${TMPDIR:-/tmp}"
    DEST="$(mktemp -u "$PARENT/expense_restore.XXXXXX")"
else
    PARENT="$(dirname "$DEST")"
    [[ -d "$PARENT" ]] || die "the destination's parent directory does not exist: $PARENT"
    [[ ! -L "$DEST" ]] || die "destination is a symlink; give a real directory path: $DEST"
    if [[ -e "$DEST" ]]; then
        [[ -d "$DEST" ]] || die "destination exists and is not a directory: $DEST"
        [[ -z "$(ls -A -- "$DEST")" ]] || die "destination is not empty: $DEST"
    fi
fi
[[ -d "$PARENT" ]] || die "the destination's parent directory does not exist: $PARENT"

# A restore rehearsal must never land inside the app's live data folder.
case "$(realpath -m -- "$DEST")/" in
    "$ROOT_DIR/data/"*) die "destination is inside the live data folder ($ROOT_DIR/data); choose a scratch location" ;;
esac

STAGE="$(mktemp -d "$PARENT/.expense_restore_stage.XXXXXX")" || die "cannot create a staging folder in $PARENT"
trap 'rm -rf -- "$STAGE"' EXIT

tar -xzf "$ARCHIVE" -C "$STAGE" --no-same-owner --no-same-permissions || die "extraction failed (disk full or damaged archive)"

# Only plain files and folders belong in a data backup. A link could point the checks at a
# file outside the backup, and a FIFO would block them forever.
odd="$(find "$STAGE" ! -type f ! -type d -print -quit)"
[[ -z "$odd" ]] || die "archive contains a link or special file (${odd#"$STAGE"/}); refusing to restore it"

# ── validate what came out ───────────────────────────────────────────────────
if ! summary="$(python3 - "$STAGE/data" <<'PY' 2>&1
import csv, json, os, sys

root = sys.argv[1]

def fail(msg):
    print(msg)
    sys.exit(1)

def read_rows(path):
    # The app reads UTF-8 first and falls back to ISO-8859-1; do the same.
    for enc in ("utf-8-sig", "latin-1"):
        try:
            with open(path, newline="", encoding=enc) as fh:
                return [r for r in csv.reader(fh) if r]
        except UnicodeDecodeError:
            continue
    return []

def check_csv(path, label, require_rows):
    try:
        rows = read_rows(path)
    except (csv.Error, OSError) as exc:
        fail(f"{label} could not be read ({exc})")
    if not rows:
        fail(f"{label} is empty (no header)")
    header, body = rows[0], rows[1:]
    if require_rows and not body:
        fail(f"{label} has a header but no data rows")
    for n, row in enumerate(body, start=2):
        if len(row) != len(header):
            fail(f"{label} line {n} has {len(row)} columns, the header has {len(header)} columns")
    return len(body)

expense_rows = check_csv(os.path.join(root, "expense_database.csv"), "expense_database.csv", True)

joint = os.path.join(root, "expense_database_joint.csv")
if os.path.exists(joint):
    check_csv(joint, "expense_database_joint.csv", False)

for dirpath, _, files in os.walk(root):
    for name in files:
        if name.endswith(".json"):
            p = os.path.join(dirpath, name)
            try:
                with open(p, encoding="utf-8") as fh:
                    json.load(fh)
            except (ValueError, OSError) as exc:
                fail(f"{name} is not valid JSON ({exc})")

print(expense_rows)
PY
)"; then
    die "$summary"
fi

# ── move into place ──────────────────────────────────────────────────────────
if [[ -d "$DEST" ]]; then rmdir -- "$DEST" || die "could not replace the empty destination folder: $DEST"; fi
mv -T -- "$STAGE" "$DEST" || die "could not move the restored files into $DEST"
file_count="$(find "$DEST" -type f | wc -l)"

echo "RESTORE OK: ${file_count} files, ${summary} expense rows, restored to ${DEST}"

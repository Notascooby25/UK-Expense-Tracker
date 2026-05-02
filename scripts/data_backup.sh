#!/usr/bin/env bash
# data_backup.sh — timestamped backup of expense tracker runtime data.
#
# Run BEFORE any code update or before stopping for cutover.
#
# Usage:
#   ./scripts/data_backup.sh [output_dir]
#
# Defaults:
#   OUTPUT_DIR = /srv/shared/backups/expense_tracker
#   DATA_DIR   = ./data  (relative to project root)
#
# Backup includes:
#   data/expense_database.csv
#   data/settings.json
#   data/saved_filters.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

OUTPUT_DIR="${1:-/srv/shared/backups/expense_tracker}"
DATA_DIR="${ROOT_DIR}/data"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="${OUTPUT_DIR}/expense_tracker_data_${TIMESTAMP}.tar.gz"

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[data_backup] $*"; }

mkdir -p "${OUTPUT_DIR}" || die "Cannot create output directory: ${OUTPUT_DIR}"

declare -a FILES_TO_BACKUP=()
for f in expense_database.csv settings.json saved_filters.json; do
    src="${DATA_DIR}/${f}"
    if [[ -f "$src" ]]; then
        FILES_TO_BACKUP+=("$src")
        info "Queued: $src"
    else
        info "WARNING: $src not found, skipping."
    fi
done

[[ ${#FILES_TO_BACKUP[@]} -eq 0 ]] && die "No runtime data files found to back up."

tar -czf "${ARCHIVE}" -C "${ROOT_DIR}" \
    $(for f in "${FILES_TO_BACKUP[@]}"; do echo "${f#$ROOT_DIR/}"; done)

CHECKSUM_FILE="${OUTPUT_DIR}/expense_tracker_data_${TIMESTAMP}.sha256"
sha256sum "${ARCHIVE}" > "${CHECKSUM_FILE}"

info "Archive:  ${ARCHIVE}"
info "Checksum: ${CHECKSUM_FILE}"
info "Backup complete."

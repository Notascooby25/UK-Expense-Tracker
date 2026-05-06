#!/usr/bin/env bash
# data_backup.sh — timestamped backup of expense tracker runtime data.
#
# Run BEFORE any code update or before stopping for cutover.
#
# Usage:
#   ./scripts/data_backup.sh [output_dir] [retention_count]
#
# Defaults:
#   OUTPUT_DIR = /srv/shared/backups/expense_tracker
#   RETENTION_COUNT = 4
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
RETENTION_COUNT="${2:-4}"
DATA_DIR="${ROOT_DIR}/data"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="${OUTPUT_DIR}/expense_tracker_data_${TIMESTAMP}.tar.gz"

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[data_backup] $*"; }

if ! [[ "${RETENTION_COUNT}" =~ ^[0-9]+$ ]] || [[ "${RETENTION_COUNT}" -lt 1 ]]; then
    die "retention_count must be a positive integer (got: ${RETENTION_COUNT})"
fi

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

mapfile -t ARCHIVE_FILES < <(
    find "${OUTPUT_DIR}" -maxdepth 1 -type f -name 'expense_tracker_data_*.tar.gz' -printf '%f\n' | sort -r
)

if [[ ${#ARCHIVE_FILES[@]} -gt ${RETENTION_COUNT} ]]; then
    for old_archive_name in "${ARCHIVE_FILES[@]:${RETENTION_COUNT}}"; do
        old_archive_path="${OUTPUT_DIR}/${old_archive_name}"
        old_checksum_path="${old_archive_path%.tar.gz}.sha256"
        rm -f -- "${old_archive_path}" "${old_checksum_path}"
        info "Pruned old backup: ${old_archive_path}"
    done
fi

mapfile -t CHECKSUM_FILES < <(
    find "${OUTPUT_DIR}" -maxdepth 1 -type f -name 'expense_tracker_data_*.sha256' -printf '%f\n' | sort -r
)

for checksum_name in "${CHECKSUM_FILES[@]}"; do
    archive_name="${checksum_name%.sha256}.tar.gz"
    archive_path="${OUTPUT_DIR}/${archive_name}"
    checksum_path="${OUTPUT_DIR}/${checksum_name}"
    if [[ ! -f "${archive_path}" ]]; then
        rm -f -- "${checksum_path}"
        info "Removed orphan checksum: ${checksum_path}"
    fi
done

info "Archive:  ${ARCHIVE}"
info "Checksum: ${CHECKSUM_FILE}"
info "Retention: keeping latest ${RETENTION_COUNT} backup(s)."
info "Backup complete."

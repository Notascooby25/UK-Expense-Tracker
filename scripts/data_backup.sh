#!/usr/bin/env bash
# data_backup.sh — timestamped backup of expense tracker runtime data.
#
# Run BEFORE any code update or before stopping for cutover, and daily from cron
# (see scripts/setup_backup_cron.sh).
#
# Usage:
#   ./scripts/data_backup.sh [output_dir] [retention_count]
#
# Defaults:
#   OUTPUT_DIR = /srv/shared/backups
#   RETENTION_COUNT = 14
#   DATA_DIR   = ./data  (relative to project root)
#
# The archive contains the whole data/ directory, so nothing has to be added here
# when the app grows a new runtime file. That currently means:
#   data/expense_database.csv        (required)
#   data/settings.json
#   data/saved_filters.json
#   data/expense_database_joint.csv  and  data/settings_joint.json  (joint account)
# .gitkeep and *.tmp / *.lock files are left out.
#
# NOT included, deliberately: .streamlit/secrets.toml. The Google copy of this
# archive must not carry credentials; keep secrets.toml in your password manager
# (the NAS folder mirror also holds a copy).
#
# Restore:  tar -xzf expense_tracker_data_<ts>.tar.gz -C /srv/UK-Expense-Tracker
# Verify:   cd <dir holding the archive> && sha256sum -c expense_tracker_data_<ts>.sha256
#
# The archive is built as a .tmp file, self-checked, and only then renamed into
# place, so a failed run never leaves something that looks like a good backup.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

OUTPUT_DIR="${1:-/srv/shared/backups}"
RETENTION_COUNT="${2:-14}"
DATA_DIR="${ROOT_DIR}/data"
MAIN_CSV="expense_database.csv"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE_NAME="expense_tracker_data_${TIMESTAMP}.tar.gz"
ARCHIVE="${OUTPUT_DIR}/${ARCHIVE_NAME}"
TMP_ARCHIVE="${ARCHIVE}.tmp"
CHECKSUM_FILE="${OUTPUT_DIR}/expense_tracker_data_${TIMESTAMP}.sha256"

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[data_backup] $*"; }

if ! [[ "${RETENTION_COUNT}" =~ ^[0-9]+$ ]] || [[ "${RETENTION_COUNT}" -lt 1 ]]; then
    die "retention_count must be a positive integer (got: ${RETENTION_COUNT})"
fi

mkdir -p "${OUTPUT_DIR}" || die "Cannot create output directory: ${OUTPUT_DIR}"

# A leftover .tmp from a crashed run must never be mistaken for a backup.
trap 'rm -f -- "${TMP_ARCHIVE}"' EXIT

[[ -f "${DATA_DIR}/${MAIN_CSV}" ]] || die "Required file not found: ${DATA_DIR}/${MAIN_CSV}"
for f in settings.json saved_filters.json; do
    [[ -f "${DATA_DIR}/${f}" ]] || info "WARNING: ${DATA_DIR}/${f} not found, it will not be in this backup."
done

tar -czf "${TMP_ARCHIVE}" -C "${ROOT_DIR}" \
    --exclude='data/.gitkeep' --exclude='data/*.tmp' --exclude='data/*.lock' \
    data

# --- self-check: refuse to promote an archive we could not read back ---------
members="$(tar -tzf "${TMP_ARCHIVE}")" || die "Archive is unreadable: ${TMP_ARCHIVE}"
grep -qx "data/${MAIN_CSV}" <<<"${members}" || die "Archive is missing data/${MAIN_CSV}"
src_header="$(head -n 1 "${DATA_DIR}/${MAIN_CSV}")"
# sed, not head: head exits after line 1, tar then dies of SIGPIPE, and pipefail
# would turn that into a failed backup for any CSV larger than the pipe buffer.
arc_header="$(tar -xzOf "${TMP_ARCHIVE}" "data/${MAIN_CSV}" | sed -n '1p')" \
    || die "Could not read data/${MAIN_CSV} back out of the archive"
[[ -n "${arc_header}" && "${arc_header}" == "${src_header}" ]] \
    || die "Archived ${MAIN_CSV} header does not match the source (empty or truncated copy)"

mv -- "${TMP_ARCHIVE}" "${ARCHIVE}"

# Basename in the checksum file, so `sha256sum -c` works wherever the pair is
# restored to (NAS, Google, a scratch dir) rather than only at the original path.
( cd "${OUTPUT_DIR}" && sha256sum "${ARCHIVE_NAME}" > "${CHECKSUM_FILE}" && sha256sum -c --quiet "${CHECKSUM_FILE}" ) \
    || die "Checksum verification failed for ${ARCHIVE}"

# --- retention ---------------------------------------------------------------
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
info "Contents: $(grep -vc '/$' <<<"${members}") file(s) from data/"
info "Retention: keeping latest ${RETENTION_COUNT} backup(s)."
info "Backup complete."

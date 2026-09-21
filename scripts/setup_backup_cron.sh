#!/usr/bin/env bash
# setup_backup_cron.sh — install/update cron job for periodic data backups.
#
# Usage:
#   ./scripts/setup_backup_cron.sh [output_dir] [retention_count] [cron_schedule]
#
# Defaults (these match what runs on the NUC):
#   output_dir      = /srv/shared/backups
#   retention_count = 14
#   cron_schedule   = 0 3 * * *      (daily at 03:00)
#
# Safe to re-run. It replaces its own "BEGIN/END expense_tracker_data_backup" block
# AND any hand-written crontab line that already calls scripts/data_backup.sh, so
# adopting this script on a host with a manually edited crontab does not leave two
# jobs running side by side.
#
# The cron log goes next to the archives (<output_dir>/expense_tracker_backup_cron.log),
# which is where the NUC's Google and NAS jobs already look.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

OUTPUT_DIR="${1:-/srv/shared/backups}"
RETENTION_COUNT="${2:-14}"
CRON_SCHEDULE="${3:-0 3 * * *}"

BACKUP_SCRIPT="${ROOT_DIR}/scripts/data_backup.sh"
LOG_FILE="${OUTPUT_DIR}/expense_tracker_backup_cron.log"

CRON_BEGIN="# BEGIN expense_tracker_data_backup"
CRON_END="# END expense_tracker_data_backup"

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[setup_backup_cron] $*"; }

[[ -x "${BACKUP_SCRIPT}" ]] || die "Backup script not found or not executable: ${BACKUP_SCRIPT}"
command -v crontab >/dev/null 2>&1 || die "crontab command not found. Install cron first."

if ! [[ "${RETENTION_COUNT}" =~ ^[0-9]+$ ]] || [[ "${RETENTION_COUNT}" -lt 1 ]]; then
    die "retention_count must be a positive integer (got: ${RETENTION_COUNT})"
fi

# read -ra, not an unquoted expansion: the '*' fields would be glob-expanded
# against whatever files sit in the current directory and miscount.
read -ra SCHEDULE_FIELDS <<<"${CRON_SCHEDULE}"
[[ ${#SCHEDULE_FIELDS[@]} -eq 5 ]] \
    || die "cron_schedule must have exactly 5 fields (got ${#SCHEDULE_FIELDS[@]}: ${CRON_SCHEDULE})"

mkdir -p "${OUTPUT_DIR}" || die "Cannot create output directory: ${OUTPUT_DIR}"

printf -v BACKUP_SCRIPT_Q '%q' "${BACKUP_SCRIPT}"
printf -v OUTPUT_DIR_Q '%q' "${OUTPUT_DIR}"
printf -v LOG_FILE_Q '%q' "${LOG_FILE}"

CRON_LINE="${CRON_SCHEDULE} ${BACKUP_SCRIPT_Q} ${OUTPUT_DIR_Q} ${RETENTION_COUNT} >> ${LOG_FILE_Q} 2>&1"

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

if crontab -l >/dev/null 2>&1; then
    # Drop our managed block, plus any un-managed, non-comment line that runs the script.
    crontab -l | awk -v begin="${CRON_BEGIN}" -v end="${CRON_END}" -v script="scripts/data_backup.sh" '
        $0 == begin { skip = 1; next }
        $0 == end { skip = 0; next }
        skip == 1 { next }
        $0 !~ /^[[:space:]]*#/ && index($0, script) { next }
        { print }
    ' > "${TMP_FILE}"
else
    : > "${TMP_FILE}"
fi

{
    echo "${CRON_BEGIN}"
    echo "${CRON_LINE}"
    echo "${CRON_END}"
} >> "${TMP_FILE}"

crontab "${TMP_FILE}"

info "Installed cron job:"
info "  ${CRON_LINE}"
info "Cron block currently configured:"
crontab -l | awk -v begin="${CRON_BEGIN}" -v end="${CRON_END}" '
    $0 == begin { show = 1 }
    show == 1 { print }
    $0 == end { show = 0 }
'

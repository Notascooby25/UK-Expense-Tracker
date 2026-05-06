#!/usr/bin/env bash
# setup_backup_cron.sh — install/update cron job for periodic data backups.
#
# Usage:
#   ./scripts/setup_backup_cron.sh [output_dir] [retention_count] [cron_schedule]
#
# Defaults:
#   output_dir      = /srv/shared/backups/expense_tracker
#   retention_count = 4
#   cron_schedule   = 0 3 */4 * *

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

OUTPUT_DIR="${1:-/srv/shared/backups/expense_tracker}"
RETENTION_COUNT="${2:-4}"
CRON_SCHEDULE="${3:-0 3 */4 * *}"

BACKUP_SCRIPT="${ROOT_DIR}/scripts/data_backup.sh"
LOG_DIR="${ROOT_DIR}/logs"
LOG_FILE="${LOG_DIR}/data_backup_cron.log"

CRON_BEGIN="# BEGIN expense_tracker_data_backup"
CRON_END="# END expense_tracker_data_backup"

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[setup_backup_cron] $*"; }

[[ -x "${BACKUP_SCRIPT}" ]] || die "Backup script not found or not executable: ${BACKUP_SCRIPT}"
command -v crontab >/dev/null 2>&1 || die "crontab command not found. Install cron first."

if ! [[ "${RETENTION_COUNT}" =~ ^[0-9]+$ ]] || [[ "${RETENTION_COUNT}" -lt 1 ]]; then
    die "retention_count must be a positive integer (got: ${RETENTION_COUNT})"
fi

mkdir -p "${LOG_DIR}"

printf -v BACKUP_SCRIPT_Q '%q' "${BACKUP_SCRIPT}"
printf -v OUTPUT_DIR_Q '%q' "${OUTPUT_DIR}"
printf -v LOG_FILE_Q '%q' "${LOG_FILE}"

CRON_LINE="${CRON_SCHEDULE} ${BACKUP_SCRIPT_Q} ${OUTPUT_DIR_Q} ${RETENTION_COUNT} >> ${LOG_FILE_Q} 2>&1"

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

if crontab -l >/dev/null 2>&1; then
    crontab -l | awk -v begin="${CRON_BEGIN}" -v end="${CRON_END}" '
        $0 == begin { skip = 1; next }
        $0 == end { skip = 0; next }
        skip != 1 { print }
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

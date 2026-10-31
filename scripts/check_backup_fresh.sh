#!/usr/bin/env bash
# check_backup_fresh.sh — fail loudly when the newest expense tracker backup is missing,
# too old, or does not match its checksum.
#
# The nightly job (scripts/data_backup.sh) can fail silently: it did for weeks when the
# data files became unreadable to the user running cron. Run this from any scheduler or
# monitor you already have and alert on a non-zero exit.
#
# Usage:
#   ./scripts/check_backup_fresh.sh [backup_dir] [max_age_hours]
#
# Defaults:
#   backup_dir     = /srv/shared/backups
#   max_age_hours  = 26   (a daily job plus slack)
#
# Exit codes: 0 fresh and verified, 1 stale / missing / checksum mismatch, 2 bad usage.

set -euo pipefail

BACKUP_DIR="${1:-/srv/shared/backups}"
MAX_AGE_HOURS="${2:-26}"

info() { echo "[check_backup_fresh] $*"; }
fail() { echo "[check_backup_fresh] STALE: $*" >&2; exit 1; }

if ! [[ "${MAX_AGE_HOURS}" =~ ^[0-9]+$ ]] || [[ "${MAX_AGE_HOURS}" -lt 1 ]]; then
    echo "[check_backup_fresh] max_age_hours must be a positive integer (got: ${MAX_AGE_HOURS})" >&2
    exit 2
fi
[[ -d "${BACKUP_DIR}" ]] || fail "backup directory not found: ${BACKUP_DIR}"

# Newest archive by modification time (GNU find, same assumption as data_backup.sh).
newest_line="$(
    find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'expense_tracker_data_*.tar.gz' \
        -printf '%T@ %f\n' | sort -rn | head -n 1
)"
[[ -n "${newest_line}" ]] || fail "no expense_tracker_data_*.tar.gz archive in ${BACKUP_DIR}"

newest_epoch="${newest_line%% *}"
newest_epoch="${newest_epoch%.*}"
newest_name="${newest_line#* }"
age_seconds=$(( $(date +%s) - newest_epoch ))
age_hours=$(( age_seconds / 3600 ))

if [[ ${age_seconds} -gt $(( MAX_AGE_HOURS * 3600 )) ]]; then
    fail "newest archive ${newest_name} is ${age_hours}h old (limit ${MAX_AGE_HOURS}h)"
fi

[[ -s "${BACKUP_DIR}/${newest_name}" ]] || fail "${newest_name} is empty"

checksum_file="${BACKUP_DIR}/${newest_name%.tar.gz}.sha256"
[[ -f "${checksum_file}" ]] || fail "no checksum file for ${newest_name}"
( cd "${BACKUP_DIR}" && sha256sum -c --quiet "$(basename "${checksum_file}")" ) \
    || fail "checksum mismatch for ${newest_name}"

tar -tzf "${BACKUP_DIR}/${newest_name}" > /dev/null 2>&1 || fail "${newest_name} is not a readable archive"

info "OK: ${newest_name} is ${age_hours}h old and verified."

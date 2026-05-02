#!/usr/bin/env bash
# cutover_runbook.sh — Expense Tracker: NAS (DS223) → NUC migration execution sheet.
#
# Run this script ON THE NUC. It guides you through each phase interactively
# so nothing happens automatically without your explicit confirmation.
#
# Prerequisites (complete these before running):
#   1. Clone the repo on the NUC:
#        git clone https://github.com/Notascooby25/UK-Expense-Tracker.git
#   2. Create .streamlit/secrets.toml from the example template and fill in your credentials.
#   3. Ensure podman and podman-compose are installed on the NUC.
#   4. Set NAS_DATA_SRC to the path of runtime files on the NAS (see below).
#
# Usage:
#   # If the NAS is accessible over SSH from the NUC:
#   NAS_DATA_SRC="user@192.168.x.x:/volume1/docker/expense_tracker" ./scripts/cutover_runbook.sh
#
#   # If you've already copied the files to a local directory:
#   NAS_DATA_SRC="/tmp/nas_data" ./scripts/cutover_runbook.sh
#
#   # Or just run it and you'll be prompted to enter the source path interactively.
#   ./scripts/cutover_runbook.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="${ROOT_DIR}/data"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
SNAPSHOT_DIR="${ROOT_DIR}/.cutover_snapshot_${TIMESTAMP}"

NAS_DATA_SRC="${NAS_DATA_SRC:-}"

die()  { echo ""; echo "ABORT: $*" >&2; exit 1; }
info() { echo "[cutover] $*"; }
ask()  {
    local prompt="$1"
    local ans
    read -r -p "[cutover] ${prompt} [y/N] " ans
    [[ "${ans,,}" == "y" ]]
}

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   Expense Tracker: NAS → NUC Cutover Runbook                    ║"
echo "║   $(date '+%Y-%m-%d %H:%M:%S')                                        ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── Phase 0: prerequisites ─────────────────────────────────────────────────────
info "Phase 0: Checking prerequisites..."

command -v podman >/dev/null 2>&1 \
    || die "podman not found. Install it first: https://podman.io/getting-started/installation"

command -v podman-compose >/dev/null 2>&1 \
    || die "podman-compose not found. Install: pip install podman-compose"

[[ -f "${ROOT_DIR}/docker-compose.yml" ]] \
    || die "docker-compose.yml not found at ${ROOT_DIR}. Is this the right directory?"

[[ -f "${ROOT_DIR}/.streamlit/secrets.toml" ]] \
    || die ".streamlit/secrets.toml missing. Copy from .streamlit/secrets.toml.example and fill in your credentials."

[[ -x "${ROOT_DIR}/scripts/podman-compose.sh" ]] \
    || die "scripts/podman-compose.sh not executable. Run: chmod +x scripts/*.sh"

info "Prerequisites OK."
echo ""

# ── Phase 1: in-app save on NAS ────────────────────────────────────────────────
info "Phase 1: Ensure NAS app data is fully saved."
echo ""
echo "  Before continuing:"
echo "    1. Open the NAS app in your browser."
echo "    2. If 'Save New Transactions to Disk' is shown at the bottom of Tab 1, click it."
echo "    3. Open the sidebar and click 'Save Database to Disk'."
echo "    4. Confirm no unsaved warnings remain."
echo ""
ask "NAS app data has been saved to disk?" || die "Please save the NAS app data first, then re-run."

# ── Phase 2: stop NAS container ────────────────────────────────────────────────
echo ""
info "Phase 2: Stop the NAS container to freeze writes."
echo ""
echo "  In Synology Container Manager:"
echo "    - Find the 'uk_expense_tracker' container."
echo "    - Click Stop."
echo ""
ask "NAS container is stopped?" || die "Stop the NAS container before continuing."

# ── Phase 3: gather source path ────────────────────────────────────────────────
echo ""
info "Phase 3: Gather source-of-truth files."

if [[ -z "${NAS_DATA_SRC}" ]]; then
    echo ""
    echo "  Enter the path to the NAS runtime files."
    echo "  Examples:"
    echo "    SSH:   user@192.168.1.x:/volume1/docker/expense_tracker"
    echo "    Local: /mnt/nas/expense_tracker"
    echo ""
    read -r -p "[cutover] NAS source path: " NAS_DATA_SRC
fi

[[ -z "${NAS_DATA_SRC}" ]] && die "No source path provided."
info "Source: ${NAS_DATA_SRC}"

# ── Phase 4: copy to snapshot ──────────────────────────────────────────────────
echo ""
info "Phase 4: Copying files to local snapshot (does not yet touch data/)..."

mkdir -p "${SNAPSHOT_DIR}"
info "Snapshot dir: ${SNAPSHOT_DIR}"

SOURCE_FILES=(expense_database.csv settings.json saved_filters.json)
COPIED=0

for FILE in "${SOURCE_FILES[@]}"; do
    SRC_PATH="${NAS_DATA_SRC%/}/${FILE}"
    DEST_PATH="${SNAPSHOT_DIR}/${FILE}"

    info "Copying ${FILE}..."
    if [[ "${NAS_DATA_SRC}" == *@*:* ]]; then
        scp "${SRC_PATH}" "${DEST_PATH}" \
            && COPIED=$(( COPIED + 1 )) \
            || info "WARNING: Could not copy ${FILE} — skipping."
    else
        if [[ -f "${SRC_PATH}" ]]; then
            cp "${SRC_PATH}" "${DEST_PATH}"
            COPIED=$(( COPIED + 1 ))
        else
            info "WARNING: ${FILE} not found at ${SRC_PATH} — skipping."
        fi
    fi
done

[[ ${COPIED} -gt 0 ]] || die "No files were copied from source. Check NAS_DATA_SRC and try again."

# Generate checksums
(cd "${SNAPSHOT_DIR}" && sha256sum ./*.csv ./*.json > checksums.sha256 2>/dev/null || true)
info "Snapshot checksums:"
cat "${SNAPSHOT_DIR}/checksums.sha256" 2>/dev/null || true

# ── Phase 5: pre-install parity baseline ──────────────────────────────────────
echo ""
info "Phase 5: Recording pre-install parity baseline..."

SNAPSHOT_DB="${SNAPSHOT_DIR}/expense_database.csv"
if [[ -f "${SNAPSHOT_DB}" ]]; then
    PRE_ROWS=$(( $(wc -l < "${SNAPSHOT_DB}") - 1 ))
    PRE_MAX_DATE=$(awk -F',' 'NR>1 && $1!="" {print $1}' "${SNAPSHOT_DB}" | sort | tail -n1)
    info "Pre-install row count : ${PRE_ROWS}"
    info "Pre-install max date  : ${PRE_MAX_DATE}"
else
    info "WARNING: expense_database.csv not in snapshot — skipping row count."
    PRE_ROWS=-1
    PRE_MAX_DATE="unknown"
fi

# ── Phase 6: install into NUC data/ ───────────────────────────────────────────
echo ""
info "Phase 6: Install snapshot into NUC runtime location (${DATA_DIR})."
echo ""
ask "Confirm: copy snapshot files into ${DATA_DIR}?" || die "Aborted by user."

mkdir -p "${DATA_DIR}"

for FILE in "${SOURCE_FILES[@]}"; do
    SRC="${SNAPSHOT_DIR}/${FILE}"
    DEST="${DATA_DIR}/${FILE}"
    if [[ -f "${SRC}" ]]; then
        cp "${SRC}" "${DEST}"
        info "Installed: ${DEST}"
    fi
done

# ── Phase 7: post-install parity check ────────────────────────────────────────
echo ""
info "Phase 7: Post-install parity check..."

INSTALLED_DB="${DATA_DIR}/expense_database.csv"

if [[ -f "${INSTALLED_DB}" && ${PRE_ROWS} -ge 0 ]]; then
    POST_ROWS=$(( $(wc -l < "${INSTALLED_DB}") - 1 ))
    POST_MAX_DATE=$(awk -F',' 'NR>1 && $1!="" {print $1}' "${INSTALLED_DB}" | sort | tail -n1)

    info "Post-install row count : ${POST_ROWS}"
    info "Post-install max date  : ${POST_MAX_DATE}"

    if [[ "${PRE_ROWS}" -eq "${POST_ROWS}" ]]; then
        info "✓ Row count matches (${PRE_ROWS} rows)."
    else
        die "Row count MISMATCH — Pre: ${PRE_ROWS}, Post: ${POST_ROWS}. Do NOT start the NUC app."
    fi

    [[ "${PRE_MAX_DATE}" == "${POST_MAX_DATE}" ]] \
        && info "✓ Max date matches (${PRE_MAX_DATE})." \
        || info "WARNING: Max date differs. Pre: ${PRE_MAX_DATE}, Post: ${POST_MAX_DATE}. Investigate before proceeding."
fi

info "Verifying file checksums..."
for FILE in "${SOURCE_FILES[@]}"; do
    ORIG="${SNAPSHOT_DIR}/${FILE}"
    INSTALLED="${DATA_DIR}/${FILE}"
    if [[ -f "${ORIG}" && -f "${INSTALLED}" ]]; then
        ORIG_SUM="$(sha256sum "${ORIG}" | cut -d' ' -f1)"
        INST_SUM="$(sha256sum "${INSTALLED}" | cut -d' ' -f1)"
        if [[ "${ORIG_SUM}" == "${INST_SUM}" ]]; then
            info "✓ ${FILE}: checksum OK"
        else
            die "CHECKSUM MISMATCH for ${FILE}. Data integrity issue — do NOT start the NUC app."
        fi
    fi
done

# ── Phase 8: start NUC container ──────────────────────────────────────────────
echo ""
info "Phase 8: Start the NUC app via Podman compose."
echo ""
ask "Confirm: build and start expense tracker on NUC?" || die "Aborted by user."

cd "${ROOT_DIR}"
./scripts/podman-compose.sh up -d --build

info "Container started. Waiting 15 seconds for Streamlit to initialise..."
sleep 15

# ── Phase 9: functional validation checklist ──────────────────────────────────
echo ""
info "Phase 9: Manual functional validation."
echo ""
echo "  Complete each check in your browser at http://localhost:8501"
echo ""
echo "  [ ] 1. Log in with credentials from .streamlit/secrets.toml."
echo "  [ ] 2. Sidebar → 'Startup Health' reports no errors."
echo "  [ ] 3. Dashboard tab loads and shows your transaction history."
echo "  [ ] 4. Export tab — load a saved filter preset (if you have any)."
echo "  [ ] 5. Add ONE manual test transaction, click 'Save Database to Disk',"
echo "         confirm the row count incremented by 1."
echo "         (Remove the test row via the Data Editor tab afterwards if desired.)"
echo ""
ask "All functional checks passed?" || {
    info "Validation failed. Stopping NUC container."
    ./scripts/podman-compose.sh down
    echo ""
    die "Cutover halted. Your data snapshot is preserved at: ${SNAPSHOT_DIR}"
}

# ── Phase 10: cutover complete ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   ✓ Cutover COMPLETE                                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
info "Data snapshot preserved at: ${SNAPSHOT_DIR}"
info "Keep the NAS container stopped as a read-only rollback for at least 7 days."
info "After the retention window, decommission the NAS container."
echo ""
echo "  Day-to-day NUC commands:"
echo "    Start/rebuild : ./scripts/podman-compose.sh up -d --build"
echo "    Stop          : ./scripts/podman-compose.sh down"
echo "    View logs     : ./scripts/podman-compose.sh logs -f"
echo "    Backup data   : ./scripts/data_backup.sh"
echo "    Code watcher  : ./scripts/watcher_commit_open.sh ."
echo ""

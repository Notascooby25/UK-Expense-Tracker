# Expense Data Restore Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `scripts/restore_data_backup.sh`, a safe, tested way to restore a backup archive into a scratch folder and prove it is complete and usable, so a restore of the expense data has been rehearsed before it is needed.

**Architecture:** A bash script that takes an archive (or `--latest`) from the backup directory, verifies its checksum and structure, extracts into a new empty directory (never over live data), and validates the extracted files (CSV shape, JSON parse). Covered by a hermetic fixture test in the existing `scripts/tests/` style.

**Tech Stack:** bash, GNU coreutils/tar, python3 (already required by `test_data_backup.sh`), existing `scripts/tests/lib.sh`.

**Spec:** Phase 1 of the owner-approved backup master plan (agreed in chat 2026-11-13, no separate spec file). Behaviour is defined in the tasks below.

## Global Constraints

- Public repo: no hostnames, IP addresses, account names, NAS details or secrets in any file or fixture. Test data is synthetic.
- The script must never write inside the app's live `data/` folder. It refuses a destination that exists and is non-empty, and the default destination is a new temp directory.
- It must never read or copy `.streamlit/secrets.toml`.
- Follow `data_backup.sh` style: `set -euo pipefail`, `die()` / `info()` helpers, `[restore_data_backup]` log prefix.
- Archive layout and checksum format are those produced by `scripts/data_backup.sh`: `expense_tracker_data_<ts>.tar.gz` with a sibling `expense_tracker_data_<ts>.sha256` holding a bare filename; contents under `data/`.
- Older archives (before the 2026-09-21 change) hold only three files and no joint-account files: the script must accept them (joint files are checked only when present).
- This change touches `.github/workflows/checks.yml`. Tell the owner in the PR change record.

## Review Focus

- Checksum file missing or does not match: refuse, extract nothing.
- Archive truncated or not a gzip tarball: refuse with a clear message, no partial destination left behind.
- Main CSV has a header but zero data rows, or a row with a different column count to the header: fail.
- A settings JSON file that does not parse: fail, naming the file.
- Destination already exists and has files in it: refuse, leave it untouched.

---

### Task 1: Fixture test (written first, fails because the script does not exist)

**Files:**
- Create: `scripts/tests/test_restore_data_backup.sh`

**Interfaces:**
- Consumes: `scripts/tests/lib.sh`; `scripts/data_backup.sh` (to produce real archives for fixtures); the script under test at `scripts/restore_data_backup.sh`.
- Produces: a `mk_archive` helper that builds a valid backup in a temp dir using `data_backup.sh` against a temp repo (as `test_data_backup.sh` does with `mk_repo`).

- [ ] **Step 1: Write the test with these named cases** (each `check`; the script is run as `restore_data_backup.sh <archive> [--dest DIR]` or `--latest --backup-dir DIR [--dest DIR]`):
  - `valid archive restores`: exit 0, output contains `RESTORE OK`, destination contains `data/expense_database.csv` and the joint files, files are byte-identical to the source (`cmp -s`).
  - `--latest picks the newest of several archives`.
  - `default destination is a new temp dir and is printed`.
  - `old-style archive without joint files` (build with only the three main files): exit 0.
  - `checksum mismatch` (flip a byte in the archive): exit 1, destination not created.
  - `checksum file missing`: exit 1.
  - `truncated archive` (`head -c 100`): exit 1, no destination directory left behind.
  - `not a tarball` (text file with matching checksum): exit 1.
  - `archive without data/expense_database.csv`: exit 1.
  - `header-only main CSV`: exit 1, output contains `no data rows`.
  - `ragged CSV row` (extra column): exit 1, output contains `columns`.
  - `invalid settings.json`: exit 1, output names `settings.json`.
  - `destination exists and non-empty`: exit 1, existing file untouched (`cmp`).
  - `live data folder untouched`: modification time and checksums of the temp repo's `data/` are unchanged after every run.
  - `no secrets read`: archive containing a `secrets.toml` member is restored without it being extracted (or the script refuses it), and the destination has no `secrets.toml`.

- [ ] **Step 2: Run it**

Run: `bash scripts/tests/test_restore_data_backup.sh`
Expected: FAIL (script not found).

- [ ] **Step 3: Commit**

```bash
git add scripts/tests/test_restore_data_backup.sh
git commit -m "test(backup): fixture tests for restore_data_backup.sh (failing, script not yet written)"
```

### Task 2: Implement `scripts/restore_data_backup.sh`

**Files:**
- Create: `scripts/restore_data_backup.sh` (mode 755)

**Interfaces:**
- Produces: CLI `restore_data_backup.sh (<archive> | --latest [--backup-dir DIR]) [--dest DIR]`. `--backup-dir` default `/srv/shared/backups`. Exit 0 and final line `RESTORE OK: <n> files, <rows> expense rows, restored to <dest>` on success; exit 1 with `RESTORE FAILED: <reason>` otherwise; exit 2 on bad usage.

- [ ] **Step 1: Argument parsing and archive selection.** `--latest` picks the newest `expense_tracker_data_*.tar.gz` by name (same sort as `data_backup.sh`); a positional archive path is used as given.

- [ ] **Step 2: Verify before extracting.** `sha256sum -c --quiet` run from the archive's directory against its sibling `.sha256`; `tar -tzf` must succeed; member list must contain `data/expense_database.csv`; reject any member path that is absolute or contains `..` or ends in `secrets.toml`.

- [ ] **Step 3: Extract into a staging directory** next to the destination (or in temp), validate there, then move into place, so a failed run leaves no destination behind. Refuse an existing non-empty destination.

- [ ] **Step 4: Validate content** using one `python3 - <<'PY'` block: main CSV parses with `csv`, has a header, at least one data row, every row has the header's column count; the joint CSV gets the same checks when present; every `*.json` under `data/` parses.

- [ ] **Step 5: Run the fixture test**

Run: `bash scripts/tests/test_restore_data_backup.sh`
Expected: `failed=0`.

- [ ] **Step 6: Lint**

Run: `shellcheck scripts/restore_data_backup.sh scripts/tests/test_restore_data_backup.sh` (if installed; otherwise `bash -n` and say shellcheck was not run).
Expected: no findings.

- [ ] **Step 7: Commit**

```bash
git add scripts/restore_data_backup.sh
git commit -m "feat(backup): restore_data_backup.sh restores into a scratch folder and validates it"
```

### Task 3: CI and docs

**Files:**
- Modify: `.github/workflows/checks.yml` (the `Run script tests` step, which lists `test_check_backup_fresh.sh`, `test_data_backup.sh`, `test_preview.sh`)
- Modify: the doc that currently describes restore with `tar -xzf` (find with `grep -rn "tar -xzf" --include=*.md .`)

- [ ] **Step 1:** Add `bash scripts/tests/test_restore_data_backup.sh` to the CI step.
- [ ] **Step 2:** Update the restore doc: rehearse with `scripts/restore_data_backup.sh --latest` (scratch folder), then the real restore commands; mention the old-archive limitation.
- [ ] **Step 3: Run everything CI runs**

Run: the project's test command from `.github/workflows/checks.yml` plus the four script tests and the lint step.
Expected: all pass; paste the last lines of each into the PR.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/checks.yml <doc path>
git commit -m "ci(backup): run restore script test; document restore rehearsal"
```

### After merge (owner steps, separate approval)

- On the live server: `git pull` in the expense checkout, then `scripts/restore_data_backup.sh --latest`. Expect `RESTORE OK` with the real row count, extracted to a temp folder that you can delete afterwards. This does not stop or touch the running app.

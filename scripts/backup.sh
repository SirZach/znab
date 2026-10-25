#!/usr/bin/env bash
#
# Nightly backup: dump the DB, prune old dumps, mirror the kept daily dumps
# offsite. Run by znab-backup.timer; `bun run backup` runs it now.
#
# Local retention (grandfather/father/son) for znab-daily-*.dump: the newest
# ZNAB_KEEP_DAILY (14), plus the newest of each of the ZNAB_KEEP_WEEKLY (8)
# newest ISO weeks, plus the newest of each of the ZNAB_KEEP_MONTHLY (12)
# newest months. deploy.sh's znab-predeploy-*.dump are kept to the newest
# ZNAB_KEEP_PREDEPLOY (10) and never uploaded.
#
# The remote (ZNAB_BACKUP_REMOTE, default dropbox:znab-backups) is an
# `rclone sync` of the kept daily dumps only, so it prunes the same way and
# nothing else under it is touched. Dumps are not encrypted.
#
# With ZNAB_BACKUP_PUSH_URL set, reports up or down to an Uptime Kuma push
# monitor. To restore a dump:
#
#   docker exec -i znab-postgres-1 pg_restore -U znab -d znab --clean --if-exists < <file>.dump

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/backup-lib.sh
. "$ROOT/scripts/backup-lib.sh"
REMOTE="${ZNAB_BACKUP_REMOTE-dropbox:znab-backups}"
PUSH_URL="${ZNAB_BACKUP_PUSH_URL:-}"
KEEP_DAILY="${ZNAB_KEEP_DAILY:-14}"
KEEP_WEEKLY="${ZNAB_KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${ZNAB_KEEP_MONTHLY:-12}"
KEEP_PREDEPLOY="${ZNAB_KEEP_PREDEPLOY:-10}"

current="starting"
started="$(now_ms)"

on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "    FAILED: $current" >&2
    push "$PUSH_URL" down "backup failed: $current"
  fi
}
trap on_exit EXIT
trap 'exit 143' INT TERM

run() { current="$1"; step "$1"; }

main() {
  local n
  for n in "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY" "$KEEP_PREDEPLOY"; do
    [[ "$n" =~ ^[0-9]+$ ]] || { echo "    retention counts must be whole numbers" >&2; return 1; }
  done
  # Zero dailies would let the prune delete tonight's dump before it is synced.
  [ "$KEEP_DAILY" -ge 1 ] || { echo "    ZNAB_KEEP_DAILY must be at least 1" >&2; return 1; }

  run "Dumping the database"
  local name
  name="znab-daily-$(date +%Y%m%d-%H%M%S).dump"
  dump_db "$BACKUP_DIR/$name"

  run "Pruning daily dumps"
  local all keep
  all="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'znab-daily-*.dump' -printf '%f\n' | LC_ALL=C sort)"
  keep="$(gfs_keep "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY" <<<"$all" | LC_ALL=C sort)"
  if ! grep -qxF "$name" <<<"$keep"; then
    echo "    retention would drop the dump just taken; not pruning" >&2
    return 1
  fi
  prune "$(LC_ALL=C comm -23 <(printf '%s\n' "$all") <(printf '%s\n' "$keep"))"

  run "Pruning pre-deploy dumps"
  # znab-YYYYMMDD-HHMMSS.dump is deploy.sh's name from before the rename.
  # Sorted on the timestamp, so old and new names interleave by age.
  prune "$(find "$BACKUP_DIR" -maxdepth 1 -type f -regextype posix-extended \
      -regex '.*/znab-(predeploy-)?[0-9]{8}-[0-9]{6}\.dump' -printf '%f\n' \
    | sed -E 's/^(.*([0-9]{8}-[0-9]{6})\.dump)$/\2 \1/' | LC_ALL=C sort -r \
    | tail -n +"$((KEEP_PREDEPLOY + 1))" | cut -d' ' -f2)"

  local count size offsite=""
  count="$(wc -l <<<"$keep")"
  size="$(du -h "$BACKUP_DIR/$name" | cut -f1)"

  if [ -n "$REMOTE" ]; then
    run "Syncing daily dumps to $REMOTE"
    # The filter limits both what is copied and what sync may delete on the
    # remote, so only top level znab-daily-*.dump files there are managed.
    rclone sync "$BACKUP_DIR" "$REMOTE" --include '/znab-daily-*.dump' --stats-one-line -v
  else
    step "ZNAB_BACKUP_REMOTE is empty; not syncing offsite"
    offsite=", NOT offsite"
  fi

  current="reporting"
  echo
  echo "Backed up: $name ($size), $count daily dumps kept$offsite"
  push "$PUSH_URL" up "$name $size, $count kept$offsite" "$(($(now_ms) - started))"
}

# prune <newline separated filenames>: delete them from BACKUP_DIR.
prune() {
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    rm -f -- "${BACKUP_DIR:?}/$f"
    echo "    removed $f"
  done <<<"$1"
}

main "$@"

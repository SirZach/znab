#!/usr/bin/env bash
#
# Proves the newest daily dump restores: loads it into a scratch database
# (znab_restore_check, same container) and compares row counts of the key
# tables with the live DB. The live DB moves on after the dump, so each count
# must be above zero and within max(ZNAB_RESTORE_TOLERANCE_ROWS (50),
# ZNAB_RESTORE_TOLERANCE_PCT (1)% of live) of the live count. Also fails when
# the newest dump is older than ZNAB_RESTORE_MAX_AGE_HOURS (48), so a stalled
# backup cannot keep passing on an old file.
#
# The scratch database is dropped on every exit. Run by
# znab-restore-check.timer; `bun run backup:check` runs it now. With
# ZNAB_RESTORE_PUSH_URL set, reports up or down to an Uptime Kuma push monitor.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/backup-lib.sh
. "$ROOT/scripts/backup-lib.sh"
PUSH_URL="${ZNAB_RESTORE_PUSH_URL:-}"
SCRATCH="znab_restore_check"
TABLES=(transactions accounts categories monthly_budgets payees)
TOL_ROWS="${ZNAB_RESTORE_TOLERANCE_ROWS:-50}"
TOL_PCT="${ZNAB_RESTORE_TOLERANCE_PCT:-1}"
MAX_AGE_HOURS="${ZNAB_RESTORE_MAX_AGE_HOURS:-48}"

current="starting"
started="$(now_ms)"

sql() { docker exec -e PGOPTIONS=-cclient_min_messages=warning "$CONTAINER" psql -U znab -d "$1" -v ON_ERROR_STOP=1 -qAt -c "$2"; }
drop_scratch() { sql postgres "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null; }

on_exit() {
  local rc=$?
  step "Dropping $SCRATCH"
  if ! drop_scratch; then
    echo "    could not drop $SCRATCH" >&2
    [ "$rc" -ne 0 ] || { current="dropping $SCRATCH"; rc=1; }
  fi
  if [ "$rc" -ne 0 ]; then
    echo "    FAILED: $current" >&2
    push "$PUSH_URL" down "restore check failed: $current"
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 143' INT TERM

run() { current="$1"; step "$1"; }

main() {
  run "Finding the newest daily dump"
  local dump age
  dump="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'znab-daily-*.dump' -printf '%f\n' | LC_ALL=C sort | tail -n 1)"
  if [ -z "$dump" ]; then
    echo "    no znab-daily-*.dump in $BACKUP_DIR" >&2
    return 1
  fi
  age=$(( ($(date +%s) - $(stat -c %Y "$BACKUP_DIR/$dump")) / 3600 ))
  echo "    $dump (${age}h old)"
  if [ "$age" -ge "$MAX_AGE_HOURS" ]; then
    current="newest dump is ${age}h old"
    return 1
  fi

  run "Restoring into $SCRATCH"
  drop_scratch
  sql postgres "CREATE DATABASE $SCRATCH" >/dev/null
  docker exec -i "$CONTAINER" pg_restore -U znab -d "$SCRATCH" --no-owner --exit-on-error < "$BACKUP_DIR/$dump"

  run "Comparing row counts"
  local t live restored margin bad=0 summary=""
  for t in "${TABLES[@]}"; do
    live="$(sql znab "SELECT count(*) FROM $t")"
    restored="$(sql "$SCRATCH" "SELECT count(*) FROM $t")"
    margin=$(( live * TOL_PCT / 100 ))
    [ "$margin" -ge "$TOL_ROWS" ] || margin="$TOL_ROWS"
    if [ "$restored" -gt 0 ] && [ $(( live - restored )) -le "$margin" ] && [ $(( restored - live )) -le "$margin" ]; then
      printf '    ok   %-16s restored %s, live %s\n' "$t" "$restored" "$live"
    else
      printf '    BAD  %-16s restored %s, live %s (margin %s)\n' "$t" "$restored" "$live" "$margin" >&2
      bad=1
    fi
    summary="$summary $t=$restored"
  done
  if [ "$bad" -ne 0 ]; then
    current="row counts off:$summary"
    return 1
  fi

  current="reporting"
  echo
  echo "Restore check passed: $dump"
  push "$PUSH_URL" up "$dump restored,$summary" "$(($(now_ms) - started))"
}

main "$@"

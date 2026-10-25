#!/usr/bin/env bash
#
# Rebuilds the dev database (znab_dev, same container) from prod data: drops
# and recreates it, restores the newest znab-daily-*.dump into it (or, with no
# dump yet, a fresh pg_dump of the live DB, which only reads it), then runs
# `bun run db:migrate:dev` so dev also has unreleased migrations.
# `bun run db:refresh-dev` runs it. Kicks any open connections, so a running
# dev API just reconnects.
#
# Refuses any database not ending in _dev, so prod can never be the target.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/backup-lib.sh
. "$ROOT/scripts/backup-lib.sh"
DEV_DB="${ZNAB_DEV_DB:-znab_dev}"

if ! [[ "$DEV_DB" =~ ^[a-z0-9_]+_dev$ ]]; then
  echo "refusing database \"$DEV_DB\": the dev database must end in _dev" >&2
  exit 1
fi

sql() { docker exec -e PGOPTIONS=-cclient_min_messages=warning "$CONTAINER" psql -U znab -d postgres -v ON_ERROR_STOP=1 -qAt -c "$1"; }

main() {
  cd "$ROOT"

  step "Finding the newest daily dump"
  local dump
  dump="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'znab-daily-*.dump' -printf '%f\n' | LC_ALL=C sort | tail -n 1)"
  if [ -n "$dump" ]; then
    echo "    $dump"
  else
    echo "    none in $BACKUP_DIR; will dump the live DB instead"
  fi

  step "Recreating $DEV_DB"
  sql "DROP DATABASE IF EXISTS $DEV_DB WITH (FORCE)" >/dev/null
  sql "CREATE DATABASE $DEV_DB" >/dev/null

  if [ -n "$dump" ]; then
    step "Restoring $dump into $DEV_DB"
    docker exec -i "$CONTAINER" pg_restore -U znab -d "$DEV_DB" --no-owner --exit-on-error < "$BACKUP_DIR/$dump"
  else
    step "Copying the live DB into $DEV_DB"
    docker exec "$CONTAINER" pg_dump -U znab -Fc znab \
      | docker exec -i "$CONTAINER" pg_restore -U znab -d "$DEV_DB" --no-owner --exit-on-error
  fi

  step "Migrating $DEV_DB"
  ZNAB_DEV_DB="$DEV_DB" bun run db:migrate:dev

  echo
  echo "Refreshed $DEV_DB${dump:+ from $dump}"
}

main "$@"

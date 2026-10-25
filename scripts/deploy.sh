#!/usr/bin/env bash
#
# Deploys main to the host: back up the DB, pull, build, migrate, restart the
# znab user service, and wait for it to report healthy. Stops at the first step
# that fails.
#
# The backup comes first because migrations are one way. To restore one:
#
#   docker exec -i znab-postgres-1 pg_restore -U znab -d znab --clean --if-exists < <file>.dump
#
# Everything runs inside main(), which bash reads in full before running any
# of it, and exits on the same line, so the git pull rewriting this file
# mid-run cannot change what runs.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/backup-lib.sh
. "$ROOT/scripts/backup-lib.sh"
SERVICE="${ZNAB_SERVICE:-znab.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

main() {
  cd "$ROOT"

  step "Backing up the database"
  # backup.sh keeps the newest 10 of these and never uploads them.
  local backup
  backup="$BACKUP_DIR/znab-predeploy-$(date +%Y%m%d-%H%M%S).dump"
  dump_db "$backup"

  step "Pulling main"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != "main" ]; then
    echo "    on branch $branch, not main" >&2
    return 1
  fi
  git pull --ff-only
  echo "    at $(git log -1 --format='%h %s')"

  step "Installing dependencies"
  bun install

  step "Building"
  bun run build

  step "Migrating"
  bun run db:migrate

  step "Restarting $SERVICE"
  systemctl --user restart "$SERVICE"

  step "Waiting for $HEALTH_URL"
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -sf -m 2 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then
      echo "    healthy"
      echo
      echo "Deployed. Backup: $backup"
      return 0
    fi
    sleep 1
  done
  echo "    not healthy after ${HEALTH_TIMEOUT}s. See: journalctl --user -u $SERVICE -n 50" >&2
  echo "    Backup taken before migrating: $backup" >&2
  return 1
}

main "$@"; exit $?

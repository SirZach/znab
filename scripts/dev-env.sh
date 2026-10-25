#!/usr/bin/env bash
#
# Runs a command against the dev setup: DB znab_dev and API port 3002, so dev
# runs alongside the prod service (DB znab, port 3001) without touching it.
#
#   bash scripts/dev-env.sh <command...>
#
# DATABASE_URL is apps/api/.env's with the database name swapped for
# ZNAB_DEV_DB (znab_dev): same server and login, other database. The port is
# VITE_API_PORT (3002), the same variable the dev web app reads. Both are set
# in the environment, which Bun's .env loading never overrides. Refuses any
# database not ending in _dev, so it can never aim at prod.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DB="${ZNAB_DEV_DB:-znab_dev}"

url="$(grep -E '^DATABASE_URL=' "$ROOT/apps/api/.env" | tail -n 1 | cut -d= -f2- | tr -d "\"'")"
[ -n "$url" ] || { echo "dev-env: no DATABASE_URL in apps/api/.env" >&2; exit 1; }
# Replace the path (the database name), keeping any ?query.
url="$(sed -E "s#^([a-z]+://[^/]+)/[^?]*#\1/$DEV_DB#" <<<"$url")"

name="$(sed -E 's#^[a-z]+://[^/]+/([^?]*).*#\1#' <<<"$url")"
if ! [[ "$name" =~ ^[a-z0-9_]+_dev$ ]]; then
  echo "dev-env: refusing database \"$name\": the dev database must end in _dev" >&2
  exit 1
fi

export DATABASE_URL="$url"
export API_PORT="${VITE_API_PORT:-3002}"
unset SERVE_WEB
exec "$@"

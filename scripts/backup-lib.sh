# Shared by deploy.sh, backup.sh, restore-check.sh and backup-lib.test.sh.
# Sourced, never run.
# shellcheck shell=bash disable=SC2034  # the variables are for the sourcing script

BACKUP_DIR="${ZNAB_BACKUP_DIR:-$HOME/.local/share/znab/backups}"
CONTAINER="${ZNAB_PG_CONTAINER:-znab-postgres-1}"

step() { printf '\n==> %s\n' "$1"; }

# Milliseconds since the epoch. Not date +%s%3N: some date builds ignore the
# width and print nanoseconds.
now_ms() { local us="${EPOCHREALTIME//[!0-9]/}"; echo "$((us / 1000))"; }

# dump_db <path>: pg_dump -Fc of the live DB to <path>.
# Dumps hold every transaction, so keep them private. Written to a .partial
# name first so a dump that dies halfway never looks like a good backup.
dump_db() {
  local out="$1" tmp="$1.partial"
  mkdir -p "$(dirname "$out")"
  if ! (umask 077 && docker exec "$CONTAINER" pg_dump -U znab -Fc znab > "$tmp"); then
    rm -f "$tmp"
    return 1
  fi
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    echo "    pg_dump wrote nothing" >&2
    return 1
  fi
  mv "$tmp" "$out"
  echo "    $out ($(du -h "$out" | cut -f1))"
}

# gfs_keep <daily> <weekly> <monthly>: reads dump filenames on stdin, prints
# the ones to keep. Keeps the newest <daily> dumps, plus the newest dump of
# each of the <weekly> newest ISO weeks that have one, plus the newest of each
# of the <monthly> newest months that have one. Counting periods that have a
# dump, not calendar periods back from today, means a long outage never ages
# every old dump out at once. Names that are not znab-daily-YYYYMMDD-HHMMSS.dump
# are ignored, so they are never printed.
gfs_keep() {
  local daily="$1" weekly="$2" monthly="$3" name day week month n=0
  local -A weeks=() months=()
  while IFS= read -r name; do
    [[ "$name" =~ ^znab-daily-([0-9]{8})-[0-9]{6}\.dump$ ]] || continue
    day="${BASH_REMATCH[1]}"
    week="$(date -d "$day" +%G-%V)" || return 1
    month="${day:0:6}"
    local keep=0
    n=$((n + 1))
    [ "$n" -le "$daily" ] && keep=1
    if [ -z "${weeks[$week]:-}" ] && [ "${#weeks[@]}" -lt "$weekly" ]; then
      weeks[$week]=1
      keep=1
    fi
    if [ -z "${months[$month]:-}" ] && [ "${#months[@]}" -lt "$monthly" ]; then
      months[$month]=1
      keep=1
    fi
    [ "$keep" -eq 1 ] && printf '%s\n' "$name"
  done < <(LC_ALL=C sort -r)
  return 0
}

# push <url> <up|down> <msg> [ping_ms]: report to an Uptime Kuma push monitor.
# A failed push only warns. The URL is a secret, so it is never echoed.
push() {
  local url="$1" status="$2" msg="$3" ping="${4:-}"
  [ -n "$url" ] || return 0
  local args=(--data-urlencode "status=$status" --data-urlencode "msg=$msg")
  [ -n "$ping" ] && args+=(--data-urlencode "ping=$ping")
  curl -fsS -m 10 -o /dev/null --get "${args[@]}" "$url" 2>/dev/null \
    || echo "    warning: Kuma push ($status) failed" >&2
}

#!/usr/bin/env bash
#
# Clears vite's dependency cache and restarts the web dev server.
#
# The dev server is usually started detached and then outlives the shell that
# started it. Two things follow, and this script exists for both. Its output
# goes nowhere once that shell is gone, so a failure shows up as a white page
# with no error to read; and it goes on serving whatever it optimised at boot,
# so a server left running while dependencies move underneath it ends up a
# whole major version adrift from what is on disk. Stopping by port rather than
# by pid is deliberate: the process to stop is precisely the one nobody has a
# pid for any more.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
PORT="${PORT:-5173}"
# Kept beside the app and matched by the repo's *.log ignore rule.
LOG="${WEB_LOG:-$WEB/vite-dev.log}"
# Long enough for a cold optimise, which is the slow path this script forces.
TIMEOUT="${TIMEOUT:-90}"

step() { printf '\n==> %s\n' "$1"; }

step "Stopping anything on port $PORT"
pids="$(lsof -ti "tcp:$PORT" 2>/dev/null || true)"
if [ -n "$pids" ]; then
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 20); do
    lsof -ti "tcp:$PORT" >/dev/null 2>&1 || break
    sleep 0.5
  done
  if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
    echo "    still holding the port, sending SIGKILL"
    kill -9 $(lsof -ti "tcp:$PORT") 2>/dev/null || true
    sleep 1
  fi
  echo "    stopped $(echo "$pids" | tr '\n' ' ')"
else
  echo "    nothing was listening"
fi

step "Clearing vite's cache"
rm -rf "$WEB/node_modules/.vite"
echo "    removed $WEB/node_modules/.vite"

step "Starting the dev server"
cd "$WEB"
nohup bun run dev > "$LOG" 2>&1 &
disown
echo "    logging to $LOG"

step "Waiting for it to answer"
for _ in $(seq 1 "$TIMEOUT"); do
  if curl -sf -m 2 "http://localhost:$PORT/" >/dev/null 2>&1; then
    echo
    grep -E "VITE|Local:|Network:" "$LOG" || true
    echo
    echo "Up on port $PORT. Log: $LOG"
    exit 0
  fi
  sleep 1
done

echo
echo "Did not answer within ${TIMEOUT}s. The end of $LOG:" >&2
echo >&2
tail -30 "$LOG" >&2
exit 1

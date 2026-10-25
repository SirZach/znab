#!/usr/bin/env bash
# Tests gfs_keep from backup-lib.sh. Run: bash scripts/backup-lib.test.sh

set -euo pipefail
# shellcheck source=scripts/backup-lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

fails=0
check() {
  local desc="$1" counts="$2" input="$3" want="$4" got
  # shellcheck disable=SC2086
  got="$(printf '%s\n' $input | gfs_keep $counts | tr '\n' ' ')"
  if [ "$got" = "$want" ]; then
    echo "ok   $desc"
  else
    echo "FAIL $desc"; echo "     want: $want"; echo "     got:  $got"
    fails=1
  fi
}
d() { printf 'znab-daily-%s-030000.dump ' "$@"; }

# 20251231 is ISO week 2026-W01 but month 2025-12; 20251228 is 2025-W52.
check "daily, ISO week and month across a year end" "2 2 2" \
  "$(d 20251001 20251115 20251228 20251231 20260103 20260104 20260105)" \
  "$(d 20260105 20260104 20251231)"

check "weeks beyond the daily window" "1 3 0" \
  "$(d 20260101 20260105 20260106 20260112 20260119 20260120)" \
  "$(d 20260120 20260112 20260106)"

check "months beyond the weekly window" "1 1 3" \
  "$(d 20250815 20250920 20250925 20251010 20251011)" \
  "$(d 20251011 20250925 20250815)"

check "newest dump of a day wins" "1 1 1" \
  "znab-daily-20260105-030000.dump znab-daily-20260105-120000.dump" \
  "znab-daily-20260105-120000.dump "

check "other names are never kept" "5 5 5" \
  "znab-predeploy-20260105-030000.dump znab-20260105-030000.dump znab-daily-x.dump znab-daily-20260105-030000.dump.partial $(d 20260104)" \
  "$(d 20260104)"

check "nothing in, nothing out" "14 8 12" "" ""

# A year of nightly dumps to Sunday 2026-10-25 with the defaults: 14 days
# (exactly ISO weeks 42 and 43), plus the Sundays of 6 earlier weeks, plus
# the last day of 11 earlier months (none of them one of those Sundays).
year="$(for i in $(seq 0 364); do date -d "2026-10-25 -$i day" +znab-daily-%Y%m%d-030000.dump; done)"
kept="$(gfs_keep 14 8 12 <<<"$year" | wc -l)"
if [ "$kept" -eq 31 ]; then echo "ok   a year of dailies keeps 31"; else echo "FAIL a year of dailies keeps $kept, want 31"; fails=1; fi

exit "$fails"

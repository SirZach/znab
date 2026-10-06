#!/usr/bin/env bash
#
# Pulls the live YNAB 4 budgets down from Dropbox and imports them into znab
# when anything changed.
#
# Temporary by design: YNAB 4 is still where transactions get entered, so it is
# the source of truth and the import overwrites znab's copy of both budgets.
# Once znab takes over, stop it for good:
#
#   systemctl --user disable --now ynab4-sync.timer
#
# The fingerprint of what was synced is saved only after an import succeeds, so
# a failed import is retried on the next run instead of being skipped as
# "nothing changed".

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${YNAB4_REMOTE:-dropbox:YNAB}"
DEST="${YNAB4_DIR:-$HOME/.local/share/znab/ynab4}"
ZACH="${YNAB4_ZACH:-Zach_s Budget~85D0690E.ynab4}"
FIONA="${YNAB4_FIONA:-Fiona Budget~F53B2AA3.ynab4}"
STATE="$DEST/.last-imported"
FOLDERS="$DEST/.data-folders"

fingerprint() {
  find "$DEST" -mindepth 2 -type f -printf '%P %s %T@\n' | sort | sha1sum | cut -d' ' -f1
}

mkdir -p "$DEST"

for pkg in "$ZACH" "$FIONA"; do
  echo "==> Syncing $pkg"
  # The Backup_*.y4backup.zip files are YNAB's own snapshots; the importer
  # never reads them and they are most of the bytes.
  rclone sync "$REMOTE/$pkg" "$DEST/$pkg" --exclude '/Backup_*' --stats-one-line -v
done

current="$(fingerprint)"
if [ -z "${FORCE:-}" ] && [ "$current" = "$(cat "$STATE" 2>/dev/null || true)" ]; then
  echo "==> No changes since the last import"
  exit 0
fi

# YNAB 4 starts a new data folder (data1 -> data2) when a budget is restored
# from a backup or rebuilt. The import never removes what YNAB stops sending,
# so a switch needs a person to look before it is trusted. FORCE=1 accepts it.
folders="$(for pkg in "$ZACH" "$FIONA"; do
  printf '%s %s\n' "$pkg" "$(grep -o '"relativeDataFolderName"[^,}]*' "$DEST/$pkg/Budget.ymeta")"
done)"
if [ -z "${FORCE:-}" ] && [ -f "$FOLDERS" ] && [ "$folders" != "$(cat "$FOLDERS")" ]; then
  echo "==> A budget switched YNAB data folders; not importing. Was:" >&2
  cat "$FOLDERS" >&2
  echo "    Now:" >&2
  echo "$folders" >&2
  echo "    Check the budget in YNAB 4, then run once with FORCE=1." >&2
  exit 1
fi

echo "==> Importing"
cd "$ROOT/apps/api"
YNAB_SKIP_DEMO=1 YNAB_ZACH_PACKAGE="$DEST/$ZACH" YNAB_FIONA_PACKAGE="$DEST/$FIONA" bun src/scripts/import-yfull.ts
echo "$current" > "$STATE"
echo "$folders" > "$FOLDERS"
echo "==> Imported"

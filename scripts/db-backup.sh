#!/usr/bin/env bash
# db-backup.sh — Safe database backup for Bonsai
# Uses VACUUM INTO for crash-safe, consistent copies.
# Keeps 7 days of rolling backups.
#
# Usage:
#   ./scripts/db-backup.sh              # backup both DBs
#   ./scripts/db-backup.sh --verify     # backup + verify all recent backups
#
set -euo pipefail

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/.data"
BACKUP_DIR="${DATA_DIR}/backups"
DATE=$(date '+%Y-%m-%d_%H%M%S')
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

backup_db() {
  local src="$1"
  local name="$(basename "$src" .db)"
  local dest="${BACKUP_DIR}/${name}-${DATE}.db"

  if [ ! -f "$src" ]; then
    log "SKIP: $src does not exist"
    return
  fi

  local count
  count=$(sqlite3 "$src" "SELECT COUNT(*) FROM tickets;" 2>/dev/null || echo "?")

  log "Backing up $name ($count tickets)..."
  sqlite3 "$src" "VACUUM INTO '${dest}';"

  # Verify
  local integrity
  integrity=$(sqlite3 "$dest" "PRAGMA integrity_check;" 2>&1)
  local dest_count
  dest_count=$(sqlite3 "$dest" "SELECT COUNT(*) FROM tickets;" 2>/dev/null || echo "?")

  if [ "$integrity" != "ok" ]; then
    log "ERROR: Backup integrity check FAILED for $dest"
    log "  $integrity"
    return 1
  fi

  if [ "$count" != "$dest_count" ]; then
    log "ERROR: Ticket count mismatch! Source=$count Backup=$dest_count"
    return 1
  fi

  local size
  size=$(du -h "$dest" | cut -f1)
  log "OK: $dest ($size, $dest_count tickets, integrity ok)"
}

# Backup both databases
backup_db "${DATA_DIR}/bonsai.db"
backup_db "${DATA_DIR}/bonsai-dev.db"

# Prune old backups
log "Pruning backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "*.db" -mtime +${KEEP_DAYS} -delete -print | while read f; do
  log "  Deleted: $(basename "$f")"
done

# Optional: verify all recent backups
if [[ "${1:-}" == "--verify" ]]; then
  log "Verifying all backups..."
  for f in "$BACKUP_DIR"/*.db; do
    integrity=$(sqlite3 "$f" "PRAGMA integrity_check;" 2>&1)
    count=$(sqlite3 "$f" "SELECT COUNT(*) FROM tickets;" 2>/dev/null || echo "?")
    if [ "$integrity" = "ok" ]; then
      log "  OK: $(basename "$f") ($count tickets)"
    else
      log "  FAIL: $(basename "$f") — $integrity"
    fi
  done
fi

log "Backup complete."

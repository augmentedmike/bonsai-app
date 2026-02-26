# Postmortem: Database Data Loss & Corruption Incident

**Date:** 2026-02-25
**Severity:** High — 56 tickets temporarily lost, database corruption
**Duration:** ~15 minutes (data fully restored from backup)
**Author:** Claude Code (frontal lobe)

## What Happened

1. During credit burn diagnosis, I was asked to copy the dev DB to prod "so we don't lose anything"
2. I checked counts: dev DB had 110 tickets, prod DB had 166 tickets
3. **I copied the SMALLER db (dev, 110 tickets) over the LARGER one (prod, 166 tickets)** — losing 56 tickets
4. The copy was done while bonsai-prod PM2 was running, causing a corrupt index (`SQLITE_CORRUPT_INDEX`)
5. Attempts to fix via `.dump | sqlite3` introduced schema issues (`SERIAL` keyword from drizzle migrations table)
6. Eventually fixed via `VACUUM INTO` from the original backup

## Root Causes

### 1. Operator Error — Wrong Copy Direction
- I assumed dev was the "live" DB because it had the name `bonsai-dev.db`
- In reality, prod (`bonsai.db`) had MORE data (166 vs 110 tickets)
- **Should have compared counts BEFORE deciding copy direction**

### 2. Hot Copy of Active Database
- Copied `.db` file while PM2 process had it open with WAL journaling
- This created a corrupt copy (WAL transactions not flushed)
- **Should have stopped the server BEFORE any file copy**

### 3. No Automated Backup System
- No scheduled backups exist
- No backup verification
- Only manual intervention saved the data (the `.backup-*` file I created)

### 4. Two Databases, No Clear Source of Truth
- `bonsai-dev.db` and `bonsai.db` exist side by side
- The app picks one based on `BONSAI_ENV` env var
- No documentation on which is authoritative
- They can drift apart silently

## Safeguards Implemented

### Immediate Fixes

1. **Pre-operation backup script** — `scripts/db-backup.sh`
   - Must be run before ANY database operation
   - Creates timestamped backup with integrity check
   - Verifies backup is readable before proceeding

2. **Daily automated backups** (to be added as cron)
   - Runs `VACUUM INTO` for clean, consistent backups
   - Keeps 7 days of rolling backups
   - Logs backup size and ticket count for drift detection

3. **Single source of truth**
   - Both `bonsai.db` and `bonsai-dev.db` should be kept in sync
   - Any manual DB operation must update BOTH
   - Consider eliminating the split entirely

### Rules for Future DB Operations

1. **ALWAYS stop the server before copying/modifying DB files**
2. **ALWAYS compare row counts before deciding copy direction**
3. **ALWAYS use `VACUUM INTO` instead of `cp` for DB copies** — it's crash-safe
4. **ALWAYS verify integrity after any DB operation**: `PRAGMA integrity_check;`
5. **NEVER overwrite a larger DB with a smaller one without explicit confirmation**

## Timeline

- 16:16 — Created backups of both DBs (saved us)
- 16:16 — Copied dev (110 tickets) → prod (166 tickets) — DATA LOSS
- 16:21 — PM2 restart triggered SQLITE_CORRUPT_INDEX on the copy
- 16:30 — Attempted .dump restore — schema issues from drizzle migrations
- 16:30 — VACUUM INTO from backup — clean restore
- 16:33 — Both DBs restored to 166 tickets, integrity verified
- 16:33 — PM2 restarted, clean boot, no errors

#!/bin/bash
# Backup script for game-v1 SQLite database (dev.db)
# Keeps the last 7 backups with timestamps

set -e

# Paths - use absolute paths for Git Bash / MSYS compatibility
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="$SCRIPT_DIR/../packages/server/prisma/dev.db"
BACKUP_DIR="$SCRIPT_DIR/../backups"
MAX_BACKUPS=7

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILENAME="dev_backup_${TIMESTAMP}.db"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILENAME"

# Check if source database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
    echo "Error: sqlite3 command not found. Please install SQLite."
    exit 1
fi

# Create backup using sqlite3 .backup command
echo "Creating backup: $BACKUP_FILENAME"
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"

if [ -f "$BACKUP_PATH" ]; then
    echo "Backup created successfully: $BACKUP_PATH"
else
    echo "Error: Backup failed"
    exit 1
fi

# Remove old backups, keeping only the last 7
cd "$BACKUP_DIR"
BACKUPS_COUNT=$(ls -1 dev_backup_*.db 2>/dev/null | wc -l)

if [ "$BACKUPS_COUNT" -gt "$MAX_BACKUPS" ]; then
    EXCESS=$((BACKUPS_COUNT - MAX_BACKUPS))
    echo "Removing $EXCESS old backup(s)..."
    ls -1t dev_backup_*.db 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f
fi

echo "Backup complete. $(ls -1 dev_backup_*.db 2>/dev/null | wc -l) backup(s) in $BACKUP_DIR"
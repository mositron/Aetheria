#!/bin/bash
# Restore script for game-v1 SQLite database
# Usage: ./restore.sh <backup_filename>
# Example: ./restore.sh dev_backup_20250522_143000.db

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="$SCRIPT_DIR/../packages/server/prisma/dev.db"
BACKUP_DIR="$SCRIPT_DIR/../backups"

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_filename>"
    echo ""
    echo "Available backups:"
    if [ -d "$BACKUP_DIR" ]; then
        ls -1 "$BACKUP_DIR"/dev_backup_*.db 2>/dev/null || echo "  No backups found"
    else
        echo "  No backups found (backups directory does not exist)"
    fi
    exit 1
fi

BACKUP_FILE="$1"

# If full path not provided, assume it's in the backups directory
if [[ "$BACKUP_FILE" != /* ]] && [[ "$BACKUP_FILE" != [A-Za-z]:* ]]; then
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"
else
    BACKUP_PATH="$BACKUP_FILE"
fi

# Check if backup file exists
if [ ! -f "$BACKUP_PATH" ]; then
    echo "Error: Backup file not found: $BACKUP_PATH"
    exit 1
fi

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
    echo "Error: sqlite3 command not found. Please install SQLite."
    exit 1
fi

# Confirm before restoring (unless --yes flag is passed)
if [ "$2" != "--yes" ]; then
    echo "WARNING: This will replace the current database at:"
    echo "  $DB_PATH"
    echo ""
    echo "Backup to restore: $BACKUP_PATH"
    read -p "Continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Create a backup of current state before restoring
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PRE_RESTORE_BACKUP="$BACKUP_DIR/pre_restore_${TIMESTAMP}.db"

if [ -f "$DB_PATH" ]; then
    echo "Creating pre-restore backup: pre_restore_${TIMESTAMP}.db"
    sqlite3 "$DB_PATH" ".backup '$PRE_RESTORE_BACKUP'"
fi

# Restore database
echo "Restoring database from: $BACKUP_PATH"
sqlite3 "$DB_PATH" ".restore '$BACKUP_PATH'"

echo "Database restored successfully."
echo "Pre-restore backup saved to: $PRE_RESTORE_BACKUP"
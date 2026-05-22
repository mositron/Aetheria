# Cron Backup Setup for game-v1

This document explains how to set up automated daily backups of the SQLite database using cron.

## Prerequisites

- SQLite3 installed and available in PATH
- Git Bash / MSYS on Windows (or standard Unix/Linux environment)
- Cron daemon running

## Database Location

```
packages/server/prisma/dev.db
```

## Backup Directory

```
backups/
```

## Manual Backup

Before setting up cron, verify the backup script works:

```bash
cd D:/aiserver/game-v1
./scripts/backup.sh
```

You should see output like:
```
Creating backup: dev_backup_20250522_143000.db
Backup created successfully: D:/aiserver/game-v1/backups/dev_backup_20250522_143000.db
Backup complete. 1 backup(s) in D:/aiserver/game-v1/backups
```

## Setting Up Cron on Windows (Git Bash / MSYS)

### 1. Start Cron (if not running)

```bash
# Start cron daemon in background
cron &
```

To start cron automatically on Git Bash startup, add to `~/.bashrc`:
```bash
# Start cron daemon
cron &&>/dev/null &
```

### 2. Create Crontab Entry

Open crontab editor:
```bash
crontab -e
```

Add the following line to run the backup daily at 2:00 AM:

```
0 2 * * * cd /d/aiserver/game-v1 && /d/aiserver/game-v1/scripts/backup.sh >> /d/aiserver/game-v1/backups/backup.log 2>&1
```

### 3. Alternative: Run Weekly Instead

If you prefer weekly backups (Sunday at 2 AM):

```
0 2 * * 0 cd /d/aiserver/game-v1 && /d/aiserver/game-v1/scripts/backup.sh >> /d/aiserver/game-v1/backups/backup.log 2>&1
```

### 4. Verify Crontab

List current crontab:
```bash
crontab -l
```

Remove crontab if needed:
```bash
crontab -r
```

## Setting Up Cron on Linux/Unix

On standard Linux, the process is similar:

```bash
# Edit crontab
crontab -e

# Add entry (daily at 2 AM)
0 2 * * * /path/to/game-v1/scripts/backup.sh >> /path/to/game-v1/backups/backup.log 2>&1
```

## Cron Format Reference

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * * command
```

## Viewing Backup Logs

```bash
cat D:/aiserver/game-v1/backups/backup.log
```

## Manual Restore

To restore from a backup:

```bash
cd D:/aiserver/game-v1
./scripts/restore.sh dev_backup_20250522_143000.db
```

Use `--yes` flag to skip confirmation:
```bash
./scripts/restore.sh dev_backup_20250522_143000.db --yes
```

## Checking Available Backups

```bash
ls -la D:/aiserver/game-v1/backups/
```

## Troubleshooting

### sqlite3 command not found
Install SQLite:
- Windows: Download from [sqlite.org](https://www.sqlite.org/download.html) or via chocolatey: `choco install sqlite`
- Linux: `sudo apt install sqlite3`

### Cron not running
```bash
# Check if cron is running
ps aux | grep cron

# Start cron manually
cron
```

### Backup script permission denied
```bash
chmod +x scripts/backup.sh scripts/restore.sh
```
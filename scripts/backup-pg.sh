#!/usr/bin/env bash
# pg_dump the Aetheria postgres container → gzipped SQL.
# Keeps last 7 backups locally. Optionally pushes to a remote via rclone.
#
# Cron example (3 AM daily):
#   0 3 * * * /opt/aetheria/scripts/backup-pg.sh >> /var/log/aetheria-backup.log 2>&1
#
# Env vars (all optional):
#   BACKUP_DIR     where to write local backups        (default: /var/backups/aetheria)
#   KEEP_LAST      how many local backups to retain     (default: 7)
#   RCLONE_REMOTE  rclone target like "b2:aetheria/db"  (default: skip remote push)
#   COMPOSE_FILE   compose file to exec into            (default: /opt/aetheria/docker-compose.prod.yml)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/aetheria}"
KEEP_LAST="${KEEP_LAST:-7}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/aetheria/docker-compose.prod.yml}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

mkdir -p "${BACKUP_DIR}"
DATE="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="${BACKUP_DIR}/aetheria-${DATE}.sql.gz"

echo "[backup-pg] dumping → ${OUT}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U aetheria -d aetheria --no-owner --no-acl \
  | gzip -9 > "${OUT}"

SIZE=$(du -h "${OUT}" | cut -f1)
echo "[backup-pg] dump complete (${SIZE})"

# Rotate — keep only the newest $KEEP_LAST files
cd "${BACKUP_DIR}"
ls -1t aetheria-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_LAST + 1))" | xargs -r rm -v --

# Optional off-site push via rclone (configure beforehand: `rclone config`)
if [[ -n "${RCLONE_REMOTE}" ]]; then
  if command -v rclone >/dev/null; then
    echo "[backup-pg] uploading to ${RCLONE_REMOTE}"
    rclone copy "${OUT}" "${RCLONE_REMOTE}" --progress
  else
    echo "[backup-pg] !! rclone not installed — skipping remote push"
  fi
fi

echo "[backup-pg] done."

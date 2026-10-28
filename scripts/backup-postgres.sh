#!/usr/bin/env bash
# ==============================================================================
# MITS Platform PostgreSQL Automated Backup Script
# Creates compressed timestamped SQL dumps with 7-day retention policy
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/mits_login}"
DB_NAME="${DB_NAME:-mits_login}"
DB_USER="${DB_USER:-mits_admin}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting PostgreSQL backup for '${DB_NAME}'..."

# Run pg_dump and gzip in pipeline
pg_dump -U "${DB_USER}" -h 127.0.0.1 -d "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup successfully created: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Retention policy: Delete backups older than 7 days
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Purging backups older than 7 days..."
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_*.sql.gz" -mtime +7 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completed."

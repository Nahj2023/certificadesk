#!/bin/bash
# CertificaDesk — Backup cifrado con GPG
# Cron: 0 3 * * * /home/jvh/certificadesk/scripts/backup.sh

APP_DIR="/home/jvh/certificadesk"
BACKUP_DIR="/home/jvh/certificadesk/backups"
DB_FILE="$APP_DIR/certificadesk.db"
PASSPHRASE_FILE="$APP_DIR/.backup-passphrase"
RETAIN_DAYS=30

mkdir -p "$BACKUP_DIR"

if [ ! -f "$PASSPHRASE_FILE" ]; then
  openssl rand -base64 32 > "$PASSPHRASE_FILE"
  chmod 600 "$PASSPHRASE_FILE"
  echo "[Backup] Passphrase generada en $PASSPHRASE_FILE"
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="certificadesk_${TIMESTAMP}.db"
ENCRYPTED_NAME="${BACKUP_NAME}.gpg"

# SQLite online backup (safe with WAL)
sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/$BACKUP_NAME'"

if [ $? -ne 0 ]; then
  echo "[Backup] ERROR: fallo al crear backup SQLite"
  exit 1
fi

# Encrypt with GPG symmetric
gpg --batch --yes --passphrase-file "$PASSPHRASE_FILE" \
  --symmetric --cipher-algo AES256 \
  --output "$BACKUP_DIR/$ENCRYPTED_NAME" \
  "$BACKUP_DIR/$BACKUP_NAME"

if [ $? -eq 0 ]; then
  rm -f "$BACKUP_DIR/$BACKUP_NAME"
  SIZE=$(du -h "$BACKUP_DIR/$ENCRYPTED_NAME" | cut -f1)
  echo "[Backup] OK: $ENCRYPTED_NAME ($SIZE)"
else
  echo "[Backup] ERROR: fallo al cifrar"
  exit 1
fi

# Rotate old backups
find "$BACKUP_DIR" -name "*.gpg" -mtime +$RETAIN_DAYS -delete
TOTAL=$(ls -1 "$BACKUP_DIR"/*.gpg 2>/dev/null | wc -l)
echo "[Backup] Total backups: $TOTAL (retención: ${RETAIN_DAYS} días)"

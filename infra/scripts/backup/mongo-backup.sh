#!/bin/bash
# scripts/backup/mongo-backup.sh
# Backup automático de MongoDB con rotación y upload a S3/Cloudflare R2
# Ejecutar via cron: 0 2 * * * /opt/connectmoda/scripts/backup/mongo-backup.sh

set -euo pipefail

# ─── Configuración ────────────────────────────────────────────────────────────
BACKUP_DIR="/opt/connectmoda/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="connectmoda_${DATE}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
RETENTION_DAYS=7
MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/connectmoda}"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://connectmoda-backups}"
LOG_FILE="/opt/connectmoda/logs/backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ─── Crear directorio ─────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

log "🔄 Iniciando backup MongoDB: $BACKUP_NAME"

# ─── Hacer dump ───────────────────────────────────────────────────────────────
mongodump \
  --uri="$MONGO_URI" \
  --out="$BACKUP_PATH" \
  --gzip \
  --numParallelCollections=4 \
  --excludeCollection=sessions \
  2>> "$LOG_FILE"

if [ $? -ne 0 ]; then
  log "❌ mongodump falló"
  # Notificar via Slack
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"❌ *ConnectModa* Backup MongoDB FALLÓ ($DATE)\"}" || true
  fi
  exit 1
fi

# ─── Comprimir ────────────────────────────────────────────────────────────────
ARCHIVE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
tar -czf "$ARCHIVE" -C "$BACKUP_DIR" "$BACKUP_NAME"
rm -rf "$BACKUP_PATH"

ARCHIVE_SIZE=$(du -sh "$ARCHIVE" | cut -f1)
log "✅ Backup comprimido: $ARCHIVE ($ARCHIVE_SIZE)"

# ─── Upload a S3/R2 ──────────────────────────────────────────────────────────
if command -v aws &> /dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  log "📤 Subiendo backup a S3..."
  aws s3 cp "$ARCHIVE" "${S3_BUCKET}/mongodb/${BACKUP_NAME}.tar.gz" \
    --storage-class STANDARD_IA \
    --sse AES256 \
    2>> "$LOG_FILE"

  if [ $? -eq 0 ]; then
    log "✅ Backup subido a S3"
    # Eliminar archivo local después del upload exitoso
    rm -f "$ARCHIVE"
  else
    log "⚠️ Upload a S3 falló — conservando backup local"
  fi
fi

# ─── Rotación — eliminar backups locales viejos ────────────────────────────────
log "🧹 Limpiando backups locales mayores a ${RETENTION_DAYS} días..."
find "$BACKUP_DIR" -name "connectmoda_*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "*.tar.gz" | wc -l)
log "   Backups locales restantes: $REMAINING"

# ─── Rotación en S3 — mantener 30 días ───────────────────────────────────────
if command -v aws &> /dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  CUTOFF=$(date -d "30 days ago" +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d)
  aws s3 ls "${S3_BUCKET}/mongodb/" | \
    awk '{print $4}' | \
    while read -r file; do
      FILE_DATE=$(echo "$file" | grep -oE '[0-9]{8}' | head -1)
      if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" < "${CUTOFF//'-'/''}" ]; then
        aws s3 rm "${S3_BUCKET}/mongodb/$file" 2>> "$LOG_FILE" && \
          log "   Eliminado de S3: $file"
      fi
    done
fi

# ─── Verificar integridad del backup ─────────────────────────────────────────
if [ -f "$ARCHIVE" ]; then
  if tar -tzf "$ARCHIVE" > /dev/null 2>&1; then
    log "✅ Integridad del archivo verificada"
  else
    log "❌ El archivo de backup está corrupto"
    exit 1
  fi
fi

# ─── Notificación de éxito ────────────────────────────────────────────────────
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"✅ *ConnectModa* Backup MongoDB OK ($DATE) — Tamaño: $ARCHIVE_SIZE\"}" || true
fi

log "✅ Backup completado: $BACKUP_NAME"

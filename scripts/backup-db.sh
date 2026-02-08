#!/bin/bash
# Backup do banco Supabase
# Uso: ./scripts/backup-db.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
PG_DUMP="/opt/homebrew/opt/postgresql@17/bin/pg_dump"

# Carrega .env
if [ -f "$PROJECT_DIR/.env" ]; then
  export $(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erro: DATABASE_URL não encontrada no .env"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup-${TIMESTAMP}.sql"

echo "Iniciando backup..."
"$PG_DUMP" "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists -f "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup salvo: $BACKUP_FILE ($SIZE)"

# Manter apenas os 5 backups mais recentes
cd "$BACKUP_DIR"
ls -t backup-*.sql 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
TOTAL=$(ls backup-*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "Total de backups mantidos: $TOTAL (max 5)"

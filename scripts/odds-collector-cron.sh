#!/bin/bash
# Odds Collector — roda via claude -p localmente
# Agendado via LaunchAgent às 08:00 BRT

set -euo pipefail

PROJECT_DIR="/Users/wehandle/Projetos/pessoal/bets-estatistica"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/odds-collector-$(date +%Y%m%d-%H%M).log"
SUMMARY_FILE="/tmp/odds-summary.txt"
CACHE_DIR="$HOME/.cache/odds-collector"

mkdir -p "$LOG_DIR" "$CACHE_DIR"
chmod 700 "$CACHE_DIR"

echo "=== Odds Collector $(date) ===" | tee "$LOG_FILE"

cd "$PROJECT_DIR"

# Carregar credenciais
source admin-panel/.env.local 2>/dev/null || true
export SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL//\\n/}"
export SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY//\\n/}"

# Obter bot token do Render (cached)
BOT_TOKEN_FILE="$CACHE_DIR/bot-token"
if [ -f "$BOT_TOKEN_FILE" ] && [ "$(find "$BOT_TOKEN_FILE" -mtime -7)" ]; then
  TELEGRAM_BOT_TOKEN=$(cat "$BOT_TOKEN_FILE")
else
  source admin-panel/.env.render 2>/dev/null || npx vercel env pull admin-panel/.env.render --environment production --yes 2>/dev/null
  source admin-panel/.env.render 2>/dev/null
  TELEGRAM_BOT_TOKEN=$(curl -s "https://api.render.com/v1/services/srv-d6fliv6a2pns7382ckd0/env-vars" \
    -H "Authorization: Bearer ${RENDER_API_KEY:-}" | \
    python3 -c "import sys,json; [print(v['envVar']['value']) for v in json.load(sys.stdin) if v['envVar']['key']=='TELEGRAM_BOT_TOKEN']" 2>/dev/null || echo "")
  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    (umask 077 && echo "$TELEGRAM_BOT_TOKEN" > "$BOT_TOKEN_FILE")
  fi
fi

ADMIN_GROUP="-1003363567204"

# Rodar Claude
rm -f "$SUMMARY_FILE"

claude -p "/odds-collector jogos do dia

Ao final, escreva /tmp/odds-summary.txt com:
TOTAL_GAMES=<N>
TOTAL_UPDATED=<N>
TOTAL_UNAVAILABLE=<N>
STATUS=OK
DETAILS
<Jogo> (<HH:MM>) - <Liga> - <X>/4 OK
END
Se zero jogos: STATUS=EMPTY. Se erro: STATUS=ERROR com ERROR_MSG=<desc>." \
  --model claude-sonnet-4-6 \
  --max-turns 300 \
  --dangerously-skip-permissions \
  --mcp-config "$PROJECT_DIR/.mcp.json" \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Agent,Skill,mcp__playwright__browser_navigate,mcp__playwright__browser_evaluate,mcp__playwright__browser_click,mcp__playwright__create_session,mcp__playwright__close_session" \
  2>&1 | tee -a "$LOG_FILE" || true

# Enviar resultado pro Telegram
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "WARN: sem bot token, pulando Telegram" | tee -a "$LOG_FILE"
  exit 0
fi

TIMESTAMP=$(date +'%d/%m/%Y %H:%M')

if [ -f "$SUMMARY_FILE" ]; then
  STATUS=$(grep "^STATUS=" "$SUMMARY_FILE" | cut -d= -f2)

  if [ "$STATUS" = "OK" ]; then
    GAMES=$(grep "^TOTAL_GAMES=" "$SUMMARY_FILE" | cut -d= -f2)
    UPDATED=$(grep "^TOTAL_UPDATED=" "$SUMMARY_FILE" | cut -d= -f2)
    UNAVAIL=$(grep "^TOTAL_UNAVAILABLE=" "$SUMMARY_FILE" | cut -d= -f2)
    DETAILS=$(sed -n '/^DETAILS$/,/^END$/p' "$SUMMARY_FILE" | grep -v "^DETAILS$" | grep -v "^END$")
    MSG=$(printf "🎯 *ODDS COLLECTOR OK*\n\n🏟️ %s jogos\n✅ %s atualizadas\n⚠️ %s indisponíveis\n\n%s\n\n🕐 %s" "$GAMES" "$UPDATED" "$UNAVAIL" "$DETAILS" "$TIMESTAMP")
  elif [ "$STATUS" = "EMPTY" ]; then
    MSG=$(printf "🎯 *ODDS COLLECTOR*\n\n📭 Nenhum jogo elegível\n\n🕐 %s" "$TIMESTAMP")
  else
    ERROR_MSG=$(grep "^ERROR_MSG=" "$SUMMARY_FILE" 2>/dev/null | cut -d= -f2 || echo "Erro desconhecido")
    MSG=$(printf "🔴 *ODDS COLLECTOR FAILED*\n\n❌ %s\n\n🕐 %s" "$ERROR_MSG" "$TIMESTAMP")
  fi
else
  MSG=$(printf "🔴 *ODDS COLLECTOR FAILED*\n\n❌ Claude nao gerou summary\n\n🕐 %s" "$TIMESTAMP")
fi

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json
print(json.dumps({
    'chat_id': '$ADMIN_GROUP',
    'parse_mode': 'Markdown',
    'text': '''$MSG'''
}))
")"

echo "" | tee -a "$LOG_FILE"
echo "=== Done $(date) ===" | tee -a "$LOG_FILE"

#!/bin/bash
# Wrapper to launch scripts/evict-ghost-members.js from launchd.
# Loaded by ~/Library/LaunchAgents/com.gurubet.evict-ghost-{dry,apply}.plist.
#
# Arguments pass-through:
#   $ bash scripts/run-evict-ghost.sh --dry-run --notify-admin
#   $ bash scripts/run-evict-ghost.sh --apply --notify-admin
#
# Env var injection reads admin-panel/.env.local (the same source used by
# the Next.js app) and normalizes values that may contain a literal \n tail
# from past vercel env pulls.

set -euo pipefail

REPO_ROOT="/Users/wehandle/Projetos/pessoal/bets-estatistica"
cd "$REPO_ROOT"

# Year guard: launchd re-fires StartCalendarInterval every year on the given
# Month+Day+Hour. This script is a one-off for 2026-05-01 only. Exit silently
# in any other year so a forgotten agent cannot trigger kicks years later.
if [[ "$(date +%Y)" != "2026" ]]; then
  echo "run-evict-ghost: skipping, current year $(date +%Y) != 2026"
  exit 0
fi

ENV_FILE="admin-panel/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "run-evict-ghost: $ENV_FILE not found" >&2
  exit 1
fi

# Supabase — service role (required by scripts/evict-ghost-members.js).
# NEXT_PUBLIC_SUPABASE_URL values in this project sometimes have a trailing
# literal "\n" inside the quoted value; strip it.
SUPABASE_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$ENV_FILE" | sed 's/^NEXT_PUBLIC_SUPABASE_URL=//;s/^"//;s/"$//;s/\\n$//')
SUPABASE_SERVICE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" "$ENV_FILE" | sed 's/^SUPABASE_SERVICE_KEY=//;s/^"//;s/"$//;s/\\n$//')
export SUPABASE_URL
export SUPABASE_SERVICE_KEY

# lib/config.js.validateConfig() also requires these even though the script
# does not use them (it loads the per-group bot_token from the DB). Skip the
# validator instead of propagating dummy values.
export SKIP_CONFIG_VALIDATION=true

# Log marker so /tmp/evict-ghost-*.log is useful.
echo "=== run-evict-ghost.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) args=$* ==="

exec /opt/homebrew/bin/node scripts/evict-ghost-members.js "$@"

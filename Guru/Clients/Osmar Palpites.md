---
tags: [client]
render_service: srv-d6678u1r0fns73ciknn0
admin_group_id: "-1003363567204"
public_group_id: "-1003659711655"
---

# Osmar Palpites

## Overview

Osmar Palpites is the primary and currently **functioning** betting tip group. The bot makes automatic postings, responds to commands, and handles member lifecycle. It is the reference implementation for verifying that the platform code works correctly.

## Infrastructure

| Property | Value |
|---|---|
| Render Service ID | `srv-d6678u1r0fns73ciknn0` |
| Render Service Name | `bot-osmar-palpites` |
| Admin Group Chat ID | `-1003363567204` |
| Public Group Chat ID | `-1003659711655` |

## Bot Token Retrieval

```bash
# Step 1: Get Render API key from Vercel
cd admin-panel && npx vercel env pull .env.render --environment production --yes

# Step 2: Get bot token
source admin-panel/.env.render && \
curl -s "https://api.render.com/v1/services/srv-d6678u1r0fns73ciknn0/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" | \
  python3 -c "import sys,json; [print(v['envVar']['value']) for v in json.load(sys.stdin) if v['envVar']['key']=='TELEGRAM_BOT_TOKEN']"
```

## Telegram Diagnostics

```bash
# Check webhook status
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool

# Check bot can access admin group
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=-1003363567204" | python3 -m json.tool

# Check bot can access public group
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=-1003659711655" | python3 -m json.tool
```

## Current Status: OPERATIONAL

The bot is functioning with the following capabilities:
- Automatic posting at configured times (default: 10:00, 15:00, 22:00 BRT)
- Command responses in admin group (`/fila`, `/status`, `/postar`, etc.)
- Member sync, renewal reminders, kick expired
- Result tracking and alerts

## Operator Feedback

### V1: Cannot say "apostas"

The operator has explicitly requested that the bot **never use the word "apostas"** (bets) in messages sent to the public group. The preferred term is "palpites" (tips/guesses).

Currently, the `copyService.js` LLM prompt has no per-group vocabulary restrictions. The word "apostas" can appear in:
- LLM-generated copy (bullet points from `generateBetCopy()`)
- Message templates in `postBets.js` (headers like "APOSTA DO DIA", "APOSTA SEGURA")

**Fix**: Tone of voice configuration (spec Phase 4) will add `forbiddenWords: ["aposta", "apostar", "apostas"]` to the group's `copy_tone_config`. The `copyService` system prompt will include these restrictions.

### V3: Tone Control

The operator wants more control over the bot's messaging tone:
- Informal, friendly language
- Call the audience "galera"
- Confident but not arrogant

**Fix**: The "Tom de Voz" section in the admin panel (spec Task 4.2) will allow the operator to describe the desired tone in natural language. The system converts it to structured config via LLM.

### Distribution Perception

Operators perceive Osmar's bets as higher quality than [[Guru da Bet]]. This is confirmed by analysis: the round-robin algorithm systematically gives Osmar (the older group, index 0) the first picks, which tend to be higher confidence/odds from the AI pipeline.

**Fix**: Fair distribution with balancing (spec Task 3.1).

### B5: Only 3 Bets Posted

When 4+ bets are selected, only 3 are posted. This is by design (`maxActiveBets: 3` hardcoded in `lib/config.js`), but the operator expected all selected bets to be posted.

**Fix**: Remove hardcoded limit (spec Task 1.2), replace with per-group `max_active_bets` column (migration 030).

## Job Execution Monitoring

```bash
# Last 5 posting executions
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.post-bets" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool

# Last 5 distribution executions
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.distribute-bets" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool

# Last 5 manual post executions
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.post-bets-manual" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool
```

## Known Issues

- **B3: Inverted result alerts** -- LLM sometimes returns wrong result (says success when failure and vice versa). Root cause is single-LLM evaluation in `resultEvaluator.js`, not the alert code.
- **B4: Only 2 of 3 bets tracked** -- Sliding window gap in `trackResults.js`. A match that is not complete at cron time escapes the 2-4h window permanently.
- **B5: Max 3 bets per slot** -- Hardcoded limit, planned removal.
- **Message templates contain "APOSTA"** -- `MESSAGE_TEMPLATES` in `postBets.js` has headers like "APOSTA DO DIA" that ignore the operator's no-"apostas" request.

## Related

- [[Guru da Bet]] -- the other (currently offline) client
- [[Posting]] -- how bets are posted to this group
- [[Member Lifecycle]] -- member management for this group
- [[Tracking]] -- result tracking that produces alerts

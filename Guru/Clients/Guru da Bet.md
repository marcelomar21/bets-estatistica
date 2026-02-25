---
tags: [client]
render_service: srv-d5hp23a4d50c7397o1q0
admin_group_id: ""
public_group_id: ""
---

# Guru da Bet

## Overview

Guru da Bet is one of two betting tip groups operated on the platform. It is currently **offline/non-functional** -- the bot does not respond to commands and does not make automatic postings. This is the highest-priority bug (B1, B2 in the tech spec).

## Infrastructure

| Property | Value |
|---|---|
| Render Service ID | `srv-d5hp23a4d50c7397o1q0` |
| Render Service Name | `bets-bot` |
| Admin Group Chat ID | Unknown (needs investigation) |
| Public Group Chat ID | Unknown (needs investigation) |

**Important**: There are TWO Render services named `bets-bot`:
- `srv-d5hp23a4d50c7397o1q0` -- Guru da Bet bot
- `srv-d5hotp24d50c7397lcf0` -- Payment webhook

Do NOT suspend or confuse these services.

## Bot Token Retrieval

```bash
# Step 1: Get Render API key from Vercel
cd admin-panel && npx vercel env pull .env.render --environment production --yes

# Step 2: Get bot token
source admin-panel/.env.render && \
curl -s "https://api.render.com/v1/services/srv-d5hp23a4d50c7397o1q0/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" | \
  python3 -c "import sys,json; [print(v['envVar']['value']) for v in json.load(sys.stdin) if v['envVar']['key']=='TELEGRAM_BOT_TOKEN']"
```

## Current Status: OFFLINE

### Symptoms (reported by operators)

1. **No automatic postings** -- scheduled posting at 10h/15h/22h does not trigger
2. **No command responses** -- bot does not respond to `/status`, `/fila`, or any command in Telegram
3. Bot appears completely dead from the Telegram side

### Diagnosis Steps

The [[Osmar Palpites]] bot runs the exact same codebase and works correctly. This indicates the issue is likely infrastructure/configuration, not code.

Checklist:
1. Check Render service logs for crashes or errors
2. Verify webhook is configured:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool
   ```
3. Compare env vars with Osmar's service (`srv-d6678u1r0fns73ciknn0`):
   - `TELEGRAM_BOT_TOKEN` -- set?
   - `GROUP_ID` -- set and correct UUID?
   - `BOT_MODE` -- should be `group` or `mixed`
   - `TELEGRAM_ADMIN_GROUP_ID` -- set?
   - `TELEGRAM_PUBLIC_GROUP_ID` -- set?
   - `WEBHOOK_URL` or `RENDER_EXTERNAL_URL` -- set?
4. If webhook is misconfigured, re-register:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<RENDER_URL>/webhook/<TOKEN>"
   ```
5. Check if Render free tier spun down the service (15min inactivity). Webhooks should wake it up, but if the webhook URL is wrong, the wake-up signal never arrives.

### Potential Root Causes

- **Env var misconfiguration**: `BOT_MODE`, `GROUP_ID`, or Telegram IDs not set or wrong
- **Webhook URL wrong**: Render URL changed or was never set
- **Service crashed on startup**: bad env var causes `validateConfig()` to `process.exit(1)`
- **Silent crash**: unhandled promise rejection killing the process (no `process.on('unhandledRejection')` handler in `server.js`)

## Known Issues

- No auto-posting -- B1 in tech spec
- No command responses -- B2 in tech spec
- Distribution bias: Guru systematically gets lower-quality bets due to round-robin ordering (D1, D2). Guru is the newer group (created after Osmar), so it gets bet[1], bet[3], bet[5]... while Osmar gets bet[0], bet[2], bet[4]...
- Operators perceive Guru's bets as inferior (consequence of D1/D2)

## Planned Fixes

- **Phase 1, Task 1.1**: Diagnose and fix Guru offline
- **Phase 3, Task 3.1**: Fair distribution to eliminate systematic bias
- **Phase 5**: Consolidate into single multi-bot process (eliminates separate Render services)

## Related

- [[Osmar Palpites]] -- the working bot, same codebase
- [[Posting]] -- the posting flow that should be running
- [[Distribution]] -- the distribution bias affecting bet quality

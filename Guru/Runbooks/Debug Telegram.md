---
title: Debug Telegram
type: note
permalink: guru/runbooks/debug-telegram
---

# Debug Telegram

## 1. Obter BOT_TOKEN do Render

```bash
cd admin-panel && npx vercel env pull .env.render --environment production --yes
source .env.render
curl -s "https://api.render.com/v1/services/srv-d6fliv6a2pns7382ckd0/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" | \
  python3 -c "import sys,json; [print(v['envVar']['value']) for v in json.load(sys.stdin) if v['envVar']['key']=='TELEGRAM_BOT_TOKEN']"
```

## 2. Verificar acesso do bot a um grupo

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<CHAT_ID>" | python3 -m json.tool
```

## 3. Verificar webhook ativo

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool
```

## 4. Consultar job executions

```bash
# Últimas 5 execuções de post manual
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.post-bets-manual" \
  -H "apikey: <SUPABASE_SERVICE_KEY>" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_KEY>" | python3 -m json.tool
```

O `SUPABASE_SERVICE_KEY` está em `admin-panel/.env.local`.

## IDs dos grupos

| Grupo | Chat ID |
|---|---|
| Guru da Bet (admin) | `-1003363567204` |
| Guru da Bet (público) | `-1003647535811` |
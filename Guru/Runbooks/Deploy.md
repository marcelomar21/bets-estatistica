---
title: Deploy
type: note
permalink: guru/runbooks/deploy
---

# Deploy

## Admin Panel (Vercel)
Deploy automático via Git integration. Cada push pra `master` faz deploy.

```bash
# Verificar status
npx vercel ls

# Deploy manual (se necessário)
cd admin-panel && npx vercel --prod
```

## Bot (Render)
Auto-deploy **desligado** para `srv-d6fliv6a2pns7382ckd0` (bets-bot-unified).

```bash
# Trigger manual via API
source admin-panel/.env.render
curl -s -X POST "https://api.render.com/v1/services/srv-d6fliv6a2pns7382ckd0/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "clear"}'
```

Build + deploy leva ~2-3 min.

## Migrations (Supabase)

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL_AQUI>"}'
```

Resposta `[]` = sucesso para DDL (CREATE, ALTER, DROP).

## BOT_MODE

O bot unificado roda em modo `mixed` (configurado no Render como env var). Neste modo:
- Jobs centrais (distribute-bets, health-check) rodam uma vez
- Jobs de grupo (posting, membership) rodam por grupo via factory schedulers
- Alterado de `group` para `mixed` no PR #161

## Webhook Service

O servico de webhook do Mercado Pago roda separado:
- **Service:** `bets-webhook` (`srv-d5m5cmje5dus73e8ds10`)
- **URL:** bets-webhook.onrender.com
- **Plan:** Free
- Deploy manual (mesmo processo do bot principal)
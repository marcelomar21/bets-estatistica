---
title: Infrastructure
created: 2026-02-25
tags: [project, infra]
---

## Supabase

- **Project ref:** `vqrcuttvcgmozabsqqja`
- **Region:** East US (North Virginia)
- **Env file:** `admin-panel/.env.local`

### Migrations

As migrations SQL ficam em `sql/migrations/` com numeracao sequencial (ex: `028_descricao.sql`).

### Como Aplicar Migrations

Usar a **Supabase Management API** via curl:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL_AQUI>"}'
```

O access token do CLI fica no macOS Keychain (service: "Supabase CLI"). Para extrair:

```bash
security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d
```

### Verificar se a Migration foi Aplicada

Consultar as policies/tabelas via a mesma API para confirmar que o objeto foi criado.

Resposta `[]` (array vazio) indica sucesso para comandos DDL (CREATE, ALTER, DROP).

---

## Render -- Servicos

| Service ID | Nome | Funcao |
|---|---|---|
| `srv-d6678u1r0fns73ciknn0` | bot-osmar-palpites | Bot do grupo Osmar Palpites |
| `srv-d5hp23a4d50c7397o1q0` | bets-bot | Bot do grupo Guru da Bet |
| `srv-d5hotp24d50c7397lcf0` | bets-bot | Webhook de pagamento |
| `srv-d5v4u8npm1nc73cao690` | clawdin-api | API do Clawdin |
| `srv-d5m5cmje5dus73e8ds10` | bets-webhook | Webhook de apostas |

**IMPORTANTE:** NAO suspender os servicos `bets-bot` -- eles servem grupos diferentes.

### Obter RENDER_API_KEY (esta no Vercel)

```bash
cd admin-panel && npx vercel env pull .env.render --environment production --yes
```

### Obter BOT_TOKEN do Render

```bash
source admin-panel/.env.render && \
curl -s "https://api.render.com/v1/services/srv-d6678u1r0fns73ciknn0/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" | \
  python3 -c "import sys,json; [print(v['envVar']['value']) for v in json.load(sys.stdin) if v['envVar']['key']=='TELEGRAM_BOT_TOKEN']"
```

---

## Telegram -- Grupos

| Grupo | Chat ID |
|---|---|
| Osmar Palpites (admin) | `-1003363567204` |
| Osmar Palpites (publico) | `-1003659711655` |

### Diagnosticar Grupo/Chat

```bash
# Verificar se o bot tem acesso a um grupo
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<CHAT_ID>" | python3 -m json.tool

# Verificar webhook ativo
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool
```

### Consultar Execucoes de Jobs (Supabase)

```bash
# Ultimas 5 execucoes de post manual
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.post-bets-manual" \
  -H "apikey: <SUPABASE_SERVICE_KEY>" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_KEY>" | python3 -m json.tool

# Ultimas 5 execucoes de distribute-bets
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.distribute-bets" \
  -H "apikey: <SUPABASE_SERVICE_KEY>" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_KEY>" | python3 -m json.tool
```

O `SUPABASE_SERVICE_KEY` esta em `admin-panel/.env.local`.

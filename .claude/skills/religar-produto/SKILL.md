# Religar Produto (GuruBet)

Procedimento interativo para reativar o GuruBet após o shutdown documentado em `HANDOFF.md` seção 12.

## Como usar

Esta skill executa **passo a passo, com confirmação humana entre cada etapa**. Não pular passos. Não rodar tudo em batch — cada passo tem validação que precisa ser confirmada antes do próximo.

A cada etapa, esta skill:
1. Mostra **o que vai fazer**
2. Mostra **o comando exato** (ou ação no painel web)
3. Pergunta se pode prosseguir
4. Após executar, valida e mostra o **resultado esperado**
5. Só avança para o próximo passo após confirmação

Se algum passo falhar, a skill **para imediatamente** e reporta o erro — não tenta workaround.

## Referência base

Toda esta skill é uma versão executável do `HANDOFF.md` seções 13.1, 13.2 e 13.3. Quando algum passo deixar dúvida (ex: "qual ID do serviço?", "onde estão os secrets?"), consultar:

- `HANDOFF.md` seção 6 — inventário detalhado de cada serviço
- `HANDOFF.md` seção 7 — onde encontrar cada secret
- `HANDOFF.md` seção 11 — banco de dados (project ref, migrations)

## Pré-requisitos antes de começar

Antes do passo 1, perguntar ao operador e confirmar com sim/não:

- [ ] Tem acesso à conta Supabase do projeto `vqrcuttvcgmozabsqqja`?
- [ ] Tem acesso à conta Render (workspace "My Workspace")?
- [ ] Tem acesso à team Vercel `team_CNoiSynMmrxky1dmtI6DPRdY`?
- [ ] Tem acesso ao GitHub repo `marcelomar21/bets-estatistica` (com permissão de admin para enable workflows)?
- [ ] Tem os secrets locais (`.env`, `admin-panel/.env.local`) ou consegue obtê-los conforme `HANDOFF.md` seção 7 ("Setup local do zero")?
- [ ] Está em uma máquina com Node 20, npm, gh CLI e supabase CLI instalados?

Se qualquer resposta for "não", parar e instruir o operador a obter o acesso/setup antes de seguir.

## Steps

### Step 1 — Restaurar setup local

**Por que primeiro**: precisamos do `.env` válido para validar o restante do procedimento.

**O que fazer**:
1. Verificar se existem `.env` (raiz) e `admin-panel/.env.local` na máquina atual
2. Se faltarem: copiar dos templates e preencher

**Comandos**:
```bash
# Se faltarem
cp .env.example .env
cp admin-panel/.env.example admin-panel/.env.local

# Validar (deve listar variáveis obrigatórias)
grep -E "^[A-Z_]+=" .env | wc -l
grep -E "^[A-Z_]+=" admin-panel/.env.local | wc -l
```

**Validação**:
- `.env` precisa ter no mínimo `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN` (ou usa de `bot_pool` em runtime)
- `admin-panel/.env.local` precisa ter `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `ENCRYPTION_KEY`

**Pergunta antes de prosseguir**: secrets estão preenchidos? (s/n)

---

### Step 2 — Religar Supabase

**Por que segundo**: tudo depende do banco. Se o banco está pausado, nada funciona.

**O que fazer**:
1. Abrir https://supabase.com/dashboard/project/vqrcuttvcgmozabsqqja
2. Se aparecer banner "Project paused" → clicar em **Restore project**
3. Esperar ~5 minutos até o status ficar "Active"

**Validação**:
```bash
# Carregar env
source .env

# Testar conexão
curl -s "${SUPABASE_URL}/rest/v1/groups?select=id,name,status&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"
```

**Resultado esperado**: JSON array com 3 grupos. Se retornar erro 503 ou demorar mais de 30s, o projeto ainda está restaurando.

**Pergunta antes de prosseguir**: Supabase respondeu? (s/n)

---

### Step 3 — Religar Render (3 serviços)

**Por que agora**: os 3 serviços Render são a infra de runtime. Precisam estar ativos antes de re-registrar webhooks.

**O que fazer**:
1. Abrir https://dashboard.render.com
2. Localizar e clicar em **Resume Service** para cada um:
   - `bets-bot-unified` (`srv-d6fliv6a2pns7382ckd0`) — bot Telegram principal
   - `bets-webhook` (`srv-d5m5cmje5dus73e8ds10`) — webhook Mercado Pago
   - `bets-whatsapp` — servidor WhatsApp Baileys (ID via console; ver `HANDOFF.md` 6.2)
3. Esperar ~2 minutos por cada (cold start em plano free)

**Validação**:
```bash
curl -fs https://bets-bot-unified.onrender.com/health
curl -fs https://bets-webhook.onrender.com/health
curl -fs https://bets-whatsapp.onrender.com/health
```

**Resultado esperado**: HTTP 200 nos 3 endpoints. Se 503/502, o serviço ainda está iniciando — esperar mais 1-2 min.

**Pergunta antes de prosseguir**: 3 serviços respondendo healthy? (s/n)

---

### Step 4 — Religar Vercel (admin-panel + landing-page)

**Por que agora**: admin-panel precisa estar online para gestão dos grupos. Landing-page é interface pública.

**O que fazer**:
1. Vercel → projeto `admin-panel` → Settings → Git → toggle **"Production Deployment" on**
2. Vercel → projeto `landing-page` → Settings → Git → toggle **"Production Deployment" on**
3. Em cada projeto, ir em Deployments → clicar **Redeploy** na última production deployment (para forçar build)
4. Esperar build completar (~3-5 min cada)

**Validação**:
```bash
curl -fs https://admin.gurudabet.com.br | grep -i "<title>" | head -1
# Resultado esperado: tag <title> com texto do dashboard
```

**Pergunta antes de prosseguir**: admin-panel respondeu com HTML válido? (s/n)

---

### Step 5 — Re-registrar webhooks Telegram

**Por que agora**: o serviço Render já está vivo, agora cada bot precisa apontar webhook para ele.

**O que fazer**: o `bets-bot-unified` re-registra webhooks **automaticamente** no startup ao ler a tabela `bot_pool`. **Verificar** que isso aconteceu.

**Validação**:
```bash
# Para cada bot ativo no bot_pool, verificar webhook
source .env
curl -s "${SUPABASE_URL}/rest/v1/bot_pool?select=bot_username,bot_token&is_active=eq.true" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
| python3 -c "
import sys, json, urllib.request
bots = json.load(sys.stdin)
for b in bots:
    token = b['bot_token']
    info = json.loads(urllib.request.urlopen(f'https://api.telegram.org/bot{token}/getWebhookInfo').read())
    url = info.get('result', {}).get('url', '')
    ok = 'bets-bot-unified.onrender.com' in url
    print(f\"{b['bot_username']}: {'OK' if ok else 'FALTA'} - {url[:80]}\")
"
```

**Resultado esperado**: cada bot ativo deve mostrar `OK` com URL apontando para `bets-bot-unified.onrender.com`. Se algum mostrar `FALTA`, fazer restart do serviço Render para forçar re-registro:

```bash
source admin-panel/.env.render  # carrega RENDER_API_KEY
curl -s -X POST "https://api.render.com/v1/services/srv-d6fliv6a2pns7382ckd0/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}'
```

**Pergunta antes de prosseguir**: todos os bots ativos têm webhook OK? (s/n)

---

### Step 6 — Reabilitar webhook do Mercado Pago

**Por que agora**: sem webhook MP funcionando, novas assinaturas não são processadas.

**O que fazer**:
1. https://www.mercadopago.com.br/developers/panel
2. Suas Aplicações → app GuruBet → Webhooks
3. Re-habilitar a URL `https://bets-webhook.onrender.com/webhooks/mercadopago`
4. Confirmar que está com modo **Production** (não Sandbox)

**Validação**:
1. No painel MP: usar botão **"Send test"** para o webhook
2. Verificar no banco que o evento chegou:
```bash
source .env
curl -s "${SUPABASE_URL}/rest/v1/webhook_events?order=created_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"
```

**Resultado esperado**: o evento mais recente em `webhook_events` deve ter `created_at` dos últimos minutos.

**Pergunta antes de prosseguir**: webhook teste do MP foi registrado? (s/n)

---

### Step 7 — Reabilitar GitHub Actions workflows

**Por que agora**: cron jobs precisam voltar a rodar (daily-pipeline às 09:00 UTC, odds-collector 14:00/18:00 UTC).

**Comando**:
```bash
gh workflow enable "CI/CD" --repo marcelomar21/bets-estatistica
gh workflow enable "Daily Pipeline" --repo marcelomar21/bets-estatistica
gh workflow enable "Odds Collector" --repo marcelomar21/bets-estatistica

# Verificar
gh workflow list --repo marcelomar21/bets-estatistica
```

**Resultado esperado**: 3 workflows com status `active`.

**Pergunta antes de prosseguir**: 3 workflows ativos? (s/n)

---

### Step 8 — Sanity check completo

**Por que agora**: validar que toda a cadeia está funcionando ponta-a-ponta antes de declarar "religado".

**Checklist**:
```bash
# 1. Bot Telegram vivo
curl -fs https://bets-bot-unified.onrender.com/health && echo " ✓ bot vivo"

# 2. Webhook MP vivo
curl -fs https://bets-webhook.onrender.com/health && echo " ✓ webhook vivo"

# 3. WhatsApp vivo
curl -fs https://bets-whatsapp.onrender.com/health && echo " ✓ whatsapp vivo"

# 4. Admin panel vivo
curl -fs -o /dev/null -w "%{http_code}\n" https://admin.gurudabet.com.br

# 5. Banco respondendo com dados
source .env
curl -s "${SUPABASE_URL}/rest/v1/groups?select=count&status=eq.active" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"

# 6. Job executions recentes (devem aparecer logo após o bot subir)
curl -s "${SUPABASE_URL}/rest/v1/job_executions?order=created_at.desc&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}"

# 7. Workflows GH ativos
gh workflow list --repo marcelomar21/bets-estatistica
```

**Resultado esperado**:
- Pontos 1-4: HTTP 200
- Ponto 5: count > 0 (grupos ativos)
- Ponto 6: pelo menos 1 job_execution recente (heartbeat do bot)
- Ponto 7: 3 workflows com status `active`

---

### Step 9 — Validação humana no Telegram

**Por que**: nada substitui o teste real. Antes de declarar "religado", confirmar visualmente.

**O que fazer**:
1. Abrir o Telegram do operador (`@marcelomar1121`)
2. Enviar `/start` para um dos bots ativos do `bot_pool`
3. Confirmar que o bot responde com a mensagem de boas-vindas
4. Verificar que pelo menos um grupo público recebeu mensagem nas últimas 24h (ex: aposta postada, recap, etc.)

**Pergunta final**: bot respondeu no Telegram? (s/n)

---

## Report final

Após o Step 9, output:

```
## Religar Produto — Relatório
- [✓] Setup local restaurado
- [✓] Supabase ativo
- [✓] Render: 3 serviços resumed
- [✓] Vercel: 2 projetos com production deploy ativo
- [✓] Webhooks Telegram registrados em N bots
- [✓] Webhook Mercado Pago reabilitado
- [✓] 3 workflows GitHub Actions ativos
- [✓] Sanity check: todos endpoints OK
- [✓] Validação humana: bot respondeu

Produto religado em: <data/hora BRT>
Próximo deploy automático em: <horário do próximo cron>
```

Se qualquer passo falhou, o report tem que listar **qual step falhou + o erro exato**, não tentar mascarar.

## Quando NÃO usar esta skill

- Se nunca rodou shutdown (seção 12 do HANDOFF) → produto provavelmente já está vivo, não precisa religar
- Se está em meio de incidente em produção → usar runbook de incident, não esta skill
- Se quer só restartar 1 serviço (ex: bot caiu) → não precisa do procedimento completo, basta `Resume Service` no Render

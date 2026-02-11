# Project: bets-estatistica (GuruBet)

## Supabase

- **Project ref:** `vqrcuttvcgmozabsqqja`
- **Region:** East US (North Virginia)
- **Env file:** `admin-panel/.env.local`

## Migrations

As migrations SQL ficam em `sql/migrations/` com numeracao sequencial (ex: `028_descricao.sql`).

### Como aplicar migrations

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

### Verificar se a migration foi aplicada

Consultar as policies/tabelas via a mesma API para confirmar que o objeto foi criado.

Resposta `[]` (array vazio) indica sucesso para comandos DDL (CREATE, ALTER, DROP).

## Validacao pre-merge (OBRIGATORIO)

**SEMPRE** rodar **todos** os passos abaixo antes de criar PR ou mergear:

1. `cd admin-panel && npm test` — roda vitest (testes unitarios)
2. `npm run build` — roda o build do Next.js com checagem TypeScript strict
3. **Playwright E2E** — abrir o navegador via Playwright MCP e testar o fluxo afetado na aplicacao rodando (`localhost:3000`). Verificar que a mudanca funciona de verdade na UI.

Os tres devem passar sem erros. Nunca mergear apenas com testes unitarios + build.

## Testes no navegador (E2E) — OBRIGATORIO

O Playwright MCP esta configurado para testes via navegador.

**SEMPRE rodar testes E2E via Playwright antes de criar PR.** Isso nao e opcional — faz parte da validacao pre-merge assim como `npm test` e `npm run build`.

### Quando rodar

- **Qualquer mudanca em API routes** (`/api/**`): testar a funcionalidade correspondente na UI
- **Qualquer mudanca em componentes** (`/components/**`): testar o componente no navegador
- **Qualquer mudanca em lib** (`/lib/**`): testar o fluxo que usa aquela lib na UI
- Na duvida, **sempre rodar**. Melhor testar demais do que de menos.

### Como rodar

1. Garantir que o dev server esta rodando (`npm run dev` no admin-panel)
2. Usar o Playwright MCP para navegar ate a pagina afetada
3. Executar o fluxo completo que a mudanca afeta
4. Verificar resultado final (nao apenas acao intermediaria)

### Rigor nos testes E2E (OBRIGATORIO)

Ao testar fluxos via Playwright, ser **extremamente criterioso**:

- **Validar o resultado final**, nao apenas a acao intermediaria. Se o fluxo envolve enviar algo ao Telegram, abrir o Telegram Web e verificar que a mensagem chegou corretamente.
- **Questionar mensagens de sucesso**: se o sistema diz "promovido com sucesso" mas o item nao aparece onde deveria, isso e um bug — reportar imediatamente.
- **Testar fluxos completos end-to-end**: nao parar no meio. Se o teste e "promover e postar", ir ate o final e verificar no destino (Telegram, banco, etc).
- **Validar pre-condicoes**: antes de executar uma acao (ex: promover), verificar se a aposta tem os dados necessarios (link, odds). Se nao tem, o sistema deveria bloquear — se nao bloqueia, e bug.
- **Nao ignorar inconsistencias**: se algo parece errado (contadores nao batem, item sumiu, mensagem no lugar errado), investigar e reportar.

## Telegram — Debug de mensagens

### Servicos no Render

| Service ID | Nome | Funcao |
|---|---|---|
| `srv-d6678u1r0fns73ciknn0` | bot-osmar-palpites | Bot do grupo Osmar Palpites |
| `srv-d5hp23a4d50c7397o1q0` | bets-bot | Bot do grupo Guru da Bet |
| `srv-d5hotp24d50c7397lcf0` | bets-bot | Webhook de pagamento |
| `srv-d5v4u8npm1nc73cao690` | clawdin-api | API do Clawdin |
| `srv-d5m5cmje5dus73e8ds10` | bets-webhook | Webhook de apostas |

**IMPORTANTE:** NAO suspender os servicos `bets-bot` — eles servem grupos diferentes.

### Passo 1: Obter RENDER_API_KEY (esta no Vercel)

```bash
cd admin-panel && npx vercel env pull .env.render --environment production --yes
```

### Passo 2: Obter BOT_TOKEN do Render

```bash
source admin-panel/.env.render && \
curl -s "https://api.render.com/v1/services/srv-d6678u1r0fns73ciknn0/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" | \
  python3 -c "import sys,json; [print(v['envVar']['value']) for v in json.load(sys.stdin) if v['envVar']['key']=='TELEGRAM_BOT_TOKEN']"
```

### Passo 3: Diagnosticar grupo/chat no Telegram

```bash
# Verificar se o bot tem acesso a um grupo
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<CHAT_ID>" | python3 -m json.tool

# Verificar webhook ativo
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool
```

### Passo 4: Consultar execucoes de jobs (Supabase)

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

O SUPABASE_SERVICE_KEY esta em `admin-panel/.env.local` (variavel `SUPABASE_SERVICE_KEY`).

### IDs dos grupos

| Grupo | Chat ID |
|---|---|
| Osmar Palpites (admin) | `-1003363567204` |
| Osmar Palpites (publico) | `-1003659711655` |

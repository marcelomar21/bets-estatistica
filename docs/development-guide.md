# GuruBet (bets-estatistica) - Guia de Desenvolvimento

## Setup do Ambiente

### Pre-requisitos

| Requisito | Versao | Descricao |
|-----------|--------|-----------|
| Node.js | 20+ | Runtime JavaScript |
| npm | 10+ | Gerenciador de pacotes |
| Supabase CLI | (opcional) | Para aplicar migrations localmente |

### Backend (Bots + Pipeline)

```bash
# Instalar dependencias na raiz
npm install

# Configurar variaveis de ambiente
cp .env.example .env   # editar com suas chaves

# Bot em modo polling (desenvolvimento local)
npm run dev

# Bot em modo webhook (producao no Render)
npm start

# Pipeline de analise IA
npm run pipeline
```

O modo `dev` usa polling (sem necessidade de URL publica). O modo `start` sobe um
servidor Express que recebe webhooks do Telegram e agenda todos os cron jobs.

### Admin Panel

```bash
cd admin-panel
npm install

# Configurar variaveis de ambiente
cp .env.example .env.local   # editar com suas chaves

# Servidor de desenvolvimento
npm run dev                  # http://localhost:3000

# Build com TypeScript strict
npm run build

# Testes unitarios (vitest)
npm test
```

## Variaveis de Ambiente

### Backend (.env na raiz)

| Variavel | Descricao |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key do Supabase |
| `TELEGRAM_BOT_TOKEN` | Token do bot (@BotFather) |
| `TELEGRAM_ADMIN_GROUP_ID` | Chat ID do grupo admin |
| `TELEGRAM_PUBLIC_GROUP_ID` | Chat ID do grupo publico |
| `THE_ODDS_API_KEY` | Chave da API The Odds |
| `FOOTYSTATS_API_KEY` | Chave da API FootyStats |
| `OPENAI_API_KEY` | Chave da API OpenAI (GPT-4o) |
| `GROUP_ID` | (opcional) UUID do grupo para modo multi-tenant |
| `MP_ACCESS_TOKEN` | Access token do Mercado Pago |
| `MP_WEBHOOK_SECRET` | Secret para validar webhooks do MP |

### Admin Panel (.env.local)

| Variavel | Descricao |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL publica do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (server-side) |
| `TELEGRAM_API_ID` | API ID do Telegram (MTProto) |
| `TELEGRAM_API_HASH` | API Hash do Telegram (MTProto) |
| `ENCRYPTION_KEY` | Chave para criptografia de sessoes |

## Estrutura de Diretorios

```
bets-estatistica/
├── bot/                    # Telegram bot (webhook/polling)
│   ├── handlers/           # Command handlers
│   │   ├── admin/          # Modulos do grupo admin (bet, member, action, query)
│   │   ├── adminGroup.js   # Router de comandos admin
│   │   ├── memberEvents.js # Eventos de entrada/saida de membros
│   │   └── startCommand.js # /start no privado
│   ├── jobs/               # Jobs agendados (cron)
│   │   ├── membership/     # Jobs de membership (kick, reconciliation, sync)
│   │   ├── postBets.js     # Publicacao de apostas
│   │   ├── distributeBets.js # Distribuicao round-robin
│   │   ├── enrichOdds.js   # Enriquecimento de odds
│   │   ├── trackResults.js # Rastreamento de resultados
│   │   └── healthCheck.js  # Health check periodico
│   ├── services/           # Logica de negocio
│   ├── server.js           # Entry point (webhook + scheduler)
│   └── server.scheduler.js # Scheduler dinamico de postagens
├── agent/                  # Pipeline de analise IA
│   ├── analysis/           # LangChain + GPT-4o
│   └── persistence/        # Persistencia dos resultados
├── scripts/                # Scripts de fetch/sync de dados
├── sql/migrations/         # 28 migrations PostgreSQL sequenciais
├── lib/                    # Utilitarios compartilhados
├── admin-panel/            # Dashboard Next.js
│   └── src/
│       ├── app/            # Pages + API routes (App Router)
│       ├── components/     # Componentes React
│       ├── lib/            # Utilitarios
│       ├── middleware/      # Auth + tenant
│       └── types/          # Tipos TypeScript
└── docs/                   # Documentacao
```

## Comandos do Bot (Grupo Admin)

Os comandos sao enviados diretamente no grupo admin do Telegram:

### Apostas

| Comando | Descricao |
|---------|-----------|
| `/apostas` | Lista apostas pendentes/prontas para postar |
| `/odd <id> <valor>` | Define a odd de uma aposta |
| `/link <id> <url>` | Define o link de afiliado de uma aposta |
| `/filtrar <criterio>` | Filtra apostas por status ou criterio |
| `/fila` | Mostra a fila de apostas aguardando publicacao |
| `/promover <id>` | Promove uma aposta para publicacao |
| `/remover <id>` | Remove uma aposta da fila |

### Membros

| Comando | Descricao |
|---------|-----------|
| `/membros` | Lista membros do grupo com status |
| `/membro <id>` | Detalhes de um membro especifico |
| `/trial` | Configuracao do periodo de trial |
| `/add_trial <user>` | Adiciona membro em trial |
| `/remover_membro <id>` | Remove membro do grupo |
| `/estender <id> <dias>` | Estende assinatura de um membro |

### Acoes

| Comando | Descricao |
|---------|-----------|
| `/postar` | Publica apostas prontas no grupo publico |
| `/atualizar` | Atualiza odds de apostas pendentes |
| `/trocar <id1> <id2>` | Troca posicao de apostas na fila |
| `/adicionar` | Adiciona aposta manualmente |

### Consultas

| Comando | Descricao |
|---------|-----------|
| `/overview` | Visao geral do dia (apostas, membros, metricas) |
| `/metricas` | Metricas de desempenho (ROI, taxa de acerto) |
| `/status` | Status do bot e servicos |
| `/simular` | Simula publicacao sem enviar |
| `/atualizados` | Lista jogos com odds atualizadas |
| `/help` | Lista todos os comandos disponiveis |

## Jobs Agendados

O scheduler roda dentro do `server.js` e usa `node-cron` (timezone `America/Sao_Paulo`).

### Jobs de Grupo (BOT_MODE=group ou mixed)

| Schedule | Job | Descricao |
|----------|-----|-----------|
| Dinamico (DB) | `post-bets` | Publica apostas nos horarios configurados (default: 10h, 15h, 22h) |
| Dinamico - 5min | `distribute-bets` | Distribui apostas 5 min antes de cada postagem |
| `0 10 * * *` | `renewal-reminders` | Lembrete de renovacao de assinatura |
| `*/30 * * * *` | `sync-group-members` | Sincroniza membros do grupo via Telegram |
| A cada 30s | `check-post-now` | Verifica flag de postagem manual (admin panel) |
| A cada 5min | `reload-schedule` | Recarrega horarios de postagem do banco |

### Jobs Centrais (BOT_MODE=central ou mixed)

| Schedule | Job | Descricao |
|----------|-----|-----------|
| `*/15 * * * *` | `distribute-bets` | Distribuicao round-robin de apostas |
| `0 8 * * *` | `enrich-odds` | Enriquecimento de odds via API |
| `0 13-23 * * *` | `track-results` | Rastreamento de resultados (a cada hora, 13h-23h) |
| A cada 30s | `process-webhooks` | Processa webhooks do Mercado Pago |
| `1 0 * * *` | `kick-expired` | Remove membros com assinatura expirada |
| `30 0 * * *` | `check-affiliate-expiration` | Verifica expiracao de afiliados |
| `0 3 * * *` | `reconciliation` | Reconciliacao de pagamentos |
| `0 * * * *` | `cleanup-stuck-jobs` | Limpa execucoes travadas |

### Jobs Gerais

| Schedule | Job | Descricao |
|----------|-----|-----------|
| `*/5 * * * *` | `health-check` | Verifica saude do bot e conexoes |

## Validacao Pre-merge (OBRIGATORIO)

Antes de criar PR ou mergear, **todos** os passos abaixo devem passar:

```bash
# 1. Testes unitarios (vitest)
cd admin-panel && npm test

# 2. Build com TypeScript strict
npm run build

# 3. Testes E2E via Playwright
# Garantir que o dev server esta rodando (npm run dev)
# Navegar ate a pagina afetada e testar o fluxo completo
```

Nunca mergear apenas com testes unitarios + build. O teste E2E via Playwright e
parte obrigatoria da validacao.

## Migrations

As migrations ficam em `sql/migrations/` com numeracao sequencial (ex: `028_descricao.sql`).
Atualmente existem 28 migrations.

### Como aplicar uma migration

Usar a Supabase Management API via curl:

```bash
# Extrair o access token do Keychain (macOS)
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d)

# Aplicar a migration
curl -s -X POST \
  "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL_DA_MIGRATION>"}'
```

Resposta `[]` (array vazio) indica sucesso para comandos DDL (CREATE, ALTER, DROP).

### Criar nova migration

Seguir o padrao de numeracao sequencial:

```bash
# Verificar o ultimo numero
ls sql/migrations/ | tail -1
# Criar arquivo com o proximo numero
touch sql/migrations/029_descricao_da_mudanca.sql
```

## Troubleshooting

### Bot nao responde no Telegram

1. Verificar se o webhook esta ativo:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | python3 -m json.tool
   ```
2. Em desenvolvimento local, usar modo polling (`npm run dev`) — o webhook nao
   funciona sem URL publica.
3. Verificar se o `TELEGRAM_ADMIN_GROUP_ID` esta correto.

### Erro de conexao com Supabase

- Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no `.env`.
- Confirmar que o projeto Supabase esta ativo (nao pausado).

### Build do admin-panel falha

- Verificar erros de TypeScript — o build usa modo strict.
- Rodar `npm test` primeiro para identificar falhas em testes.

### Jobs nao executam

- Verificar o `BOT_MODE` (deve ser `group`, `central` ou `mixed`).
- Verificar logs no Render para erros de cron.
- Consultar tabela `job_executions` no Supabase para historico.

### Postagens nao aparecem no grupo

- Verificar se ha apostas com status `ready` na tabela `suggested_bets`.
- Confirmar que `posting_schedule.enabled = true` na tabela `groups`.
- Verificar se o bot tem permissao de enviar mensagens no grupo publico.

### Webhooks do Mercado Pago nao processam

- Verificar `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`.
- Consultar tabela `webhook_events` para eventos pendentes.
- O job `process-webhooks` roda a cada 30 segundos.

## Convencoes de Codigo

- **Linguagem:** JavaScript (ES2022+) no backend, TypeScript no admin-panel
- **Modulos:** CommonJS (`require`/`module.exports`) no backend
- **Framework web:** Express (bot), Next.js 14 App Router (admin-panel)
- **Banco:** Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Async:** async/await em todo o projeto
- **Validacao:** Zod schemas
- **Commits:** Conventional commits (`feat(scope):`, `fix(scope):`, `refactor(scope):`)
- **Branches:** `feature/`, `fix/`, `refactor/`, `chore/` — nunca commitar na main/master

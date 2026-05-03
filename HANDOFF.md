# HANDOFF — GuruBet (bets-estatistica)

> Documento de repasse técnico para o próximo desenvolvedor.
> Última atualização: **2026-05-03** — projeto pausado.

---

## 0. Como ler esse documento

Esse arquivo cobre **tudo** que você precisa para retomar o projeto ou só mantê-lo desligado:

1. Seções **1 a 5** — entender o que é o projeto, onde estão as coisas, qual stack
2. Seções **6 a 8** — inventário completo de serviços externos, secrets e variáveis de ambiente
3. Seções **9 a 11** — o que está rodando automaticamente (crons, webhooks, banco)
4. **Seção 12** — 🔌 procedimento de shutdown (ligar tudo no modo "pausado, sem deletar")
5. Seção **13** — checklist reverso para religar o projeto
6. Seção **14** — pointers para documentação interna mais antiga

Se você é o operador atual (Marcelo) e só quer desligar tudo: vá direto para a **seção 12**.

---

## 1. Status do projeto

- **Estado**: pausado em **2026-05-03**, repo local sincronizado com `origin/master`
- **Branch ativa**: `master` (limpa, alinhada com remote)
- **Último commit em produção**: `607242c chore(membership): commit launchd plist references for evict-ghost schedule (#230)`
- **Trabalho mais recente**: PRs #227–#230 (cleanup de "ghost members" — eviction em massa, normalização de `telegram chat_id`, status `evadido`, tracking de `/start`)
- **Tag mais recente**: `v1.0`
- **Owner**: Marcelo Mendes (`marcelomar21` no GitHub, `marcelomar1121` no Telegram)

---

## 2. Visão geral / arquitetura

GuruBet é uma **plataforma SaaS multi-tenant** para gestão de grupos de apostas esportivas no Telegram (e em expansão para WhatsApp). Vários influencers operam grupos isolados; o sistema usa LLM (LangChain + OpenAI) para analisar partidas, gera apostas, distribui em canais e cobra os membros via Mercado Pago.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIOS                                │
│   Membros (Telegram)        Operadores (admin)                  │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
           │                          ▼
           │              ┌──────────────────────┐
           │              │  Admin Panel (Next)  │
           │              │  Vercel              │
           │              │  admin.gurudabet...  │
           │              └──────────┬───────────┘
           │                         │
           ▼                         │
┌──────────────────────┐             │
│  Bot Telegram        │             │
│  bets-bot-unified    │             │
│  Render (Node 20)    │◄────────────┤
│  Webhook + Polling   │             │
└──────────┬───────────┘             │
           │                         │
           │     ┌───────────────────┼─────────────────┐
           ▼     ▼                   ▼                 ▼
       ┌──────────────────┐   ┌──────────────┐  ┌──────────────┐
       │   Supabase       │   │ OpenAI       │  │ Mercado Pago │
       │   Postgres+Auth  │   │ (GPT-5.4)    │  │ (PIX/Card)   │
       │   us-east-1      │   │              │  │              │
       └──────────────────┘   └──────────────┘  └──────┬───────┘
                                                       │
                                                       ▼
                                          ┌──────────────────────┐
                                          │ bets-webhook         │
                                          │ Render (HMAC verify) │
                                          └──────────────────────┘

  Workflows agendados (GitHub Actions):
  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────┐
  │ daily-pipeline      │  │ odds-collector      │  │ ci/cd        │
  │ 09:00 UTC diário    │  │ 14:00 + 18:00 UTC   │  │ on push/PR   │
  │ FootyStats + LLM    │  │ Betano (Playwright) │  │ deploy auto  │
  └─────────────────────┘  └─────────────────────┘  └──────────────┘
```

**Pontos-chave:**
- Tudo escala **multi-tenant**: cada query respeita `group_id` via RLS
- O bot lê `bot_pool` no Supabase para descobrir tokens dinamicamente — **não há `TELEGRAM_BOT_TOKEN` único em produção** (cada grupo tem seu bot/token armazenados na tabela)
- WhatsApp via Baileys (cliente não-oficial) está em expansão mas ainda parcialmente testado
- Webhook do Mercado Pago roda em **serviço separado** (`bets-webhook`) por isolamento

---

## 3. Repositório

- **GitHub**: https://github.com/marcelomar21/bets-estatistica
- **Branches importantes**:
  - `master` / `main` — produção (deploy automático para Render + Vercel)
  - `develop` — staging
  - `fix/run-step-light-error-handling` — branch local com WIP (ver seção 1)
- **Tag**: `v1.0`
- **Convenções**:
  - Conventional Commits obrigatório (`feat:`, `fix:`, `chore:` etc.)
  - PR sempre — nunca commit direto em main/master
  - Squash merge em main
- **Organização do trabalho**: Linear (referenciado em `.planning/` e em comentários de commits — `GURU-13`, `GURU-49` etc.)

---

## 4. Tech stack

### Bot (raiz `/`, `bot/`, `whatsapp/`, `lib/`)
- **Runtime**: Node.js 20 (especificado em `render.yaml` e `.node-version`)
- **Framework HTTP**: Express 5
- **DB client**: `@supabase/supabase-js` 2.x (service key)
- **Telegram**: `node-telegram-bot-api` 0.67
- **WhatsApp**: `@whiskeysockets/baileys` 6.17 (cliente não-oficial)
- **LLM**: `langchain` 1.2 + `@langchain/openai` 1.2 + `@langchain/anthropic` 1.3
- **Cron**: `node-cron` 4.2
- **Validação**: `zod` 4.1
- **PDF**: `html-pdf-node` (puppeteer)
- **Tests**: `jest` 29 (ver `__tests__/` e `bot/**/__tests__/`)

### Admin Panel (`admin-panel/`)
- **Framework**: Next.js 16.1 (App Router)
- **Runtime UI**: React 19.2
- **Estilo**: Tailwind CSS 4
- **DB client**: `@supabase/ssr` + `@supabase/supabase-js` (anon key + RLS)
- **Auth**: Supabase Auth (JWT)
- **Telegram MTProto**: `telegram` 2.26 (para import de grupos)
- **OpenAI direto**: pacote `openai` 6.25
- **Tests**: `vitest` 3.2 + Testing Library + jsdom
- **TypeScript**: 5 strict

### Landing Page (`landing-page/`)
- Next.js também (deploy separado em Vercel)

### Banco
- **Postgres 15** via Supabase Managed
- 76 migrations sequenciais em `sql/migrations/`
- RLS ativo em todas as tabelas com `group_id`
- Pooler na porta 6543 (transaction mode)

---

## 5. Estrutura de pastas

```
bets-estatistica/
├── admin-panel/        # Next.js — dashboard de operadores (Vercel)
│   ├── src/app/        # App Router routes
│   │   ├── (auth)/     # rotas autenticadas
│   │   └── api/        # 70+ rotas REST (todas via createApiHandler)
│   ├── src/components/ # React components
│   ├── src/lib/        # supabase clients, helpers
│   ├── src/middleware/ # api-handler, withTenant
│   └── .env.example    # ⚠️ template — copiar para .env.local
├── bot/                # Servidor Node — Telegram unified
│   ├── server.js       # entrypoint principal (Express + node-cron)
│   ├── server.scheduler.js  # registro dos crons internos
│   ├── webhook-server.js    # ⚠️ servidor SEPARADO p/ Mercado Pago
│   ├── handlers/       # comandos do bot (/start, /admin, etc.)
│   ├── jobs/           # postBets, distributeBets, kickExpired, etc.
│   ├── services/       # copyService, marketInterpreter, etc.
│   └── telegram.js     # wrapper do TelegramBot
├── whatsapp/           # Servidor WhatsApp Baileys (Render: bets-whatsapp)
│   ├── server.js       # entrypoint
│   ├── baileys.js      # cliente principal
│   ├── clientRegistry.js
│   └── pool/           # multi-número
├── landing-page/       # Next.js — página de marketing (Vercel)
├── lib/                # código compartilhado bot/scripts (config, logger, supabase)
│   ├── config.js       # ⚠️ centraliza TODAS env vars do bot
│   └── logger.js
├── scripts/            # scripts ad-hoc (CI, manutenção)
│   ├── pipeline.js     # roda no daily-pipeline workflow
│   ├── evict-ghost-members.js
│   ├── reconcile-ghost-members.js
│   ├── launchd/        # plists macOS p/ evict-ghost (one-off em mai/2026)
│   └── run-evict-ghost.sh
├── sql/                # 76 migrations + seed-dev.sql
│   └── migrations/     # 001 → 068 (vai até 068 hoje)
├── .github/workflows/  # 3 workflows: ci, daily-pipeline, odds-collector
├── .planning/          # docs de planejamento (PRDs, fases, milestones)
├── .claude/            # configs Claude Code (skills, agents, commands)
├── Guru/               # changelog manual + docs Obsidian-friendly
├── _bmad/              # framework BMAD (planning antigo)
├── docs/               # docs técnicos diversos
├── render.yaml         # ⚠️ blueprint dos 3 serviços Render
├── package.json        # bot
├── .env.example        # ⚠️ template — copiar para .env
└── CLAUDE.md           # instruções para o Claude Code (regras do projeto)
```

---

## 6. Inventário completo de serviços externos

### 6.1. Supabase (banco + auth + storage)
- **Função**: Postgres gerenciado, autenticação JWT, **Storage** (buckets de arquivos), Realtime (não usado em produção)
- **Project ref**: `vqrcuttvcgmozabsqqja`
- **Region**: AWS us-east-1 (North Virginia)
- **URL API**: `https://vqrcuttvcgmozabsqqja.supabase.co`
- **Console**: https://supabase.com/dashboard/project/vqrcuttvcgmozabsqqja
- **Onde aparece no código**: `lib/supabase.js`, `admin-panel/src/lib/supabase-*.ts`, todos os `bot/jobs/*`, `bot/services/*`, scripts e workflows
- **Plano**: verificar no console (provavelmente Free com auto-pause habilitado, ou Pro pago)
- **Custo estimado**: $0 (free) ou $25/mês (Pro)
- **Login dono**: conta Marcelo (verificar 1Password / Google)
- **Backups**: automáticos diários (retenção 7d no Free, 30d no Pro)

**Storage buckets ativos:**

| Bucket | Conteúdo | Onde é usado |
|---|---|---|
| `analysis-pdfs` | PDFs de análise de jogos (gerados pelo agente LLM) | upload em `agent/persistence/storageUpload.js` (path: `<matchId>/analysis-<YYYY-MM-DD>.pdf`); download em `admin-panel/src/app/api/analyses/[id]/pdf/route.ts`; geração via `scripts/generateTeamPdfs.js` e daily-pipeline |
| `message-media` | Imagens/mídia anexadas em mensagens manuais via admin | upload em `admin-panel/src/app/api/messages/upload/route.ts`; download em `admin-panel/src/app/api/messages/[id]/media/route.ts`; envio em `bot/jobs/sendScheduledMessages.js` |

**Como pausar o Storage**: pausando o projeto Supabase (seção 12.5) já corta acesso a tudo. Os arquivos persistem.

**Backup dos buckets** (opcional antes de pausar): há comandos `supabase storage cp` no CLI, ou usar o console (não há script automatizado no repo).

### 6.2. Render (hosting de bots/webhook)
- **Função**: Hospedar 3 serviços Node em produção
- **Workspace**: "My Workspace" (`prj-d5hos5n5r7bs73bjc190`)
- **Environment**: Production (`evm-d5hos5n5r7bs73bjc19g`)
- **Console**: https://dashboard.render.com
- **Plano de cada serviço**: `free` (definido em `render.yaml`)
- **Custo estimado**: $0 (free tier — 750h/mês compartilhadas)
- **Auto-deploy do bot principal**: **DESATIVADO** (precisa trigger manual via API ou push em main)
- **Serviços rodando**:

| Service ID | Nome | Função | Healthcheck |
|---|---|---|---|
| `srv-d6fliv6a2pns7382ckd0` | bets-bot-unified | Bot Telegram principal (multi-grupo) | `/health` |
| `srv-d5m5cmje5dus73e8ds10` | bets-webhook | Webhook Mercado Pago | `/health` |
| (definido em `render.yaml`, ID via console) | bets-whatsapp | Servidor WhatsApp Baileys | `/health` |

- **Env Group**: `bets-secrets` — todos os secrets compartilhados entre os 3 serviços (definido em `render.yaml`)

### 6.3. Vercel (admin panel + landing)
- **Função**: Hospedar 2 apps Next.js
- **Team ID**: `team_CNoiSynMmrxky1dmtI6DPRdY`
- **Console**: https://vercel.com/dashboard
- **Custo estimado**: $0 (Hobby) ou $20/mês (Pro)
- **Projetos**:

| Project ID | Nome | Domínio |
|---|---|---|
| `prj_6C4cxKzY2J5Ub2ncXiCTzGMoe8Ls` | admin-panel | `admin.gurudabet.com.br` |
| `prj_GYhImveHeqV6arpnfzECAwDU6qKA` | landing-page | (verificar console) |

- **Auto-deploy**: cada push em main/master dispara via GitHub Actions
- **Env vars**: configuradas no Vercel UI (não em arquivos versionados) — incluir `RENDER_API_KEY` que admin-panel usa para reiniciar o bot

### 6.4. GitHub (repositório + Actions)
- **Repo**: `marcelomar21/bets-estatistica`
- **Actions**: 3 workflows ativos (ver seção 9)
- **Secrets configurados** (em Settings → Secrets and variables → Actions):
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`
  - `OPENAI_API_KEY`, `FOOTYSTATS_API_KEY`, `THE_ODDS_API_KEY`
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_GROUP_ID`, `TELEGRAM_PUBLIC_GROUP_ID`
  - `RENDER_API_KEY` (deploy do bot)
  - `VERCEL_TOKEN` (deploy do admin/landing)
  - `CLAUDE_CODE_OAUTH_TOKEN` (odds-collector)
- **Custo**: $0 (Free para repos públicos)

### 6.5. Telegram Bot API
- **Função**: Mensageria principal (todos os grupos clientes)
- **Console (ownership)**: https://t.me/BotFather (no Telegram)
- **Tokens**: armazenados na tabela `bot_pool` do Supabase, **não em env var em produção**
- **Webhook URL configurada em cada bot**: `https://bets-bot-unified.onrender.com/telegram/<botId>/<token>`
- **Custo**: gratuito
- **Grupos ativos** (chat_ids):

| Grupo | Chat ID |
|---|---|
| Osmar Palpites (admin) | `-1003363567204` |
| Osmar Palpites (público) | `-1003647535811` |
| GuruBet (público) | `-1003659711655` |
| CAP 1000 Tips | `-1003836475731` |
| Rajizito Tips (público) | `-1003581390882` |
| Zebrismos Tips | `-1003761566384` |

- **Telegram MTProto** (admin-panel): API ID/hash para importar grupos (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH` — gerar em https://my.telegram.org)

### 6.6. OpenAI (LLM)
- **Função**: análise de partidas, copy de apostas, interpretação de mercado, avaliação de resultados
- **Console**: https://platform.openai.com
- **Modelos em produção** (definidos em `lib/config.js:103-110`):
  - **Heavy**: `gpt-5.4` — análise pesada e avaliação
  - **Light**: `gpt-5.4-nano` — copy curto e preview
- **Default override** (env var `AGENT_MODEL`): `gpt-4o`
- **Bibliotecas**: LangChain (`@langchain/openai`) no bot, SDK `openai` direto no admin-panel
- **Custo**: pay-as-you-go — monitorar no console (provável conta principal Marcelo)

### 6.7. Mercado Pago (pagamentos + assinaturas)
- **Função**: cobrança recorrente (assinaturas mensais), webhooks de pagamentos
- **Console**: https://www.mercadopago.com.br/developers/panel
- **Webhook URL configurada**: `https://bets-webhook.onrender.com/webhooks/mercadopago` (verificar painel MP)
- **Validação**: HMAC SHA-256 via header `x-signature`
- **Eventos tratados**:
  - `subscription_preapproval.created`
  - `subscription_preapproval.failed`
  - `subscription_preapproval.authorized`
- **Substituiu o Cakto** (legado) — mas o `render.yaml` ainda referencia `CAKTO_*` env vars como aliases. O código tem fallback (`lib/config.js:75`).
- **Custo**: % por transação processada (não há mensalidade)

### 6.8. WhatsApp / Baileys
- **Função**: alternativa ao Telegram (cliente não-oficial via WebSocket)
- **Status**: em expansão (algumas features em testes)
- **Sessões**: persistidas em `whatsapp_sessions` (tabela Supabase)
- **Encryption**: AES-256-GCM com `WHATSAPP_ENCRYPTION_KEY`
- **Rate limit**: ~10-20 msgs/min por número (não é configuração, é limite real do WhatsApp)
- **Console (ownership do número)**: o WhatsApp fica vinculado a números reais (ver tabela `whatsapp_numbers`)
- **Custo**: $0 (não-oficial) — risco de banimento dos números é a contrapartida

### 6.9. FootyStats (dados de futebol)
- **Função**: calendário de jogos, ligas, times, estatísticas
- **Console**: https://footystats.org/api
- **Onde usa**: `scripts/fetchLeagues.js`, `scripts/fetchLeagueMatches.js`, daily-pipeline workflow
- **Custo**: paga (verificar plano no console — provavelmente $20-30/mês)

### 6.10. The Odds API (odds externas)
- **Função**: agregador de odds de bookmakers
- **Console**: https://the-odds-api.com
- **Onde usa**: scripts de coleta (alternativa/backup ao scraping da Betano)
- **Custo**: free tier (500 requests/mês) ou paga

### 6.11. Anthropic Claude / Claude Code (automação)
- **Função**: roda o **Odds Collector** (skill que faz scraping da Betano via Playwright + Claude Sonnet)
- **Console**: https://console.anthropic.com
- **Token**: OAuth token gerado no Claude Code CLI
- **Onde usa**: `.github/workflows/odds-collector.yml` (roda 2x/dia)
- **Custo**: pay-as-you-go (~$0.10-0.50 por execução, varia por jogo)

### 6.12. Betano (scraping de odds — não é serviço pago)
- **Função**: extrair odds e booking codes para apostas finais
- **Como acessa**: Playwright (Chromium) dentro do workflow odds-collector
- **Risco**: scraping pode quebrar a qualquer mudança de UI da Betano

### 6.13. Linear (gestão de issues — não usado em runtime)
- **Função**: gerenciamento de épicos/issues do projeto
- **Não há integração runtime** (não é dependência do código rodando)
- **Pode ter sido configurado no admin-panel para ler issues** — verificar se há `LINEAR_API_KEY` no Vercel; se não, é só uso pessoal

### 6.14. Serviços que NÃO são usados (verificado no source)
Esclarecimento útil para evitar busca em vão:

- **Sentry / PostHog / Datadog**: ❌ não há integração ativa (sem env vars, sem dependências)
- **Redis / Upstash**: ❌ não há
- **Cloudflare R2 / Cloudinary / AWS S3**: ❌ não há — **arquivos ficam no Supabase Storage** (ver seção 6.1)
- **n8n**: ❌ não há

---

## 7. Inventário de API keys e secrets

> **Nenhum valor real está nesse documento.** Apenas nomes e onde encontrar.

| Secret | Serviço | Onde está armazenado | Onde rotacionar/regenerar |
|---|---|---|---|
| `SUPABASE_URL` | Supabase | `.env`, GH Secrets, Vercel env, Render env group `bets-secrets` | Console Supabase (URL é fixa do projeto, não rotaciona) |
| `SUPABASE_SERVICE_KEY` | Supabase | `.env`, GH Secrets, Vercel env, Render env group `bets-secrets` | Supabase → Settings → API → "Reveal" / "Reset" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Vercel env do admin-panel, `admin-panel/.env.local` | Supabase → Settings → API |
| `SUPABASE_DB_PASSWORD` | Supabase | `.env` (raiz), Render env group | Supabase → Settings → Database → Reset password (também invalida `DATABASE_URL`) |
| `DATABASE_URL` | Supabase (Postgres) | `.env`, GH Secrets, Render env group | Reconstruir após reset de senha |
| `TELEGRAM_BOT_TOKEN` | Telegram (BotFather) | GH Secrets (workflows), tabela `bot_pool` no banco (produção) | @BotFather → `/revoke` no chat com o bot |
| `TELEGRAM_ADMIN_GROUP_ID` | Telegram | GH Secrets, Render env group | É só um chat_id, não é secret de fato |
| `TELEGRAM_PUBLIC_GROUP_ID` | Telegram | GH Secrets | É só um chat_id, não é secret de fato |
| `TELEGRAM_API_ID` | Telegram MTProto | `admin-panel/.env.local`, Vercel env | https://my.telegram.org → API tools |
| `TELEGRAM_API_HASH` | Telegram MTProto | `admin-panel/.env.local`, Vercel env | https://my.telegram.org → API tools |
| `OPENAI_API_KEY` | OpenAI | `.env`, GH Secrets, Vercel env, Render env group | https://platform.openai.com/api-keys |
| `FOOTYSTATS_API_KEY` | FootyStats | `.env`, GH Secrets, Render env group | https://footystats.org/api → painel |
| `THE_ODDS_API_KEY` | The Odds API | `.env`, GH Secrets, Render env group | https://the-odds-api.com → painel |
| `MP_ACCESS_TOKEN` | Mercado Pago | `.env`, Render env group | https://www.mercadopago.com.br/developers/panel/credentials |
| `MP_WEBHOOK_SECRET` | Mercado Pago | `.env`, Render env group | Painel MP → Webhooks → "Generate" |
| `MP_CHECKOUT_URL` | Mercado Pago | `.env`, Render env group | URL gerada por preferência (geralmente armazenada por grupo no banco) |
| `CAKTO_CLIENT_ID` | Cakto (legado) | Render env group | ❌ deprecado — manter por enquanto, código tem fallback para MP |
| `CAKTO_CLIENT_SECRET` | Cakto (legado) | Render env group | ❌ deprecado — manter por enquanto, código tem fallback para MP |
| `CAKTO_WEBHOOK_SECRET` | Cakto (legado) | Render env group | ❌ deprecado — manter por enquanto, código tem fallback para MP |
| `WHATSAPP_ENCRYPTION_KEY` | WhatsApp/Baileys | `.env`, Render env group | `openssl rand -hex 32` — **se rotacionar, invalida todas as sessões salvas** |
| `ENCRYPTION_KEY` | Admin-panel (sessões locais) | `admin-panel/.env.local`, Vercel env | `openssl rand -hex 32` |
| `RENDER_API_KEY` | Render | GH Secrets, Vercel env (admin-panel usa para restartar bot) | Render → Account → API Keys |
| `RENDER_UNIFIED_SERVICE_ID` | Render | `admin-panel/.env.local`, Vercel env | É um ID fixo (`srv-d6fliv6a2pns7382ckd0`), não é secret |
| `VERCEL_TOKEN` | Vercel | GH Secrets | https://vercel.com/account/tokens |
| `CLAUDE_CODE_OAUTH_TOKEN` | Anthropic / Claude Code | GH Secrets | rodar `claude setup-token` no terminal local, copiar valor gerado |
| `BOT_PREVIEW_API_KEY` | Interno (admin → bot) | `.env.render` (Vercel pull), bot env | Gerar string aleatória — sincronizar entre admin-panel e bot |
| `SEED_ADMIN_PASSWORD` | Interno (seed dev) | `.env` local (somente dev) | Não usar em produção |

### Onde os secrets vivem em produção (na nuvem)

Esses lugares persistem entre operadores — basta o próximo dev receber acesso à conta correspondente para ler/atualizar:

| Cloud | Conteúdo | Como acessar |
|---|---|---|
| GitHub Secrets | usados nos 3 workflows do CI | https://github.com/marcelomar21/bets-estatistica/settings/secrets/actions |
| Render Env Group `bets-secrets` | runtime dos 3 serviços Render | Console Render → Env Groups → `bets-secrets` |
| Vercel Env Vars (admin-panel) | runtime do admin-panel | Vercel → projeto `admin-panel` → Settings → Environment Variables |
| Vercel Env Vars (landing-page) | runtime da landing-page | Vercel → projeto `landing-page` → Settings → Environment Variables |

### Setup local do zero (próximo dev)

⚠️ **Importante**: o repo **só tem templates** (`.env.example`, `admin-panel/.env.example`). Os arquivos com valores reais (`.env`, `admin-panel/.env.local`, `admin-panel/.env.render`) são gitignored — **não vêm no clone** e ficam só na máquina do dev anterior. O próximo dev precisa criá-los do zero.

**Templates disponíveis no repo:**
- `.env.example` (raiz) — 30+ env vars do bot
- `admin-panel/.env.example` — 7 env vars do admin-panel

**Passo a passo para o próximo dev:**

```bash
# 1. Clonar e instalar
git clone https://github.com/marcelomar21/bets-estatistica
cd bets-estatistica
nvm install 20 && nvm use 20
npm install
cd admin-panel && npm install && cd ..

# 2. Criar os arquivos de env a partir dos templates
cp .env.example .env
cp admin-panel/.env.example admin-panel/.env.local

# 3. Preencher cada variável (ver opções abaixo)

# 4. Validar setup
npm test                          # roda Jest do bot
cd admin-panel && npm test        # roda Vitest do admin
cd admin-panel && npm run build   # build do Next com TS strict
```

**Como obter o valor real de cada variável** (consultar tabela acima e cruzar com este checklist):

1. **Variáveis que existem na nuvem** → o próximo dev recebe acesso à conta correspondente e pega de lá:
   - **Vercel** (`admin-panel`): rodar `cd admin-panel && npx vercel env pull .env.render --environment production --yes` (precisa estar logado: `npx vercel login`). Isso baixa todas as env vars do projeto Vercel para `admin-panel/.env.render`. Daí pode copiar o que precisar.
   - **Render** (`bets-secrets`): abrir Console Render → Env Groups → `bets-secrets` e copiar manualmente (não há CLI oficial).
   - **GitHub Secrets**: não dá pra ler valores existentes (apenas escrever) — pegar do mesmo lugar de onde foram colocados originalmente (Vercel/Render/Marcelo).

2. **Variáveis que existem só na máquina do dev anterior** (chaves que nunca foram para a nuvem, ou geradas localmente):
   - Pedir ao operador anterior (Marcelo, `marcelomar21@gmail.com`) que entregue de forma segura — 1Password share, arquivo encriptado via Signal/Telegram, ou colar manualmente em chamada de vídeo.

3. **Variáveis que podem ser geradas do zero pelo novo dev** (não precisam ser herdadas):
   - `WHATSAPP_ENCRYPTION_KEY`, `ENCRYPTION_KEY` → `openssl rand -hex 32` (mas atenção: rotacionar `WHATSAPP_ENCRYPTION_KEY` invalida todas as sessões Baileys salvas no banco)
   - `BOT_PREVIEW_API_KEY` → string aleatória qualquer, só precisa ser igual nos dois lados (admin e bot)
   - `SEED_ADMIN_PASSWORD` → qualquer senha forte, só usada em scripts de seed dev

4. **Variáveis que precisam ser obtidas direto no painel do serviço** (independente do dev anterior):
   - `OPENAI_API_KEY` → criar nova em https://platform.openai.com/api-keys (precisa ter sido convidado para a org da conta OpenAI do projeto)
   - `FOOTYSTATS_API_KEY` → painel FootyStats (login do projeto)
   - `THE_ODDS_API_KEY` → painel The Odds API (login do projeto)
   - `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` → painel Mercado Pago (login do projeto)
   - `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` → https://my.telegram.org → API Development Tools (login com o número Telegram do owner)

**Token do Supabase CLI** (usado em scripts de migration):
- Não é env var, fica no macOS Keychain após `supabase login`
- O próximo dev roda `supabase login` na sua própria máquina e o token novo dele entra no Keychain dele
- Para extrair via script: `security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d`

---

## 8. Variáveis de ambiente — referência completa

> Para a lista canônica, consulte sempre `.env.example` (bot) e `admin-panel/.env.example` (admin). Esta seção destaca as principais.

### 8.1. Obrigatórias para o bot rodar
| Variável | Serviço | Onde |
|---|---|---|
| `SUPABASE_URL` | Supabase | bot, admin, GH, Render |
| `SUPABASE_SERVICE_KEY` | Supabase | bot, admin (auth admin), GH, Render |
| `DATABASE_URL` | Postgres | bot (scripts), GH, Render |
| `TELEGRAM_BOT_TOKEN` | Telegram | GH workflows (legacy — produção lê de `bot_pool`) |
| `TELEGRAM_ADMIN_GROUP_ID` | Telegram | GH, Render |
| `TELEGRAM_PUBLIC_GROUP_ID` | Telegram | GH |
| `OPENAI_API_KEY` | OpenAI | bot, admin, GH, Render |
| `FOOTYSTATS_API_KEY` | FootyStats | bot, GH, Render |
| `THE_ODDS_API_KEY` | The Odds API | bot, GH, Render |
| `MP_ACCESS_TOKEN` | Mercado Pago | bot, Render |
| `MP_WEBHOOK_SECRET` | Mercado Pago | bot, Render |

### 8.2. Obrigatórias se WhatsApp ativo
| Variável | Serviço |
|---|---|
| `WHATSAPP_ENCRYPTION_KEY` | Baileys |
| `WHATSAPP_ENABLED` | Toggle (`true`/`false`) |

### 8.3. Obrigatórias para o admin-panel
| Variável | Serviço |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_KEY` | Supabase (admin ops) |
| `TELEGRAM_API_ID` | Telegram MTProto |
| `TELEGRAM_API_HASH` | Telegram MTProto |
| `RENDER_API_KEY` | Render (restart bot após onboarding) |
| `RENDER_UNIFIED_SERVICE_ID` | Render (`srv-d6fliv6a2pns7382ckd0`) |
| `ENCRYPTION_KEY` | Local (sessões) |

### 8.4. Configuração de comportamento (opcionais com default)
- **Bot mode**: `BOT_MODE` = `central` | `group` | `mixed` (default `mixed`)
- **Trial**: `MEMBERSHIP_TRIAL_DAYS` (default 2)
- **Preço exibido**: `MEMBERSHIP_SUBSCRIPTION_PRICE` (default `R$50/mes`)
- **Agente LLM**: `AGENT_MODEL` (default `gpt-4o`), `AGENT_TEMPERATURE`, `AGENT_TIMEOUT_MS`, `AGENT_CONCURRENCY`
- **Análise**: `ANALYSIS_WINDOW_HOURS`, `MAX_PENDING_MATCHES`, `MAIN_AGENT_WINDOW_HOURS`
- **Server**: `PORT` (default 3000), `HOST`, `TZ` (default `America/Sao_Paulo`), `NODE_ENV`
- **Webhook MP**: `MP_WEBHOOK_PORT` (default 3001)
- **WhatsApp**: `WHATSAPP_PORT` (default 10000), `WHATSAPP_RATE_LIMIT` (default 10)

### 8.5. Auto-setadas pelo provedor (não precisa configurar)
- `RENDER_EXTERNAL_URL` (Render)
- `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_OIDC_TOKEN` (Vercel)

---

## 9. Cron jobs e tarefas agendadas

### 9.1. GitHub Actions (3 workflows)

| Workflow | Arquivo | Quando dispara | O que faz |
|---|---|---|---|
| **CI/CD** | `.github/workflows/ci.yml` | push/PR em `main`/`master`/`develop` | Lint + tests; em push para main: deploy Render (bot + webhook) e Vercel (admin + landing) |
| **Daily Pipeline** | `.github/workflows/daily-pipeline.yml` | cron `0 9 * * *` (09:00 UTC = 06:00 BRT) | Roda `scripts/pipeline.js` — busca jogos no FootyStats, chama LLM, gera apostas. Notifica admin no Telegram |
| **Odds Collector** | `.github/workflows/odds-collector.yml` | cron `0 14 * * *` + `0 18 * * *` (11h + 15h BRT) | Claude Code executa skill `odds-collector` — abre Betano via Playwright, extrai odds e booking codes, atualiza `suggested_bets` no banco |

Como pausar manualmente (sem deletar): ver seção 12.

### 9.2. node-cron dentro do bot (Render: bets-bot-unified)

Definidos em `bot/server.scheduler.js`. Executam só enquanto o serviço Render está vivo:

| Job | Frequência | O que faz |
|---|---|---|
| **post-bets** (dinâmico) | conforme `posting_schedule` por grupo (ex: 10:00, 15:00, 22:00 BRT) | posta apostas no canal público |
| **distribute-bets** (dinâmico) | 5 min antes do `post_time` | distribui apostas no canal admin para revisão |
| **per-minute check** | a cada minuto (`* * * * *`) | verifica `post_at` para postagens free-form |
| **reload posting schedule** | a cada 5 min (`*/5 * * * *`) | re-lê `posting_schedule` do banco (detecta mudanças sem restart) |
| **check post_now flag** | a cada 30 min (`*/30 * * * *`) | verifica flag `post_now_requested_at` para postagens manuais |

Pausar tudo: basta suspender o serviço `bets-bot-unified` no Render.

### 9.3. launchd (macOS — só executa em máquina onde os plists foram manualmente instalados)

Plists em `scripts/launchd/` no repo. Apenas para limpeza one-off de "ghost members" (não é cron permanente — são 2 disparos únicos em 2026-05-01).

| Plist | Quando dispara | O que faz |
|---|---|---|
| `com.gurubet.evict-ghost-dry.plist` | **2026-05-01 14:00 BRT** (one-off) | dry-run da eviction |
| `com.gurubet.evict-ghost-apply.plist` | **2026-05-01 15:00 BRT** (one-off) | aplica a eviction |

**Como funciona o launchd nesse caso**: os plists só executam se forem copiados manualmente para `~/Library/LaunchAgents/` da máquina e carregados com `launchctl load`. O repo guarda apenas as cópias de referência — clonar o repo não ativa nada.

⚠️ Importante para o próximo dev:
- O caminho hardcoded dentro dos plists é `/Users/wehandle/Projetos/pessoal/bets-estatistica` — não corresponde a nenhum Mac atual. Quem quiser ressuscitar essa lógica precisa **editar o caminho** no plist antes de instalar.
- Os plists têm guard de ano "2026 only" no script `run-evict-ghost.sh` — não vão re-disparar em 2027+ mesmo se forem instalados.
- A data 2026-05-01 já passou (hoje é 2026-05-03), então mesmo se estiverem instalados em algum Mac, o agendamento já passou. Não há ação pendente.

### 9.4. Webhooks (event-driven, não agendados)

| Origem | Endpoint | Onde é processado |
|---|---|---|
| Telegram (updates) | `https://bets-bot-unified.onrender.com/telegram/<botId>/<token>` | `bot/server.js` |
| Mercado Pago (eventos) | `https://bets-webhook.onrender.com/webhooks/mercadopago` | `bot/webhook-server.js` (HMAC validado) |
| Baileys (mensagens) | interno ao serviço bets-whatsapp | `whatsapp/server.js` |

---

## 10. Webhooks expostos publicamente

| URL | Método | Quem chama | Validação |
|---|---|---|---|
| `https://bets-bot-unified.onrender.com/telegram/:botId/:token` | POST | Telegram Bot API | URL com token → equivale a auth |
| `https://bets-bot-unified.onrender.com/health` | GET | Render healthcheck | Nenhuma |
| `https://bets-webhook.onrender.com/webhooks/mercadopago` | POST | Mercado Pago | HMAC SHA-256 (header `x-signature`) |
| `https://bets-webhook.onrender.com/health` | GET | Render healthcheck | Nenhuma |
| `https://bets-whatsapp.onrender.com/*` | POST/GET | Interno (admin → bot) | API key (`BOT_PREVIEW_API_KEY` ou similar) |
| `https://admin.gurudabet.com.br/api/*` | * | Admin panel UI / scripts | Supabase JWT (cookie de sessão) |

---

## 11. Banco de dados (Supabase)

- **Project ref**: `vqrcuttvcgmozabsqqja`
- **Engine**: PostgreSQL 15
- **Migrations**: `sql/migrations/` — **76 arquivos**, sequenciais de `001_*` até `068_*` (há 2 migrations com prefixo 066 — ver pasta)
- **Última migration (em local, não aplicada)**: `068_member_notifications_started_bot.sql` — verificar se já está em produção
- **RLS**: ativo em todas as tabelas com `group_id` (isolamento multi-tenant)
- **Pooler**: porta 6543 (transaction mode)

### Como aplicar migration nova (em produção)

Via Supabase Management API:
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL>"}'
```

### Tabelas críticas

- `groups` — config por tenant
- `bot_pool` — registry de bots Telegram (tokens em produção ficam aqui, não em env var)
- `members` — usuários
- `memberships` — assinaturas e trials
- `suggested_bets` — apostas analisadas pela LLM (com `status`, `odds`, `deep_link`, etc.)
- `bet_group_assignments` — relação N:N entre apostas e grupos (substituiu `bets.group_id` na migração GURU-49)
- `league_matches` — calendário de jogos (FootyStats)
- `webhook_events` — auditoria de eventos do Mercado Pago
- `job_executions` — log de execução de cada job (debugging operacional)
- `whatsapp_numbers`, `whatsapp_sessions` — pool e sessões Baileys

### Backups
- Automáticos diários (Supabase) — retenção depende do plano
- Script manual: `scripts/backup-db.sh` (pg_dump → pasta `backups/`, mantém 5 mais recentes)

---

## 12. 🔌 Procedimento de SHUTDOWN (sem deletar nada)

> Objetivo: pausar tudo o que custa dinheiro ou processa eventos, **mantendo dados, código e configurações intactos** para retomada futura.

Execute na ordem abaixo. Cada passo é independente — pode pausar e retomar depois.

### 12.1. GitHub Actions (parar workflows agendados)

Eles disparam todo dia e gastam minutos de CI / créditos do Claude / créditos do OpenAI. Desabilitar primeiro:

```bash
# Disable os 3 workflows
gh workflow disable "CI/CD" --repo marcelomar21/bets-estatistica
gh workflow disable "Daily Pipeline" --repo marcelomar21/bets-estatistica
gh workflow disable "Odds Collector" --repo marcelomar21/bets-estatistica

# Verificar
gh workflow list --repo marcelomar21/bets-estatistica
```

Para reativar (depois): `gh workflow enable "<nome>"`.

### 12.2. Render (suspender 3 serviços)

Suspender mantém o serviço configurado, env vars, deploy history — só para de receber requisições e a billing pausa.

**Via Console (mais simples):**
1. https://dashboard.render.com → cada serviço (`bets-bot-unified`, `bets-webhook`, `bets-whatsapp`)
2. Settings → role até "Suspend Service" → **Suspend**

**Via API (opcional):**
```bash
# Pegar RENDER_API_KEY:
cd admin-panel && npx vercel env pull .env.render --environment production --yes
source admin-panel/.env.render

for SVC in srv-d6fliv6a2pns7382ckd0 srv-d5m5cmje5dus73e8ds10 <id-bets-whatsapp>; do
  curl -s -X POST "https://api.render.com/v1/services/$SVC/suspend" \
    -H "Authorization: Bearer $RENDER_API_KEY"
done
```
> O ID do `bets-whatsapp` precisa ser pego no console — não tenho aqui.

Para retomar: `POST .../resume` na API ou botão "Resume Service" no console.

### 12.3. Telegram (parar webhook em cada bot)

Mesmo com Render desligado, vale tirar o webhook explicitamente para o BotFather não acusar erros:

```bash
# Para cada bot_token na tabela bot_pool:
curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

Listar todos os tokens (no Mac local):
```bash
psql "$DATABASE_URL" -c "SELECT bot_username, bot_token FROM bot_pool WHERE is_active = true;"
```

Para reativar: o serviço Render `bets-bot-unified` re-registra o webhook automaticamente no startup.

### 12.4. Vercel (pausar produção dos 2 projetos)

Manter o projeto criado mas parar de receber tráfego em produção:

**Opção A — Disable production deployments (mantém URL viva temporariamente até cache expirar):**
1. Vercel → projeto `admin-panel` → Settings → Git → toggle "Production Deployment" off
2. Vercel → projeto `landing-page` → Settings → Git → toggle "Production Deployment" off

**Opção B — Remover domínio custom (mais agressivo):**
1. Settings → Domains → remover `admin.gurudabet.com.br`
2. O DNS volta a apontar pra nada — site fica fora

Recomendado: **Opção A** (mais reversível).

Para retomar: re-habilitar production deployment + push em main (ou clicar Redeploy).

### 12.5. Supabase (pausar projeto)

**Atenção:** se for plano Free, o projeto **auto-pausa após 7 dias sem atividade** — basta esperar. Se for plano Pro, fazer manualmente:

1. https://supabase.com/dashboard/project/vqrcuttvcgmozabsqqja
2. Settings → General → role até "Pause project" → **Pause**

⚠️ **Antes de pausar**: fazer backup manual por garantia:
```bash
# Roda pg_dump comprimido — ~30-60s
bash scripts/backup-db.sh
# Resultado em backups/backup-YYYY-MM-DD-HHMMSS.sql.gz
```

Para retomar: botão "Restore project" no console (~5 min).

### 12.6. Mercado Pago (pausar assinaturas ativas)

Só relevante se houver assinaturas em cobrança recorrente. Pausar evita cobrança nos clientes enquanto o sistema está fora do ar.

1. https://www.mercadopago.com.br/developers/panel
2. Suas Aplicações → projeto GuruBet → Webhooks
3. Desabilitar a URL do webhook (ou só desativar o app)

Alternativa via banco: rodar SQL no Supabase para marcar assinaturas como pausadas internamente — verificar tabela `memberships` (campo `status`).

Para retomar: re-habilitar webhook no painel + verificar fila de eventos perdidos.

### 12.7. launchd local (parar plists do evict-ghost)

```bash
# Remover do launchd (não deleta os arquivos do repo)
launchctl unload ~/Library/LaunchAgents/com.gurubet.evict-ghost-dry.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist 2>/dev/null

# Confirmar
launchctl list | grep gurubet  # não deve retornar nada
```

> Provavelmente não estavam ativos pois o caminho hardcoded é incorreto, mas vale rodar por garantia.

### 12.8. WhatsApp Baileys (sessões persistem)

Não há ação adicional além de suspender o serviço Render `bets-whatsapp`. As sessões ficam no Supabase (tabela `whatsapp_sessions`), criptografadas. Quando religar, basta o serviço subir e re-conectar usando as sessões salvas.

### 12.9. OpenAI / FootyStats / The Odds API / Anthropic

Esses são **pay-as-you-go** — sem chamadas, não há cobrança. Não precisa fazer nada.

Se quiser ser ainda mais cauteloso: **revogar as API keys** nos respectivos painéis (não deleta a conta, só invalida a key). Quando for retomar, gera nova key e atualiza os secrets nos lugares listados na seção 7.

### 12.10. Checklist de shutdown completo

- [ ] GitHub: 3 workflows disabled (`gh workflow list`)
- [ ] Render: 3 serviços suspended (todos mostram "Suspended" no console)
- [ ] Telegram: webhook deletado em cada bot do `bot_pool`
- [ ] Vercel: production deploy desabilitado nos 2 projetos
- [ ] Supabase: backup feito + projeto pausado
- [ ] Mercado Pago: webhook desabilitado / app pausado
- [ ] launchd: 2 plists unloaded
- [ ] (Opcional) OpenAI/FootyStats/Odds/Anthropic: keys revogadas
- [ ] `.env`, `.env.local`, `.env.render` movidos pra um cofre offline (1Password, etc.)

---

## 13. Como religar o projeto

> 💡 **Atalho**: existe uma skill Claude Code que executa todo este procedimento passo a passo, com confirmação humana entre cada etapa e validações automáticas. Para usar: dentro do Claude Code, invoque a skill `religar-produto` (`.claude/skills/religar-produto/SKILL.md`). Ela cobre os 3 sub-itens abaixo (pré-requisitos, religar serviços, sanity check) com comandos exatos e perguntas de confirmação. Se preferir executar manualmente sem a skill, siga os passos abaixo na ordem.

Sequência inversa do shutdown, mais alguns passos:

### 13.1. Pré-requisitos na máquina nova
1. Clonar o repo: `git clone https://github.com/marcelomar21/bets-estatistica`
2. Instalar Node 20: `nvm install 20 && nvm use 20`
3. Instalar deps: `npm install` (raiz) + `cd admin-panel && npm install`
4. Criar `.env` e `admin-panel/.env.local` a partir dos templates (`.env.example`, `admin-panel/.env.example`) e preencher conforme seção 7 ("Setup local do zero")

### 13.2. Religar serviços (ordem reversa)
1. **Supabase**: console → Restore project (espera ~5 min)
2. **Render**: console → cada serviço (`bets-bot-unified`, `bets-webhook`, `bets-whatsapp`) → Resume
3. **Vercel**: re-habilitar production deploy → trigger redeploy (push vazio em main ou botão Redeploy) nos 2 projetos (`admin-panel`, `landing-page`)
4. **Telegram**: o `bets-bot-unified` re-registra webhooks automaticamente no startup ao ler `bot_pool`
5. **Mercado Pago**: re-habilitar webhook no painel MP
6. **GitHub**: `gh workflow enable "CI/CD"`, `gh workflow enable "Daily Pipeline"`, `gh workflow enable "Odds Collector"`
7. (Opcional) Atualizar API keys revogadas nos painéis dos serviços e propagar para GH Secrets / Vercel env / Render env group

### 13.3. Sanity check
```bash
# Bot vivo?
curl https://bets-bot-unified.onrender.com/health

# Webhook MP vivo?
curl https://bets-webhook.onrender.com/health

# Admin panel vivo?
curl https://admin.gurudabet.com.br

# Banco respondendo?
psql "$DATABASE_URL" -c "SELECT count(*) FROM groups WHERE status='active';"
```

### 13.4. Validar antes de PR (pre-merge OBRIGATÓRIO)
```bash
# Conforme CLAUDE.md
cd admin-panel && npm test          # Vitest
npm run build                        # Next build com TS strict
# E2E manual via Playwright (ver CLAUDE.md → "Validacao pre-merge")
```

---

## 14. Pointers para documentação interna existente

| Arquivo / pasta | O que tem |
|---|---|
| `CLAUDE.md` | Regras do projeto (testes obrigatórios, migrations, debug Telegram via Render API) — ler antes de começar |
| `README.md` | README antigo (pode estar desatualizado vs. realidade) |
| `README_agent.md` | Documentação do agente LLM antigo (referência histórica) |
| `feature_map.md` | Mapa de features do produto |
| `.planning/` | Plans, milestones, fases (PRDs do v1.0, roadmap, contexto de cada feature) — fonte rica |
| `.planning/STATE.md` | Estado declarado do projeto antes da pausa |
| `.planning/v1.0-MILESTONE-AUDIT.md` | Auditoria do que entrou no v1.0 |
| `Guru/Changelog/` | Notas manuais por PR / data (modelo Obsidian/basic-memory) |
| `_bmad/`, `_bmad-output/` | Framework BMAD (planning antigo, ainda referenciado em comandos) |
| `docs/` | Documentação técnica diversa |
| `.claude/skills/` | Skills custom do Claude Code (ex: `odds-collector`, `pre-merge`, `vault-explore`) |
| `.claude/rules/` | Regras de código (`code-style.md`, `testing.md`, `api-conventions.md`, `database.md`) |
| `.claude/CLAUDE.md` (global, no `~/.claude/`) | Regras pessoais do operador (Git Flow, Ralph Loop, etc.) |
| `scripts/launchd/README.md` | Como instalar/desinstalar os plists locais |
| `sql/migrations/` | 76 migrations sequenciais (numeração `NNN_descricao.sql`) |

### Credenciais de teste (admin-panel — só desenvolvimento)
| Role | Email | Senha |
|---|---|---|
| super_admin | `super@admin.test` | `admin123` |

---

## 15. Contatos e ownership

- **Owner principal**: Marcelo Mendes — `marcelomar21@gmail.com` / Telegram `@marcelomar1121`
- **Repo**: https://github.com/marcelomar21/bets-estatistica
- **Telegram (BotFather)**: gerenciado pela conta Telegram do owner

---

> **Para o próximo dev**: começar lendo `CLAUDE.md` na raiz e `.planning/STATE.md`. Em seguida, este HANDOFF para o panorama operacional. Em seguida, rodar `npm install && cp .env.example .env && cp admin-panel/.env.example admin-panel/.env.local`, preencher os secrets do cofre, e rodar `npm test` em ambos os pacotes para validar que o ambiente local funciona.


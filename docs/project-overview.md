# GuruBet (bets-estatistica) — Visao Geral

## Proposito

Plataforma SaaS multi-tenant para gestao de grupos de apostas esportivas no Telegram. Permite que multiplos influencers gerenciem seus proprios grupos com:

- **Analise estatistica com IA** (GPT-4o via LangChain) para gerar recomendacoes de apostas
- **Distribuicao automatica** de apostas para grupos no Telegram
- **Gestao de membros** com cobranca via Mercado Pago (webhook de pagamentos)
- **Pipeline ETL** para coleta e enriquecimento de dados esportivos (FootyStats, The Odds API)
- **Admin Panel** completo para dashboard, configuracao de bots e acompanhamento de resultados

## Stack Tecnologico

| Categoria | Tecnologia |
|-----------|------------|
| **Bots/Pipeline** | Node.js 20+, Express 5, node-telegram-bot-api |
| **Admin Panel** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Banco de Dados** | PostgreSQL via Supabase (RLS multi-tenant) |
| **IA** | LangChain 1.1 + OpenAI GPT-4o |
| **Telegram** | Bot API (postagem/gestao) + MTProto (sync de membros) |
| **Pagamentos** | Mercado Pago (webhook) |
| **Testes** | Jest (bots), Vitest + Testing Library (admin panel) |

## Arquitetura

Monorepo com dois projetos principais:

```
bets-estatistica/
├── bot/              # Bots Telegram + jobs agendados (Render)
├── agent/            # Pipeline de analise com IA
├── scripts/          # ETL: fetch/load de dados esportivos
├── admin-panel/      # Next.js 16 — dashboard + API routes (Vercel)
├── sql/migrations/   # Migrations SQL sequenciais
└── lib/              # Bibliotecas compartilhadas
```

**Multi-tenancy**: Cada influencer (tenant) tem seus proprios bots, grupos e membros. O isolamento e feito via Row Level Security (RLS) no Supabase.

## Componentes Principais

### 1. Pipeline ETL (`scripts/`)
Coleta dados de APIs externas (FootyStats, The Odds API) e carrega no PostgreSQL: ligas, temporadas, times, jogadores, partidas, odds.

### 2. Agente IA (`agent/`)
Agente LangChain com tools SQL especializadas que analisa partidas e gera recomendacoes estruturadas (safe bets, value bets). Persiste analises em JSON, Markdown e PDF.

### 3. Bot Telegram (`bot/`)
Servidor Express com webhook do Telegram. Inclui jobs agendados:
- **distributeBets** — distribui apostas aprovadas para o grupo publico
- **postBets** — posta apostas no grupo admin para revisao
- **enrichOdds** — enriquece apostas com odds atualizadas
- **trackResults** — acompanha resultados e calcula acertos
- **jobWarn** — alertas de expiracao de membros
- **membership/** — gestao de membros e pagamentos

### 4. Admin Panel (`admin-panel/`)
Dashboard Next.js 16 com autenticacao Supabase. API routes para:
- Gestao de apostas (`/api/bets`)
- Configuracao de bots (`/api/bots`)
- Dashboard com metricas (`/api/dashboard`)
- Gestao de grupos e membros (`/api/groups`, `/api/members`)
- Sync MTProto (`/api/mtproto`)
- Notificacoes e super-admin (`/api/notifications`, `/api/super-admin-bot`)

### 5. Webhook de Pagamentos (`bot/webhook-server.js`)
Servidor separado que recebe webhooks do Mercado Pago para ativar/renovar membros automaticamente.

## Deployment

| Componente | Plataforma | Servico |
|------------|-----------|---------|
| Bot Telegram (Osmar Palpites) | Render | `bot-osmar-palpites` |
| Bot Telegram (Guru da Bet) | Render | `bets-bot` |
| Webhook Pagamentos | Render | `bets-webhook` |
| API Clawdin | Render | `clawdin-api` |
| Admin Panel | Vercel | Next.js |
| Banco de Dados + Auth | Supabase | `vqrcuttvcgmozabsqqja` |

## Grupos Telegram

| Grupo | Chat ID |
|-------|---------|
| Osmar Palpites (admin) | `-1003363567204` |
| Osmar Palpites (publico) | `-1003659711655` |

## Fluxo Principal

```
FootyStats / Odds API
        │
        ▼
   Scripts ETL ──▶ PostgreSQL (Supabase)
                        │
                        ▼
                   Agente IA (GPT-4o)
                        │
                        ▼
                  Apostas sugeridas
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
      Admin Panel   Bot Telegram   Webhook MP
      (revisao)     (postagem)     (pagamentos)
```

---
*Atualizado em 2026-02-25*

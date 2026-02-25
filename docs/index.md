# GuruBet (bets-estatistica) - Documentacao

> Plataforma SaaS multi-tenant de analise estatistica de apostas esportivas com IA

## Visao Geral

| Atributo | Valor |
|----------|-------|
| **Tipo** | SaaS Multi-tenant (Backend + Admin Panel + Data Pipeline) |
| **Backend** | Node.js 20+ (bots, jobs, pipeline) |
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| **Banco de Dados** | PostgreSQL via Supabase (27 tabelas, RLS) |
| **IA** | LangChain + OpenAI GPT-4o |
| **Pagamentos** | Mercado Pago (assinaturas recorrentes) |
| **Messaging** | Telegram Bot API + MTProto |

## Referencia Rapida

### Entry Points

```bash
# Backend (bots)
npm run dev          # Bot em modo polling (dev)
npm start            # Bot em modo webhook (prod)
npm run pipeline     # Pipeline de analise IA

# Admin Panel
cd admin-panel
npm run dev          # http://localhost:3000
npm run build        # Build TypeScript strict
npm test             # Vitest (47 testes)
```

### Comandos do Bot (Grupo Admin)

| Comando | Funcao |
|---------|--------|
| `/apostas` | Listar apostas disponiveis |
| `/postar` | Postar apostas no grupo (com confirmacao) |
| `/odd <id> <valor>` | Atualizar odds |
| `/link <id> <url>` | Adicionar link afiliado |
| `/membros` | Listar membros do grupo |
| `/overview` | Dashboard resumido |
| `/metricas` | Taxas de acerto |
| `/status` | Health do bot e jobs |

## Documentacao

### Arquitetura e Design

- [Visao Geral do Projeto](./project-overview.md) - Proposito, stack e componentes
- [Arquitetura do Sistema](./architecture.md) - Componentes, fluxos, multi-tenancy e deploy

### Dados e Modelos

- [Modelos de Dados](./data-models.md) - Schema PostgreSQL completo (27 tabelas, RLS, views)

### Desenvolvimento

- [Guia de Desenvolvimento](./development-guide.md) - Setup, variaveis, comandos e troubleshooting

## Estrutura de Pastas

```
bets-estatistica/
├── bot/                 # Telegram bot (webhook/polling)
│   ├── handlers/        # Command handlers (admin, start, members)
│   ├── jobs/            # Jobs agendados (post, distribute, enrich, track, kick)
│   └── services/        # Business logic (bet, member, notification, odds)
├── agent/               # Pipeline de analise IA
│   ├── analysis/        # LangChain + GPT-4o
│   └── persistence/     # Salvar resultados no banco
├── scripts/             # ETL (daily_update, sync, fetch)
├── sql/migrations/      # 28 migrations PostgreSQL
├── lib/                 # Utilitarios compartilhados
├── admin-panel/         # Next.js dashboard
│   └── src/
│       ├── app/         # Pages (10) + API routes (30)
│       ├── components/  # React components (35+)
│       ├── middleware/   # Auth (withTenant) + guards
│       └── types/       # TypeScript types
├── _bmad-output/        # Artefatos de planejamento (epics, stories)
└── docs/                # Esta documentacao
```

## Deployment

| Servico | Plataforma | Funcao |
|---------|------------|--------|
| bets-bot | Render | Bot principal (webhook) |
| bot-osmar-palpites | Render | Bot grupo Osmar Palpites |
| bets-webhook | Render | Webhook Mercado Pago |
| admin-panel | Vercel | Dashboard Next.js |
| PostgreSQL + Auth | Supabase | Banco + autenticacao + RLS |

## Validacao Pre-merge (Obrigatorio)

1. `cd admin-panel && npm test` — testes unitarios
2. `npm run build` — build TypeScript strict
3. **Playwright E2E** — testar fluxo afetado no navegador

---

**Atualizado em:** 2026-02-25
**Workflow:** BMM document-project (full rescan)

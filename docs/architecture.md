# GuruBet (bets-estatistica) - Arquitetura do Sistema

## Visao Geral da Arquitetura

O GuruBet e uma plataforma de analise esportiva e distribuicao de apostas via Telegram, construida como um **monorepo** com dois modulos principais:

- **Root (`/`)** -- Node.js: bots Telegram, pipeline de analise por IA e scripts ETL.
- **Admin Panel (`/admin-panel`)** -- Next.js 16, React 19, TypeScript strict: painel administrativo web.

A arquitetura segue o modelo **multi-tenant**: cada grupo/influencer e um tenant com dados isolados via Row-Level Security (RLS) no PostgreSQL. Um super admin gerencia todos os grupos; cada group admin ve apenas os dados do seu grupo.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          GuruBet Platform                            │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐    │
│  │  Bot Telegram│  │  Pipeline IA │  │  Admin Panel (Next.js)   │    │
│  │  (Express)   │  │  (LangChain) │  │  Vercel                  │    │
│  │  Render      │  │  Cron/Manual │  │                          │    │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘    │
│         │                 │                        │                  │
│         └─────────────────┼────────────────────────┘                  │
│                           │                                          │
│                  ┌────────▼────────┐                                  │
│                  │   Supabase      │                                  │
│                  │   PostgreSQL    │                                  │
│                  │   + Auth + RLS  │                                  │
│                  └─────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Componentes do Sistema

### 1. Bot Telegram (`bot/`)

Servidor Express rodando em modo webhook (porta configuravel via `PORT`). O Telegram envia updates via HTTP POST e o bot processa e responde.

**Arquivo principal:** `bot/server.js` (producao, webhook) / `bot/index.js` (dev, polling).

#### Handlers

| Arquivo | Responsabilidade |
|---------|------------------|
| `adminGroup.js` | Comandos no grupo admin (`/post`, `/stats`, callbacks de confirmacao) |
| `startCommand.js` | Gate de entrada: `/start` com deep link, verificacao de assinatura |
| `memberEvents.js` | Novos membros e saidas do grupo |
| `mercadoPagoWebhook.js` | Recebe webhooks de pagamento do Mercado Pago |

#### Jobs Agendados (`bot/jobs/`)

Gerenciados pelo scheduler interno (`server.scheduler.js`), executam em horarios definidos:

| Job | Funcao |
|-----|--------|
| `postBets.js` | Posta apostas aprovadas no Telegram (com fluxo de confirmacao) |
| `distributeBets.js` | Distribui apostas da pool central para grupos ativos (round-robin) |
| `enrichOdds.js` | Busca odds ao vivo via The Odds API e atualiza apostas |
| `trackResults.js` | Avalia resultados pos-jogo e marca green/red |
| `jobWarn.js` | Envia alertas sobre execucao de jobs |
| `healthCheck.js` | Verifica saude dos bots no pool |
| `requestLinks.js` | Solicita links de afiliado para apostas |
| `reminders.js` | Lembretes de renovacao de assinatura |
| `membership/kick-expired.js` | Remove membros com assinatura expirada |
| `membership/sync-group-members.js` | Sincroniza membros do Telegram via MTProto |
| `membership/renewal-reminders.js` | Lembretes especificos de renovacao |
| `membership/trial-reminders.js` | Lembretes para membros em trial |

#### Services (`bot/services/`)

| Service | Responsabilidade |
|---------|------------------|
| `betService.js` | CRUD e logica de negocio de apostas |
| `memberService.js` | Gestao de membros (cadastro, expiracao, status) |
| `notificationService.js` | Envio de notificacoes via Telegram |
| `oddsService.js` | Integracao com The Odds API |
| `mercadoPagoService.js` | Integracao com Mercado Pago (assinaturas) |
| `webhookProcessors.js` | Processamento de webhooks de pagamento |
| `matchService.js` | Consultas de partidas e resultados |
| `resultEvaluator.js` | Avaliacao automatica de resultados (green/red) |
| `marketInterpreter.js` | Interpretacao de mercados de apostas |
| `metricsService.js` | Calculo de metricas e taxas de acerto |
| `copyService.js` | Geracao de copys para mensagens |
| `alertService.js` | Alertas de sistema |
| `jobExecutionService.js` | Log de execucoes de jobs no banco |

#### Modos de Operacao

- **Central** (`GROUP_ID=null`): Roda pipeline de analise e distribui para todos os grupos.
- **Group** (`GROUP_ID=uuid`): Bot dedicado a um grupo especifico, posta e gerencia membros.
- **Mixed**: Combinacao dos dois modos (usado em desenvolvimento).

---

### 2. Pipeline de Analise (`agent/`)

Motor de inteligencia artificial que analisa partidas e gera sugestoes de apostas.

**Componentes:**

| Arquivo | Funcao |
|---------|--------|
| `analysis/agentCore.js` | LangChain + GPT-4o (analise pesada) / GPT-4o-mini (leve) |
| `analysis/runAnalysis.js` | Processa fila de partidas (concurrency=3) |
| `analysis/prompt.js` | System e human prompts para o agente |
| `analysis/schema.js` | Schemas Zod para validacao estruturada |
| `tools.js` | Ferramentas SQL para consulta do agente |
| `persistence/main.js` | Salva analises no banco (Markdown + JSON) |
| `pipeline.js` | Orquestracao do pipeline completo |

**Fluxo do Agente:**
1. Recebe contexto da partida (times, estatisticas, forma recente).
2. Usa ferramentas SQL para consultar dados adicionais no banco.
3. Gera analise estruturada com categorias `SAFE` e `VALUE`.
4. Valida coerencia via schema Zod.
5. Persiste em `suggested_bets` e `game_analysis`.

**Output:** apostas sugeridas com categorias (gols, cartoes, escanteios, extra) e niveis de risco.

---

### 3. Admin Panel (`admin-panel/`)

Painel web completo para gestao da plataforma.

**Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4.

**Autenticacao:** Supabase Auth + middleware `withTenant()` que injeta `group_id` e `role` no contexto de cada requisicao.

**Entry point de APIs:** `createApiHandler()` -- funcao unica que encapsula autenticacao, autorizacao e tratamento de erros para todas as rotas.

#### Paginas Protegidas (10 paginas)

| Rota | Funcao |
|------|--------|
| `/dashboard` | Metricas gerais, taxas de acerto, apostas do dia |
| `/bets` | Listagem e gestao de apostas (promover, editar odds/links) |
| `/members` | Listagem de membros, status de assinatura |
| `/groups` | Listagem de grupos (super admin) |
| `/groups/new` | Onboarding de novo grupo |
| `/groups/[groupId]` | Detalhes do grupo |
| `/groups/[groupId]/edit` | Edicao de configuracoes do grupo |
| `/bots` | Pool de bots, saude e status |
| `/postagem` | Fila de postagem e acoes manuais |
| `/settings/telegram` | Configuracao de sessoes MTProto |

#### API Routes (30 rotas)

Organizadas por dominio: `bets/`, `groups/`, `members/`, `bots/`, `dashboard/`, `notifications/`, `mtproto/`, `super-admin-bot/`, `me/`, `health/`.

Operacoes principais: CRUD de apostas, promover/remover apostas, postagem manual (`post-now`), bulk update de odds/links, onboarding de grupos, sync de membros, gerenciamento de sessoes MTProto.

#### Roles

- **`super_admin`**: Acesso total a todos os grupos e configuracoes.
- **`group_admin`**: Acesso restrito ao proprio grupo, filtrado automaticamente via `withTenant()`.

---

### 4. Banco de Dados (Supabase / PostgreSQL)

**28 migrations** em `sql/migrations/`, aplicadas via Supabase Management API.

**Seguranca:** Row-Level Security (RLS) em todas as tabelas sensivels, usando funcoes `SECURITY DEFINER`:
- `get_my_role()`: Retorna o role do usuario autenticado.
- `get_my_group_id()`: Retorna o group_id do usuario autenticado.

#### Tabelas Principais

| Tabela | Funcao |
|--------|--------|
| `groups` | Tenants: posting_schedule, checkout_url, bot_token, config |
| `admin_users` | Usuarios admin com role e group_id |
| `members` | Membros dos grupos com status de assinatura |
| `suggested_bets` | Apostas geradas pelo agente IA |
| `bot_pool` | Pool de bots disponiveis para grupos |
| `bot_health` | Status de saude dos bots |
| `game_analysis` | Analises completas das partidas |
| `match_analysis_queue` | Fila de partidas para analise |
| `league_matches` | Partidas importadas do FootyStats |
| `stats_match_details` | Estatisticas detalhadas de partidas |
| `team_lastx_stats` | Forma recente dos times |
| `webhook_events` | Log de webhooks de pagamento |
| `job_executions` | Log de execucoes de jobs |
| `notifications` | Notificacoes do sistema |

---

### 5. Integracoes Externas

| Servico | Uso | Protocolo |
|---------|-----|-----------|
| **Telegram Bot API** | Mensagens, kicks, webhooks, gestao de grupos | HTTPS REST |
| **Telegram MTProto** | Criacao de grupos, sync de membros, operacoes avancadas | MTProto (TDLib) |
| **Mercado Pago** | Assinaturas, webhooks de pagamento | HTTPS REST |
| **The Odds API** | Odds ao vivo para enriquecer apostas | HTTPS REST |
| **FootyStats API** | Dados de partidas, estatisticas, forma de times | HTTPS REST |
| **OpenAI GPT-4o** | Analise de partidas via LangChain | HTTPS REST |
| **Render API** | Deploy e gestao de bots em producao | HTTPS REST |
| **Supabase Auth** | Autenticacao de usuarios do admin panel | HTTPS REST |

---

## Fluxo de Dados

O sistema opera em um pipeline diario com etapas sequenciais:

```
1. daily_update.js       2. agent pipeline        3. distributeBets
   Busca dados do           Analisa partidas          Distribui apostas
   FootyStats e salva       via GPT-4o e gera         da pool central
   no Supabase              suggested_bets            para grupos ativos
        │                        │                         │
        ▼                        ▼                         ▼
4. enrichOdds            5. postBets              6. trackResults
   Busca odds ao vivo       Posta no Telegram         Avalia resultados
   via The Odds API         com confirmacao           pos-jogo (green/red)
                            do admin
```

**Detalhamento:**

1. **`daily_update.js`** -- Executa scripts ETL (`fetchMatchDetails`, `fetchLastX`) para importar dados frescos do FootyStats para o Supabase.
2. **Agent pipeline** -- `runAnalysis.js` processa a fila `match_analysis_queue`, roda o agente LangChain (GPT-4o) com concurrency=3 e salva apostas em `suggested_bets`.
3. **`distributeBets`** -- Job que distribui apostas da pool central para grupos ativos usando round-robin, respeitando o `posting_schedule` de cada grupo.
4. **`enrichOdds`** -- Busca odds ao vivo via The Odds API e atualiza as apostas antes da postagem.
5. **`postBets`** -- Posta as apostas formatadas no Telegram, com fluxo de confirmacao no grupo admin antes de publicar no grupo publico.
6. **`trackResults`** -- Apos o termino das partidas, avalia automaticamente os resultados e marca cada aposta como green (acerto) ou red (erro).

---

## Multi-tenancy

O sistema e projetado para suportar multiplos grupos/influencers simultaneamente:

- **Tabela `groups`**: Cada registro representa um tenant com configuracoes proprias (`posting_schedule`, `checkout_url`, `bot_token`, `timezone`).
- **Bots dedicados**: Cada grupo roda uma instancia de bot no Render com `GROUP_ID` especifico no environment.
- **RLS no banco**: Todas as queries sao filtradas automaticamente por `group_id` usando policies do PostgreSQL.
- **Admin panel**: O middleware `withTenant()` injeta o contexto do tenant em cada requisicao. Group admins nunca veem dados de outros grupos.
- **Pool de bots**: Tabela `bot_pool` gerencia bots disponiveis que podem ser alocados a novos grupos.

---

## Deployment

| Componente | Plataforma | Modo |
|------------|------------|------|
| Bots Telegram | Render (Web Service) | Webhook mode, free tier |
| Webhook pagamentos | Render (Web Service) | Express server dedicado |
| Admin Panel | Vercel | Next.js serverless |
| Banco de dados | Supabase | PostgreSQL gerenciado + Auth + RLS |

**Render:** Cada bot e um Web Service independente. O free tier faz spin-down apos 15min de inatividade, mas webhooks do Telegram reativam o servico automaticamente. O scheduler interno (`server.scheduler.js`) gerencia os cron jobs quando o bot esta ativo.

**Vercel:** O admin panel roda como aplicacao Next.js com deploy automatico via git push. Variaveis de ambiente gerenciadas via Vercel Dashboard.

**Supabase:** Hospeda o PostgreSQL com RLS habilitado, Supabase Auth para autenticacao do admin panel, e API REST automatica para consultas diretas.

---

## Scripts ETL (`scripts/`)

Scripts de ingestao e manutencao de dados:

| Script | Funcao |
|--------|--------|
| `daily_update.js` | Orquestra atualizacao diaria completa |
| `check_analysis_queue.js` | Recalcula fila de analise |
| `fetchMatchDetails.js` | Busca estatisticas detalhadas de partidas |
| `fetchLastX.js` | Busca forma recente dos times |
| `fetchLeagueMatches.js` | Busca partidas de temporadas |
| `pipeline.js` | Executa pipeline completo (ETL + analise) |
| `showSuccessRates.js` | Exibe taxas de acerto por periodo |
| `run-migration.js` | Aplica migrations SQL no Supabase |

---

*Documentacao atualizada em 2026-02-25.*

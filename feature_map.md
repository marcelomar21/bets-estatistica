# GuruBet - Feature Map

> Gerado em 01/04/2026. Atualizado automaticamente via `/loop`.

## Executive Summary

**GuruBet** é uma plataforma SaaS multi-tenant para geração automatizada de tips de apostas esportivas e gestão de comunidades. Combina análise com IA, automação Telegram/WhatsApp, gestão de assinaturas e um admin panel completo.

**Stack:**
- **Backend:** Node.js + PostgreSQL (Supabase)
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **AI/ML:** OpenAI GPT via LangChain
- **Data:** FootyStats API, The Odds API
- **Mensageria:** Telegram Bot API, WhatsApp (Baileys), MTProto
- **Pagamentos:** Mercado Pago
- **Deploy:** Render (3 web services: bot, webhook, WhatsApp)

---

## 1. BET ANALYSIS & GENERATION

### 1.1 AI-Powered Match Analysis
Analisa partidas usando dados estatísticos e gera sugestões de aposta via agente LLM.

**Key Files:**
- `agent/analysis/runAnalysis.js` — Orquestrador principal
- `agent/analysis/agentCore.js` — Agente LangChain com tools
- `agent/analysis/prompt.js` — Prompts de análise
- `agent/tools.js` — Tools do agente (getTeamStats, getMatchDetails, getLastXStats)
- `agent/persistence/saveOutputs.js` — Salva análise no DB

**Features:**
- Agente LangChain multi-step com reasoning
- Processamento paralelo de partidas (concorrência configurável)
- Triagem de elegibilidade (janela 2-14 dias)
- Categorização (SAFE vs OPORTUNIDADE)
- Score de confiança (0-1)
- Relatório Markdown + JSON, PDF no Supabase Storage

**Persistence Layer (agent/persistence/):**
- `saveOutputs.js` — Salva apostas no DB
- `analysisParser.js` — Parser de output do agente
- `generateMarkdown.js` / `generateReport.js` — Geração de relatórios MD/PDF
- `htmlRenderer.js` — Render HTML para PDF
- `reportService.js` / `reportUtils.js` — Serviços de relatório
- `storageUpload.js` — Upload para Supabase Storage
- `generateMissingReports.js` — Regenera relatórios faltantes
- `schema.js` — Schema de validação do output do agente
- `shared/naming.js` — Convenções de nomes de arquivos

### 1.2 Data Ingestion Pipeline
Busca e sincroniza dados de partidas do FootyStats API.

**Key Files:**
- `scripts/syncSeasons.js` — Sync temporadas
- `scripts/daily_update.js` — Atualização diária
- `scripts/pipeline.js` — Pipeline ETL unificado

**Pipeline Steps:** syncSeasons → check-queue → daily-update → run-analysis → save-outputs → enrich-odds → request-links → post-bets

### 1.3 Odds Enrichment
Busca odds em tempo real do The Odds API e enriquece as apostas.

**Key Files:**
- `bot/services/oddsService.js` — Integração The Odds API
- `bot/services/marketInterpreter.js` — Matching de mercados
- `bot/jobs/enrichOdds.js` — Job de enriquecimento

**Features:** Cache in-memory (5min TTL), rate limit management, retry com backoff, prioridade por liga

**Mercados suportados (auto):** Goals over/under, BTTS, 1x2, Handicap
**Mercados manuais:** Corners, Bookings, Shots

---

## 2. BET DISTRIBUTION & POSTING

### 2.1 Multi-Group Distribution (Round-Robin)
Distribui apostas para múltiplos grupos via round-robin determinístico.

**Key Files:**
- `bot/jobs/distributeBets.js` — Job de distribuição
- `sql/migrations/061_bet_group_assignments.sql` — Junction table

**Features:** Junction table (`bet_group_assignments`), round-robin por `group.created_at`, filtro por `enabled_modules`, janela hoje+amanhã (BRT), lifecycle independente por grupo

### 2.2 Dynamic Posting Scheduler
Lê horários de postagem do banco e agenda jobs dinamicamente.

**Key Files:**
- `bot/server.scheduler.js` — Scheduler dinâmico
- `bot/jobs/postBets.js` — Job de postagem

**Features:** Schedule no DB (`groups.posting_schedule` JSONB), check por minuto para `post_at` custom, auto-distribuição 5min antes, "Post Now" manual, preview, histórico de postagem

**Schedule padrão:** 10:00, 15:00, 22:00 BRT

### 2.3 Copy Generation (LLM-Powered)
Gera copy engajante para posts via OpenAI com config de tom.

**Key Files:**
- `bot/services/copyService.js` — Geração LLM

**Modos:**
- **Full-message:** Replica estrutura dos `examplePosts` configurados
- **Bullet-points:** Extrai dados estatísticos quando não há exemplos

**Features:** Enforcement estrutural, vocabulário proibido/sugerido, CTAs variáveis, oddLabel customizável, persistência em `bet_group_assignments.generated_copy`

### 2.4 Telegram Message Posting
Posta mensagens formatadas nos grupos Telegram.

**Key Files:**
- `bot/telegram.js` — Client singleton
- `bot/jobs/postBets.js` — Lógica de postagem
- `lib/channelAdapter.js` — Abstração multi-canal

---

## 3. MEMBER MANAGEMENT & ONBOARDING

### 3.1 Member State Machine
Gerencia ciclo de vida do membro com transições de estado.

**Key Files:**
- `bot/services/memberService.js` — CRUD + state machine

**States:** `trial` → `ativo` → `inadimplente` → `removido` | `cancelado`

### 3.2 Start Command & Gate Entry
Ponto de entrada do bot — registra novos membros e envia links de convite.

**Key Files:**
- `bot/handlers/startCommand.js` — Handler do /start

**Flow:** User clica link → `/start` → registro trial → welcome message com template → invite link → entra no grupo

**Placeholders:** `{nome}`, `{grupo}`, `{dias_trial}`, `{data_expiracao}`, `{taxa_acerto}`, `{preco}`, `{linha_preco}`, `{operador}`

### 3.3 Member Events Handler
Detecta joins/leaves em grupos Telegram/WhatsApp e sincroniza DB.

**Key Files:**
- `bot/handlers/memberEvents.js` — Eventos Telegram
- `whatsapp/handlers/memberEvents.js` — Eventos WhatsApp

### 3.4 Membership Jobs

| Job | Schedule | Função |
|-----|----------|--------|
| kick-expired | Daily 10:00 | Kick membros expirados |
| trial-reminders | Daily 09:00 | Alerta 2d e 1d antes do trial |
| renewal-reminders | Daily 09:00 | Alerta 3d e 1d antes da assinatura |
| reconciliation | Daily 11:00 | Sync membros com grupo Telegram |

---

## 4. PAYMENT & SUBSCRIPTIONS

### 4.1 Mercado Pago Integration
Webhook de pagamentos com validação HMAC e event sourcing.

**Key Files:**
- `bot/handlers/mercadoPagoWebhook.js` — Webhook handler
- `bot/services/mercadoPagoService.js` — API client
- `bot/jobs/membership/process-webhooks.js` — Processamento async

**Event Mapping:**
| Evento MP | Ação |
|-----------|------|
| `purchase_approved` | trial → ativo |
| `subscription_renewed` | estender subscription_ends_at |
| `subscription_cancelled` | ativo → cancelado |
| `payment_rejected` | ativo → inadimplente |

### 4.2 Checkout & UTM Links
Gera URLs de checkout com tracking UTM para afiliados.

**Key Files:**
- `admin-panel/src/app/(auth)/utm-generator/page.tsx` — UI geradora de links

---

## 5. GROUP MANAGEMENT (MULTI-TENANT)

### 5.1 Group CRUD
Gerencia grupos Telegram/WhatsApp como tenants independentes.

**Key Files:**
- `admin-panel/src/app/(auth)/groups/` — UI de grupos
- `admin-panel/src/app/api/groups/route.ts` — API

**Properties:** name, status, telegram_group_id, telegram_admin_group_id, checkout_url, mp_product_id, subscription_price, posting_schedule, enabled_modules, trial_mode

### 5.2 Bot Pool
Pool de bot tokens Telegram compartilhados entre grupos.

**Key Files:**
- `bot/server.js` — Multi-bot server com webhook routing

### 5.3 League Preferences
Filtro de apostas por ligas preferidas, por grupo.

**Key Files:**
- `admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx`

### 5.4 Onboarding Settings
Configura fluxo de onboarding por grupo (welcome message, invite, checkout).

**Key Files:**
- `admin-panel/src/app/(auth)/onboarding/page.tsx`
- `admin-panel/src/components/features/community/OnboardingEditor.tsx`

---

## 6. TONE & COPY CONFIGURATION

### 6.1 Tone Configuration
Define voz, estilo e regras para copy gerado via LLM.

**Key Files:**
- `admin-panel/src/app/(auth)/tone/page.tsx` — UI super_admin
- `admin-panel/src/app/(auth)/groups/[groupId]/tone/page.tsx` — UI por grupo

**Campos:** persona, tone, forbiddenWords, suggestedWords, ctaTexts, oddLabel, examplePosts, customRules, rawDescription, headers, footers

### 6.2 Team Display Names
Mapeia nomes do FootyStats para nomes amigáveis.

**Key Files:**
- `admin-panel/src/app/(auth)/team-names/page.tsx`
- `lib/teamDisplayNames.js`

---

## 7. ADMIN PANEL

### 7.1 Dashboard
Overview de apostas, membros, grupos, performance e notificações.

**Métricas:** Total bets, member counts, group summary, accuracy rates (7d/30d/all-time), per-group accuracy, job health

### 7.2 Bets Management
Lista, edita, distribui e posta apostas manualmente.

**Features:** Filtros (status, liga, data), search por time, edit drawer, bulk operations, manual distribution, schedule posting, download PDF

### 7.3 Posting Queue & History
Fila de postagem e histórico.

### 7.4 Members Management
Lista, edita e gerencia assinaturas de membros.

### 7.5 Campaigns & Remarketing
Campanhas de afiliados e segmentos de remarketing.

**Segmentos:** Trial expiring, trial expired, cancelled, never paid, inactive

### 7.6 Messages & Scheduled Messages
Envio manual e agendado de mensagens para grupos.

**Features:** Rich text, media upload, Markdown, schedule picker, template library

### 7.7 Analytics
Análise profunda de performance, acurácia e tendências.

**Dimensões:** Por período, grupo, liga, categoria, par de times, mercado

### 7.8 Job Executions
Monitor de jobs agendados, histórico e erros.

### 7.9 Admin Users
Gestão de usuários com RBAC (super_admin, group_admin).

---

## 8. BOT COMMANDS

### Admin Group Commands

| Comando | Descrição |
|---------|-----------|
| `/apostas [page]` | Lista apostas disponíveis |
| `/filtrar <filter> [page]` | Filtra apostas (sem_odds, sem_link, com_link, com_odds, prontas) |
| `/fila [page]` | Fila de postagem |
| `/odds <bet_id> <odds>` | Define odds manual |
| `/link <bet_id> <url>` | Define link de aposta |
| `<bet_id>: <url>` | Quick link inline |
| `/promover [bet_id]` | Promove aposta |
| `/remover [bet_id]` | Remove da fila |
| `/overview` | Overview da fila |
| `/metricas` | Métricas de acerto |
| `/status` | Status do bot |
| `/simular [novo\|bet_id]` | Simula copy |
| `/atualizados [page]` | Odds atualizadas recentemente |
| `/help` | Lista de comandos |
| `/membros` | Lista todos os membros |
| `/membro <id>` | Detalhe de um membro |
| `/trial [days]` | Configura dias de trial |
| `/add_trial <id>` | Adiciona trial a membro |
| `/remover_membro <id> [motivo]` | Remove membro com motivo |
| `/estender <id> <days>` | Estende assinatura |
| `/postar` | Trigger manual de postagem |
| `/atualizar` | Atualizar odds |
| `/trocar <oldId> <newId>` | Substituir aposta na fila |
| `/adicionar "<match>" "<market>" <odds> [link]` | Adicionar aposta manualmente |

### User Commands

| Comando | Descrição |
|---------|-----------|
| `/start` | Onboarding e link de convite |
| `/cancelar` | Cancelar assinatura |

---

## 9. MONITORING & METRICS

### 9.1 Success Rate Tracking
Calcula acurácia across dimensões (período, liga, categoria, mercado).

### 9.2 Result Tracking (LLM-Powered)
Avalia resultados de apostas via LLM após fim da partida.

**Key Files:** `bot/jobs/trackResults.js`, `bot/services/resultEvaluator.js`
**Schedule:** A cada 5min (13:00-23:00 BRT)

### 9.3 Job Health Monitoring
Tracking de execuções, detecção de falhas, alertas.

### 9.4 Bot Health Monitoring
Heartbeat tracking para bots e WhatsApp.

---

## 10. WHATSAPP INTEGRATION

### 10.1 WhatsApp Number Pool
Pool de números para suporte multi-grupo.

**Key Files:** `whatsapp/pool/numberPoolService.js`
**Statuses:** available, active, backup, banned, cooldown, connecting

### 10.2 WhatsApp Group Management
Criação de grupos, convites, detecção de membros.

### 10.3 WhatsApp Message Sending
Mensagens formatadas com media via Baileys.

### 10.4 WhatsApp Sessions & Encryption
Sessions encriptadas com AES-256-GCM no Supabase.

### 10.5 WhatsApp Failover & Rate Limiting
Failover automático quando número é banido + rate limiting por token bucket.

**Key Files:**
- `whatsapp/services/failoverService.js` — Auto failover para backup
- `whatsapp/services/rateLimiter.js` — Token bucket (10 msg/60s)
- `whatsapp/services/addChannelService.js` — Adicionar canal WhatsApp ao grupo
- `whatsapp/clientRegistry.js` — Registry de clientes WhatsApp

---

## 11. BOT SERVICES & LIBS (Referência Interna)

| Serviço | Arquivo | Finalidade |
|---------|---------|-----------|
| alertService | `bot/services/alertService.js` | Alertas centralizados com debouncing |
| betService | `bot/services/betService.js` | CRUD de apostas, fila, assignments |
| matchService | `bot/services/matchService.js` | Operações de dados de partidas |
| metricsService | `bot/services/metricsService.js` | Cálculos de acurácia e métricas |
| previewService | `bot/services/previewService.js` | Geração de preview de mensagens |
| notificationService | `bot/services/notificationService.js` | Gestão de notificações admin |
| notificationHelper | `bot/services/notificationHelper.js` | Helpers de notificação |
| jobExecutionService | `bot/services/jobExecutionService.js` | Tracking de execução de jobs |
| termsService | `bot/services/termsService.js` | Aceite de termos de adesão (append-only) |
| webhookProcessors | `bot/services/webhookProcessors.js` | Processadores de eventos de webhook |
| configHelper | `bot/lib/configHelper.js` | Helper de configuração (getConfig) |
| formatPrice | `bot/lib/formatPrice.js` | Formatação de preço (BRL) |
| telegramMarkdown | `bot/lib/telegramMarkdown.js` | Sanitização de Markdown para Telegram |

---

## 12. EXTERNAL INTEGRATIONS

| Integração | Finalidade | Key Files |
|-----------|-----------|-----------|
| **FootyStats API** | Dados de partidas, stats de times | `scripts/syncSeasons.js`, `scripts/daily_update.js` |
| **The Odds API** | Odds em tempo real | `bot/services/oddsService.js` |
| **OpenAI API** | Análise, copy, avaliação de resultado | `agent/`, `bot/services/copyService.js`, `bot/services/resultEvaluator.js` |
| **Mercado Pago** | Pagamentos e assinaturas | `bot/handlers/mercadoPagoWebhook.js` |
| **Telegram Bot API** | Mensagens, grupos, webhooks | `bot/telegram.js` |
| **MTProto** | Criação de supergrupos (user client) | `admin-panel/src/app/api/mtproto/` |
| **Render.com** | Deploy (3 services) | `render.yaml` |

---

## 12. SCHEDULED JOBS

| Job | Schedule | Arquivo | Função |
|-----|----------|---------|--------|
| distribute-bets | 5min antes do post | `bot/jobs/distributeBets.js` | Distribuição round-robin |
| post-bets | Dinâmico (DB) | `bot/jobs/postBets.js` | Postagem nos grupos |
| track-results | 5min (13-23h BRT) | `bot/jobs/trackResults.js` | Avaliação de resultados |
| enrich-odds | Antes dos posts | `bot/jobs/enrichOdds.js` | Busca odds API |
| request-links | Antes dos posts | `bot/jobs/requestLinks.js` | Pede links aos admins |
| kick-expired | Daily 10:00 | `bot/jobs/membership/kick-expired.js` | Kick expirados |
| trial-reminders | Daily 09:00 | `bot/jobs/membership/trial-reminders.js` | Alertas trial |
| renewal-reminders | Daily 09:00 | `bot/jobs/membership/renewal-reminders.js` | Alertas renovação |
| reconciliation | Daily 11:00 | `bot/jobs/membership/reconciliation.js` | Sync membros |
| process-webhooks | 1min | `bot/jobs/membership/process-webhooks.js` | Processar pagamentos |
| send-scheduled-messages | 1min | `bot/jobs/sendScheduledMessages.js` | Enviar msgs agendadas |
| audit-results | Daily 02:00 | `bot/jobs/auditResults.js` | Auditoria de resultados |
| daily-wins-recap | Daily 22:00 | `bot/jobs/dailyWinsRecap.js` | Resumo diário |
| health-check | 5min | `bot/jobs/healthCheck.js` | Check saúde dos jobs |
| reminders | 30min | `bot/jobs/reminders.js` | Lembretes de link (30/60/90min) |
| check-affiliate-expiration | Daily 00:30 | `bot/jobs/membership/check-affiliate-expiration.js` | Expirar atribuições de afiliados (14d) |
| sync-group-members | 30min | `bot/jobs/membership/sync-group-members.js` | Sync membros Telegram com DB |

---

## 13. DATABASE — TABELAS PRINCIPAIS

| Tabela | Finalidade |
|--------|-----------|
| `league_seasons` | Temporadas do FootyStats |
| `league_matches` | Fixtures e resultados |
| `suggested_bets` | Sugestões de aposta geradas |
| `bet_group_assignments` | Junction bet↔grupo (multi-tenant) |
| `members` | Membros Telegram/WhatsApp |
| `groups` | Grupos (tenants) |
| `bot_pool` | Tokens de bot Telegram |
| `webhook_events` | Eventos de pagamento (event sourcing) |
| `job_executions` | Log de execução de jobs |
| `scheduled_messages` | Fila de mensagens agendadas |
| `whatsapp_numbers` | Pool de números WhatsApp |
| `team_display_names` | Mapeamento de nomes de times |
| `game_analysis` | Análises IA (markdown + JSON) |
| `notifications` | Notificações admin |
| `audit_log` | Auditoria de ações admin |
| `terms_acceptance` | Aceite de termos de adesão |
| `super_admin_bot_config` | Config do bot super admin |

**Total de migrations:** 65

---

## 14. API ROUTES NÃO LISTADAS ACIMA

| Rota | Método | Finalidade |
|------|--------|-----------|
| `/api/analyses` | GET | Lista relatórios de análise |
| `/api/analyses/[id]/pdf` | GET | Download PDF de análise |
| `/api/bets/[id]/assignments/[groupId]` | PATCH/DELETE | Gestão de assignment por grupo |
| `/api/bets/distribute` | POST | Distribuição bulk de apostas |
| `/api/super-admin-bot` | GET/POST | Config do bot super admin |
| `/api/super-admin-bot/test` | POST | Teste de envio do bot super admin |

---

## 15. SCRIPTS UTILITÁRIOS

| Script | Finalidade |
|--------|-----------|
| `exportBetsCSV.js` | Exportar apostas para CSV |
| `fetchLeagueTeams.js` | Buscar times por liga |
| `fetchMatchDetails.js` | Buscar detalhes de partida |
| `generateTeamPdfs.js` | Gerar PDFs de times |
| `check_analysis_queue.js` | Verificar fila de análise |
| `check-group-members.js` | Verificar membros de grupo |
| `compare-counts.js` | Comparar contagens |
| `get-member-names.js` | Obter nomes de membros |
| `list-db-members.js` | Listar membros do DB |
| `loadCountries.js` | Carregar países |
| `loadLastX.js` | Carregar últimos X jogos |
| `loadLeagueMatches.js` | Carregar partidas |
| `loadLeaguePlayers.js` | Carregar jogadores |
| `loadLeagueSeasons.js` | Carregar temporadas |
| `loadLeagueTeamStats.js` | Carregar stats de times |
| `loadMatchDetails.js` | Carregar detalhes de partidas |
| `match-members.js` | Match de membros |
| `resetAndEnrich.js` | Reset e re-enriquecimento |
| `resetPosted.js` | Reset de apostas postadas |
| `run-migration.js` | Executar migration SQL |
| `seed-admin-users.js` | Seed de usuários admin |
| `showSuccessRates.js` | Exibir taxas de acerto |
| `showSuccessRatesByCategory.js` | Acerto por categoria |
| `showSuccessRatesByLeague.js` | Acerto por liga |
| `showTopBottomPairs.js` | Top/bottom pares de times |
| `testResultEvaluator.js` | Testar avaliador de resultados |
| `validate-metrics.js` | Validar métricas |

---

## 16. ADMIN PANEL ROUTES

### Comunidade
`/dashboard`, `/members`, `/campaigns`, `/remarketing`, `/messages`, `/onboarding`, `/community-settings`

### Tipster
`/bets`, `/postagem`, `/analyses`, `/posting-history`, `/analytics`, `/tone`, `/utm-generator`

### SuperAdmin
`/job-executions`, `/groups`, `/groups/new`, `/groups/[id]/edit`, `/groups/[id]/tone`, `/groups/[id]/leagues`, `/bots`, `/whatsapp-pool`, `/settings/telegram`, `/admin-users`, `/team-names`

---

## 17. SHARED LIBS (lib/)

| Lib | Arquivo | Finalidade |
|-----|---------|-----------|
| supabase | `lib/supabase.js` | Client singleton (service_role) |
| logger | `lib/logger.js` | Logger com níveis (info, warn, error) |
| utils | `lib/utils.js` | Date formatting, URL validation |
| validators | `lib/validators.js` | Validação de input (email, telegram ID) |
| formatConverter | `lib/formatConverter.js` | Markdown ↔ WhatsApp formatting |
| phoneUtils | `lib/phoneUtils.js` | Formatação E.164 de telefone |
| config | `lib/config.js` | Config centralizada (LLM models, supabase, etc.) |
| channelAdapter | `lib/channelAdapter.js` | Abstração Telegram/WhatsApp |
| teamDisplayNames | `lib/teamDisplayNames.js` | Resolução de nomes de times |
| db | `lib/db.js` | Pool PostgreSQL direto |

---

## 18. MIDDLEWARE (Admin Panel)

| Middleware | Arquivo | Finalidade |
|-----------|---------|-----------|
| api-handler | `admin-panel/src/middleware/api-handler.ts` | `createApiHandler()` — wrapper com auth + tenant |
| guards | `admin-panel/src/middleware/guards.ts` | Guards de role (super_admin, group_admin) |
| index | `admin-panel/src/middleware/index.ts` | Next.js middleware (auth redirect) |

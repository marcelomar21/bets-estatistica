---
title: Files Map
created: '2026-02-25'
tags:
- project
- files
permalink: guru/project/files-map
type: note
---

# Files Map

Mapa dos arquivos principais do projeto. Atualizado em 2026-03-27.

## Bot (Node.js / CommonJS)

### Entry Points
- `bot/server.js` — Entry point webhook/prod, setup scheduler
- `bot/server.scheduler.js` — Dynamic posting scheduler (multi-tenant)
- `bot/index.js` — Entry point polling/dev
- `bot/webhook-server.js` — Webhook server alternativo
- `bot/telegram.js` — Singleton client + BotRegistry (initBots, getAllBots)

### Handlers
- `bot/handlers/adminGroup.js` — Comandos admin (/fila, /postar, etc)
- `bot/handlers/startCommand.js` — /start para novos membros
- `bot/handlers/cancelCommand.js` — /cancelar assinatura
- `bot/handlers/memberEvents.js` — Eventos de entrada/saida de membros
- `bot/handlers/mercadoPagoWebhook.js` — Webhook MP
- `bot/handlers/admin/` — Subcomandos admin (betCommands, memberCommands, queryCommands, actionCommands, callbackHandlers)

### Jobs
- `bot/jobs/postBets.js` — Postagem de apostas (scheduled + manual)
- `bot/jobs/distributeBets.js` — Distribuicao round-robin entre grupos
- `bot/jobs/trackResults.js` — Tracking de resultados via LLM
- `bot/jobs/enrichOdds.js` — Enriquecimento com odds da API
- `bot/jobs/requestLinks.js` — Solicita links aos operadores
- `bot/jobs/reminders.js` — Follow-up de links
- `bot/jobs/healthCheck.js` — Heartbeat bot_health
- `bot/jobs/auditResults.js` — Auditoria diaria de resultados
- `bot/jobs/sendScheduledMessages.js` — Mensagens agendadas
- `bot/jobs/jobWarn.js` — Alertas de falha de jobs
- `bot/jobs/membership/` — Jobs de membership (trial-reminders, kick-expired, process-webhooks, sync-group-members, renewal-reminders, reconciliation, check-affiliate-expiration)

### Services
- `bot/services/betService.js` — CRUD apostas + getFilaStatus
- `bot/services/copyService.js` — Geracao de copy via LLM
- `bot/services/oddsService.js` — The Odds API
- `bot/services/alertService.js` — Alertas admin
- `bot/services/matchService.js` — Queries partidas
- `bot/services/metricsService.js` — Taxa de acerto
- `bot/services/marketInterpreter.js` — Interpretacao de mercados
- `bot/services/resultEvaluator.js` — Avaliacao de resultados via LLM
- `bot/services/previewService.js` — Preview de mensagens
- `bot/services/memberService.js` — CRUD membros
- `bot/services/mercadoPagoService.js` — Integacao Mercado Pago
- `bot/services/notificationService.js` — Notificacoes internas
- `bot/services/notificationHelper.js` — Helper de notificacoes
- `bot/services/jobExecutionService.js` — Logging de execucao de jobs
- `bot/services/termsService.js` — Termos de uso
- `bot/services/webhookProcessors.js` — Processadores de webhook

### Bot Lib
- `bot/lib/configHelper.js` — Helpers de configuracao
- `bot/lib/formatPrice.js` — Formatacao de precos
- `bot/lib/telegramMarkdown.js` — Sanitizacao Markdown Telegram
- `bot/utils/formatters.js` — Formatadores gerais

## Lib (Compartilhado)
- `lib/config.js` — Configuracoes centralizadas
- `lib/db.js` — PostgreSQL Pool
- `lib/supabase.js` — Cliente REST Supabase
- `lib/logger.js` — Logging centralizado
- `lib/channelAdapter.js` — Adapter multi-canal (Telegram/WhatsApp)
- `lib/formatConverter.js` — Conversao de formatos
- `lib/teamDisplayNames.js` — Nomes customizados de times
- `lib/phoneUtils.js` — Utilidades telefone
- `lib/utils.js` — Utilidades gerais
- `lib/validators.js` — Validadores

## Agent (Pipeline de Analise)
- `agent/pipeline.js` — Orquestrador do pipeline
- `agent/tools.js` — Tools LangChain (calculator, etc)
- `agent/analysis/runAnalysis.js` — Core da analise IA
- `agent/analysis/agentCore.js` — Modulo de logica do agente
- `agent/analysis/prompt.js` — Prompts
- `agent/analysis/schema.js` — Schemas Zod
- `agent/persistence/` — Persistencia, reports HTML/PDF, storage

## Admin Panel (Next.js 16 / TypeScript)

### Pages (App Router)
dashboard, members, bets, postagem, posting-history, analytics, groups, groups/[groupId]/edit, groups/[groupId]/tone, groups/[groupId]/leagues, groups/new, onboarding, bots, admin-users, messages, job-executions, team-names, community-settings, tone, analyses, settings/telegram, whatsapp-pool

### API Routes (61 routes)
- `/api/bets/` — CRUD, distribute, promote, remove, link, odds, result, schedule, bulk ops
- `/api/bets/post-now/` — Post manual + status polling + preview
- `/api/bets/queue/` — Fila de postagem
- `/api/bets/posting-history/` — Historico
- `/api/groups/` — CRUD, onboarding, tone, leagues, WhatsApp, sync-members, community-settings
- `/api/members/` — Lista, cancel, reactivate, toggle-admin
- `/api/messages/` — CRUD, upload media
- `/api/dashboard/stats/` — Stats consolidadas
- `/api/analytics/accuracy/` — Taxa de acerto
- `/api/analyses/` — Analises + PDF
- `/api/notifications/` — CRUD + mark-all-read
- `/api/admin-users/` — CRUD + reset-password
- `/api/bots/` — Status bots
- `/api/job-executions/` — Logs + summary
- `/api/team-display-names/` — Nomes customizados
- `/api/health/` — Health check
- `/api/me/` — Usuario logado
- `/api/super-admin-bot/` — Bot admin + test
- `/api/mtproto/` — Sessions, setup, verify
- `/api/whatsapp-pool/` — Pool + connect + QR

### Lib
- `lib/supabase.ts` + `supabase-server.ts` + `supabase-admin.ts` — Clients Supabase
- `lib/mercadopago.ts` — Mercado Pago
- `lib/render.ts` — Render API
- `lib/telegram.ts` — Telegram Bot API
- `lib/mtproto.ts` — MTProto (GramJS)
- `lib/encryption.ts` — Criptografia
- `lib/audit.ts` — Audit log
- `lib/pair-stats.ts` — Estatisticas de pares
- `lib/bet-utils.ts` + `bet-categories.ts` — Utilidades apostas
- `lib/format.ts` + `format-utils.ts` + `fetch-utils.ts` — Formatacao e fetch
- `lib/super-admin-bot.ts` — Bot super admin

### Middleware
- `middleware/api-handler.ts` — createApiHandler wrapper
- `middleware/tenant.ts` — withTenant multi-tenant
- `middleware/guards.ts` — Guards de permissao

## SQL Migrations
60 migrations em `sql/migrations/` (001 a 060), cobrindo: schema inicial, membership, multi-tenant, RLS, audit, notifications, MTProto, posting schedule, previews, WhatsApp, team display names.
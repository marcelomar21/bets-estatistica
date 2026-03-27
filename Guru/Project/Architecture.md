---
title: Architecture
created: 2026-02-25
tags:
- project
- architecture
permalink: guru/project/architecture
---

## Arquitetura Atual

### Singleton Pattern

O sistema inteiro e construido sobre **singletons module-level**:

- **`bot/telegram.js`**: `let bot = null` -- uma unica instancia de `TelegramBot` por processo
- **`bot/server.scheduler.js`**: `let activePostingJobs = []`, `let currentSchedule = null`, `let isManualPostInProgress = false` -- globals compartilhados
- **`bot/jobs/postBets.js`**: `const pendingConfirmations = new Map()` -- mapa global de confirmacoes pendentes
- **`lib/config.js`**: config flat lida de env vars uma vez no startup

Todas as funcoes helpers (`sendToAdmin`, `sendToPublic`) leem direto de `config.telegram.adminGroupId` sem receber contexto de grupo. Cada DB query usa `config.membership.groupId` (singleton).

### Webhook e Roteamento

- URL do webhook: `POST /webhook/<BOT_TOKEN>` -- 1 rota Express por token
- `processWebhookUpdate()` faz comparacao direta de `msg.chat.id === config.telegram.adminGroupId` para decidir se e mensagem admin
- Nao existe dispatch table nem bot registry -- tudo e if/else contra config estatica

### BOT_MODE

- `central`: jobs globais (distributeBets, trackResults, enrichOdds, kick-expired)
- `group`: jobs per-group (posting scheduler, renewalReminders, syncMembers)
- `mixed`: todos os jobs (default)
- Central jobs NAO usam `GROUP_ID` -- rodam cross-group

### Scheduler Dinamico

- `loadPostingSchedule()` le `groups.posting_schedule` filtrado por `GROUP_ID`
- `setupDynamicScheduler(schedule)` cria pares de cron jobs por horario: distribuicao em `T-5min`, postagem em `T`
- `reloadPostingSchedule()` a cada 5min via `setInterval` detecta mudancas no DB
- `checkPostNow()` a cada 30s via `setInterval` detecta flag `post_now_requested_at`

### Multi-Tenant via group_id + RLS

Todas as queries filtram por `group_id`. Row Level Security no Supabase garante isolamento de dados entre grupos.

### Service Pattern

Todos os services retornam:

```js
{ success: true, data: ... }
// ou
{ success: false, error: "mensagem" }
```

### Structured Logger

Logs com prefix `[module:job]` para facilitar debugging em producao.

### Zod Validation + LLM

Zod validation com `withStructuredOutput` para chamadas LLM, garantindo schema tipado nas respostas.

## Arquitetura Futura

### BotContext / BotRegistry

A evolucao planejada substitui os singletons por um registry de contextos:

```
BotContext = {
  bot: TelegramBot,
  groupId,
  adminGroupId,
  publicGroupId,
  botToken,
  groupConfig
}
```

- **`BotRegistry`**: `Map<groupId, BotContext>` -- gerencia N bots em 1 processo
- **`initBots()`** substitui `initBot()`: le da tabela `bot_pool` (source of truth) com JOIN em `groups`
- **`getBotForGroup(groupId)`** retorna o `BotContext` correto
- **`sendToAdmin(text, botCtx)`** e **`sendToPublic(text, botCtx)`** recebem contexto explicito
- **Backward-compat temporario**: se chamado sem `botCtx`, usa o primeiro bot + warning no log

### Servidor Unico Multi-Bot

- 1 processo Node.js gerencia N bots (em vez de 1 servico por bot no Render)
- Multiplos tokens/webhooks coexistem no mesmo Express app
- Scheduler vira factory: `createScheduler(groupId, botCtx)` com isolamento de estado
- `BOT_MODE` se torna irrelevante (processo unico roda tudo)

### Separacao de Jobs

- **Jobs centrais (globais)**: `distributeBets`, `trackResults`, `enrichOdds` -- rodam 1x cross-group
- **Jobs per-group (scheduler)**: posting jobs, renewalReminders, syncMembers -- 1 instancia por grupo

Ver detalhes completos em [[Multi-Bot v2]].
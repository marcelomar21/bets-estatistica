---
title: Files Map
created: 2026-02-25
tags: [project, files]
---

## Files to Reference (Investigacao Completa)

| File | Purpose | Impacto da Mudanca |
| ---- | ------- | ------------------ |
| `bot/server.js` | Entry point, webhook setup, scheduler bootstrap | ALTO -- precisa suportar N bots |
| `bot/server.scheduler.js` | Scheduling dinamico (cron + polling) | ALTO -- globals -> factory per group |
| `bot/telegram.js` | Singleton `TelegramBot` + helpers `sendToAdmin`/`sendToPublic` | ALTO -- singleton -> Map + botCtx param |
| `lib/config.js` | Config flat via env vars, `maxActiveBets: 3`, `validateConfig()` | ALTO -- env vars -> DB-loaded per-group |
| `bot/jobs/postBets.js` | Postagem + `pendingConfirmations` Map + preview/confirm flow | ALTO -- scoping + preview/edit |
| `bot/jobs/distributeBets.js` | Round-robin `groups[i % len]` sem offset | MEDIO -- add offset + fairness |
| `bot/jobs/trackResults.js` | Tracking com janela 2-4h sem recovery | MEDIO -- add recovery sweep |
| `bot/services/betService.js` | `getFilaStatus` com `limit(3)` em 5 pontos | MEDIO -- remover cap |
| `bot/services/resultEvaluator.js` | Single LLM eval, Zod schema, prompt limitado | MEDIO -- multi-LLM + prompt expandido |
| `bot/services/copyService.js` | Copy LLM sem system message, sem tone config | MEDIO -- add tone injection |
| `bot/services/alertService.js` | Alertas com `sendToAdmin` hardcoded | BAIXO -- add botCtx param |
| `bot/services/oddsService.js` | Odds enrichment via The Odds API | BAIXO -- sem mudanca direta |
| `bot/handlers/startCommand.js` | `/start` le `config.telegram.publicGroupId` (linhas 204, 285, 528) | MEDIO -- precisa lookup por token |
| `bot/handlers/callbackHandlers.js` | Callbacks leem `config.telegram.publicGroupId` (linha 73) | BAIXO -- add botCtx |
| `bot/handlers/admin/actionCommands.js` | Comandos admin (`/postar`, `/odds`, etc) | BAIXO -- add botCtx |
| `bot/handlers/adminGroup.js` | Router de mensagens admin | BAIXO -- add botCtx |
| `bot/jobs/membership/kick-expired.js` | Kick com fallback para `config.telegram.publicGroupId` | BAIXO -- remover fallback env var |
| `bot/jobs/membership/sync-group-members.js` | Sync com `GROUP_ID` global | BAIXO -- receber groupId param |
| `bot/jobs/membership/renewal-reminders.js` | Lembretes com `GROUP_ID` global | BAIXO -- receber groupId param |
| `admin-panel/src/app/api/bets/post-now/route.ts` | Post-now com `MIN_ODDS` hardcoded | MEDIO -- add preview endpoint |
| `admin-panel/src/app/api/groups/route.ts` | CRUD de grupos | MEDIO -- add tone config |

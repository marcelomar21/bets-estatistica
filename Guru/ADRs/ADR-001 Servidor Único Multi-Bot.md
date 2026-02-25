---
title: "Servidor Único Multi-Bot"
created: "2026-02-25"
status: accepted
author: Winston (Arquiteto), Marcelomendes
tags: [adr]
---

# ADR-001: Servidor Único Multi-Bot

## Context

Each bot (Guru da Bet, Osmar Palpites) is a separate Render deploy with its own Node.js process:

- `srv-d5hp23a4d50c7397o1q0` → Guru da Bet
- `srv-d6678u1r0fns73ciknn0` → Osmar Palpites

This is operationally complex: configuration is duplicated across deploys, environment variables must be kept in sync, and scaling to N bots means N independent deploys. The codebase is identical between deploys — only env vars differ.

The architecture relies on singletons throughout:
- `telegram.js`: `let bot = null` — single `TelegramBot` instance
- `server.scheduler.js`: module-level globals (`activePostingJobs`, `currentSchedule`, `isManualPostInProgress`)
- `postBets.js`: `const pendingConfirmations = new Map()` — global confirmation map
- `config.js`: flat config read from env vars once at startup

All helper functions (`sendToAdmin`, `sendToPublic`) read directly from `config.telegram.adminGroupId` without receiving group context.

## Decision

Consolidate into **1 Node.js process managing N bots** via `BotContext`/`BotRegistry` pattern.

### Key refactors:

- **`telegram.js`**: singleton `let bot = null` → `Map<groupId, BotContext>` where `BotContext = { bot: TelegramBot, groupId, adminGroupId, publicGroupId, botToken, groupConfig }`
- **`server.js`**: 1 webhook route → N dynamic routes registered per bot token (`app.post('/webhook/<token>', handler)` with closure over `botCtx`)
- **`server.scheduler.js`**: module globals → `createScheduler(groupId)` factory function, each instance with isolated state
- **`config.js`**: env vars → DB-loaded per-group configs from `bot_pool` (source of truth) JOIN `groups`

All functions receive `botCtx` as an explicit parameter. `processWebhookUpdate(update)` becomes `processWebhookUpdate(update, botCtx)`.

`BOT_MODE` env var becomes irrelevant (single process runs everything). Job deduplication ensures cross-group jobs (`distributeBets`, `trackResults`, `enrichOdds`) run exactly once globally, while per-group jobs (`postBets`, `renewalReminders`, `syncMembers`) run per scheduler instance.

## Consequences

### Positive

- **Single deploy**: 1 Render service instead of N, simpler ops
- **Shared memory**: bot instances coexist in same process, shared connection pools
- **Easier monitoring**: 1 set of logs, 1 health check endpoint
- **Scales to N bots**: adding a new bot = inserting a row in `bot_pool`, no new deploy needed
- **Config consistency**: all config loaded from DB, no env var drift

### Negative

- **Blast radius**: 1 unhandled crash kills all bots (mitigated by fault isolation per `BotContext` + `process.on('uncaughtException')`)
- **More complex code**: every function needs `botCtx` parameter, migration is mechanically broad
- **Needs fault isolation**: scheduler failure in group A must not affect group B
- **Memory footprint**: single process holds all bot instances (acceptable for 2-5 bots)

## Alternatives Considered

| Alternative | Status | Reason |
|---|---|---|
| Keep 1:1 deploy (current) | Rejected | Doesn't scale — N bots = N deploys, config drift, operational complexity |
| Kubernetes with separate pods | Rejected | Overkill for 2-5 bots, adds infrastructure complexity without proportional benefit |
| Shared codebase with env-var switching (current) | Rejected | Same code N times is wasteful, config still duplicated |

## Related

- [[Specs/Multi-Bot v2]] — Full technical specification
- [[E06 Multi-Bot Evolution/_Overview]] — Epic overview
- [[2026-02-25 Feedback Operadores]] — Discovery session (item A1)
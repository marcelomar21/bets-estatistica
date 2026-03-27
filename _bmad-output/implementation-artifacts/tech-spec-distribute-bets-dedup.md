---
title: 'Fix — distribute-bets executa 4x no mesmo timestamp'
slug: 'distribute-bets-dedup'
created: '2026-03-16'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js 20', 'node-cron', 'CommonJS']
files_to_modify:
  - 'bot/server.js'
code_patterns:
  - 'cron.schedule(expression, handler, { timezone: TZ })'
  - 'withExecutionLogging(jobName, fn) wraps job with job_executions insert'
  - 'runDistributeBets() é global — distribui pra todos os grupos de uma vez'
  - 'runDistributeBetsWithFailureGuard() é wrapper com retry'
  - 'Central jobs gated por if (runCentral) em server.js L413'
test_patterns:
  - 'Jest para backend (bot/)'
  - 'Verificar via job_executions que não há duplicatas no mesmo minuto'
---

# Tech-Spec: Fix — distribute-bets executa 4x no mesmo timestamp

**Created:** 2026-03-16
**Linear:** GURU-10

## Overview

### Problem Statement

O job `distribute-bets` é agendado em 3 lugares independentes:
1. **Central cron** (`server.js` L425): roda a cada 15 minutos
2. **Legacy singleton** (`server.scheduler.js` L184): roda 5min antes de cada posting time
3. **Factory per-group** (`server.scheduler.js` L387): roda 5min antes de cada posting time, por grupo

Com 4 grupos ativos com os mesmos horários de postagem, isso gera 4+ execuções no mesmo segundo — todas registrando "0 distributed" no job_executions.

### Solution

Remover o cron central de distribute-bets em `server.js` L425-438. Os dynamic schedulers (legacy + factory) já cobrem todos os grupos. O `runDistributeBets()` é global (distribui pra todos os grupos), então basta 1 execução.

### Scope

**In Scope:**
- Remover o bloco do cron central de distribute-bets em `server.js`

**Out of Scope:**
- Mudanças nos dynamic schedulers (legacy e factory — funcionam corretamente)
- Deduplicação no `runDistributeBetsWithFailureGuard` (os schedulers per-group são úteis pra timing correto)
- Mudanças no jobExecutionService

## Context for Development

### Codebase Patterns

- **Central jobs:** registrados em `server.js` L413-500+, dentro do bloco `if (runCentral)`
- **Dynamic schedulers:** `server.scheduler.js` tem `setupDynamicScheduler()` (L120+) e `createScheduler()` (L340+)
- **`runDistributeBets()`** (em `bot/jobs/distributeBets.js`): é GLOBAL — distribui bets pra todos os grupos de uma vez. Não precisa ser chamado N vezes.

### Files to Reference

| File | Lines | Purpose |
| ---- | ----- | ------- |
| `bot/server.js` | L425-438 | Central cron distribute-bets (REMOVER) |
| `bot/server.scheduler.js` | L184-199 | Legacy singleton — 5min antes de posting (MANTER) |
| `bot/server.scheduler.js` | L387-395 | Factory per-group — 5min antes de posting (MANTER) |
| `bot/services/jobExecutionService.js` | L23-38 | Logging de execução |

### Technical Decisions

- **Remover só o central cron:** o `runDistributeBets()` já é global. O cron central a cada 15min é redundante quando os dynamic schedulers já rodam 5min antes de cada postagem.
- **Manter dynamic schedulers:** eles garantem que a distribuição acontece no timing certo (5min antes de cada postagem). Se removermos eles também, perdemos o timing preciso.
- **Nota:** os factory schedulers TAMBÉM chamam `runDistributeBetsWithFailureGuard()` (global), então mesmo com múltiplos grupos, a distribuição é global. A redundância está nos múltiplos triggers, não na lógica de distribuição.

## Implementation Plan

### Tasks

#### Task 1: Remover cron central de distribute-bets

- [ ] **1.1** Remover bloco do cron central
  - File: `bot/server.js`
  - Action: Remover L425-438 (o bloco `cron.schedule('*/15 * * * *', ...)` do distribute-bets)
  - Action: Remover o `require` do `runDistributeBets` na L422 se não for usado em outro lugar do mesmo bloco
  - Notes: Verificar se `runDistributeBets` é importado em outro cron no mesmo bloco `if (runCentral)`. Se não, remover o require.

### Acceptance Criteria

- [ ] **AC 1:** Given o bot rodando em produção, when o timestamp de posting se aproxima, then distribute-bets executa apenas 1x (via dynamic scheduler) em vez de 4x
- [ ] **AC 2:** Given o bot rodando, when passa 15 minutos, then distribute-bets NÃO executa pelo cron central (removido)
- [ ] **AC 3:** Given os dynamic schedulers, when 5min antes do posting time, then distribute-bets continua executando normalmente

## Additional Context

### Dependencies
- Requer deploy no Render após merge (auto-deploy OFF)

### Testing Strategy

**Validação:**
1. Verificar via `job_executions` que distribute-bets não aparece mais a cada 15 minutos
2. Verificar que ainda aparece 5min antes dos posting times
3. Monitorar por 24h após deploy

### Notes
- O `require('./jobs/distributeBets')` na L422 também é usado pelo `runDistributeBetsWithFailureGuard` que é importado em `server.scheduler.js` separadamente. O require no `server.js` é local ao bloco central.

---
title: 'Fix — Notificação de grupo Desconhecido por bot_health órfão'
slug: 'bot-health-orphan-cleanup'
created: '2026-03-16'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'TypeScript 5', 'PostgreSQL']
files_to_modify:
  - 'admin-panel/src/app/api/dashboard/stats/route.ts'
  - 'sql/migrations/058_bot_health_cleanup.sql'
code_patterns:
  - 'bot_health JOIN groups via group_id — entries com NULL geram fallback Desconhecido'
  - 'alerts loop em dashboard/stats L270-285 não filtra entries sem group_id'
  - 'persistNotifications() deduplica por type::group_id dentro de 1h'
test_patterns:
  - 'admin-panel/src/app/api/__tests__/dashboard.test.ts — mock de bot_health data'
---

# Tech-Spec: Fix — Notificação de grupo Desconhecido por bot_health órfão

**Created:** 2026-03-16
**Linear:** GURU-11

## Overview

### Problem Statement

2 entries em `bot_health` têm `group_id = NULL`:
- `fb483baf-d812-429e-b6e0-5eda9f857e36` (last heartbeat: 16/03 19:35)
- `745151c0-c8b7-47dd-b9b2-e64f0c307ca3` (last heartbeat: 13/03 03:35)

Quando o dashboard gera alertas, o JOIN com `groups` retorna `null` e o fallback "Desconhecido" é usado. Isso gera notificações de "Bot do grupo Desconhecido está offline" repetidamente.

### Solution

1. Deletar as entries órfãs no banco
2. Filtrar entries sem `group_id` no loop de alertas (defensivo)

### Scope

**In Scope:**
- Migration SQL pra deletar entries órfãs
- Guard no loop de alertas pra ignorar entries sem group_id

**Out of Scope:**
- Adicionar NOT NULL constraint em bot_health.group_id (o unified bot pode precisar de NULL temporariamente durante init)
- Investigar por que entries sem group_id foram criadas

## Context for Development

### Codebase Patterns

- **Dashboard stats:** `GET /api/dashboard/stats` query bot_health com `select('group_id, status, last_heartbeat, error_message, groups(name)')` — L190
- **Alert loop:** L270-285 itera sobre `botHealth` sem filtrar NULL group_id
- **Fallback:** `groupName ?? 'Desconhecido'` em L280

### Files to Reference

| File | Lines | Purpose |
| ---- | ----- | ------- |
| `admin-panel/src/app/api/dashboard/stats/route.ts` | L270-285 | Loop de alertas — adicionar guard |
| `sql/migrations/` | nova 058 | Cleanup das entries órfãs |

## Implementation Plan

### Tasks

#### Task 1: Cleanup SQL

- [ ] **1.1** Criar migration de cleanup
  - File: `sql/migrations/058_bot_health_cleanup.sql`
  - Action: `DELETE FROM bot_health WHERE group_id IS NULL;`
  - Notes: Aplicar via Supabase Management API. Resposta `[]` = sucesso.

#### Task 2: Guard defensivo no dashboard

- [ ] **2.1** Filtrar entries sem group_id no loop de alertas
  - File: `admin-panel/src/app/api/dashboard/stats/route.ts`
  - Action: Na L271, adicionar `if (!h.group_id) continue;` como primeira linha do loop
  - Notes: Previne recorrência se novas entries órfãs surgirem. 1 linha.

### Acceptance Criteria

- [ ] **AC 1:** Given o cleanup executado, when o dashboard carrega, then NÃO mostra notificação de "Desconhecido"
- [ ] **AC 2:** Given uma nova entry em bot_health com group_id NULL (hipotético), when o dashboard gera alertas, then ignora a entry silenciosamente
- [ ] **AC 3:** Given entries com group_id válido, when o bot está offline, then a notificação continua funcionando normalmente

## Additional Context

### Dependencies
- Migration SQL precisa ser aplicada na produção

### Testing Strategy

**Validação:**
1. Aplicar migration SQL
2. Recarregar dashboard — verificar que "Desconhecido" sumiu
3. Verificar que alertas de bots reais (Osmar, Rajizito, etc.) continuam aparecendo

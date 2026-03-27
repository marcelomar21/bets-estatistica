---
title: 'UX — Agrupar notificações repetidas de bot offline'
slug: 'notifications-grouping'
created: '2026-03-16'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'React 19', 'TypeScript 5', 'Tailwind CSS 4', 'Supabase']
files_to_modify:
  - 'admin-panel/src/app/api/dashboard/stats/route.ts'
  - 'admin-panel/src/components/features/dashboard/NotificationsPanel.tsx'
  - 'admin-panel/src/app/api/notifications/route.ts'
code_patterns:
  - 'persistNotifications() deduplica por type::group_id dentro de 1h (L27)'
  - 'recentSet = Set de strings type::group_id (L40-44)'
  - 'NotificationsPanel renderiza flat list sem agrupamento (L72-103)'
  - 'Notification type: Record com type, severity, title, message, group_id, metadata, read, created_at'
test_patterns:
  - 'admin-panel/src/app/api/__tests__/dashboard.test.ts — mock de bot_health e notifications'
  - 'Vitest + React Testing Library para componentes'
---

# Tech-Spec: UX — Agrupar notificações repetidas de bot offline

**Created:** 2026-03-16
**Linear:** GURU-7

## Overview

### Problem Statement

O painel de notificações no dashboard é dominado por alertas repetidos de "Bot Offline". Com a janela de deduplicação de apenas 1 hora, o mesmo alerta aparece ~24x por dia por grupo. Com 5 grupos, são ~120 notificações/dia — todas iguais.

O operador não consegue distinguir informação útil (novo membro trial, pagamento recebido) do ruído.

### Solution

1. Aumentar janela de deduplicação de 1h para 6h
2. Agrupar notificações do mesmo tipo+grupo no frontend, mostrando contagem

### Scope

**In Scope:**
- Aumentar janela de deduplicação no backend (1h → 6h)
- Agrupar notificações repetidas no frontend por type+group_id
- Mostrar badge com contagem de ocorrências agrupadas

**Out of Scope:**
- Botão "Reiniciar bot" (feature separada, requer integração com Render API)
- Mudanças no schema de notificações
- Separar notificações por categoria/tab (future improvement)

## Context for Development

### Codebase Patterns

- **Deduplicação backend:** `persistNotifications()` em `dashboard/stats/route.ts` L20-79
  - L27: janela de 1h (`60 * 60 * 1000`)
  - L40-44: `recentSet` com chaves `type::group_id`
  - L52-58: filtra alertas já existentes na janela
- **Frontend:** `NotificationsPanel.tsx` renderiza lista flat (L72-103)
- **API de notificações:** `GET /api/notifications` retorna array flat ordenado por `created_at DESC`

### Files to Reference

| File | Lines | Purpose |
| ---- | ----- | ------- |
| `admin-panel/src/app/api/dashboard/stats/route.ts` | L27 | Janela de deduplicação (1h → 6h) |
| `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx` | L72-103 | Lista flat → agrupar |
| `admin-panel/src/app/api/notifications/route.ts` | L12-76 | API que retorna notificações |

### Technical Decisions

- **Backend: 6h em vez de 24h:** com 6h, o operador vê no máximo ~4 alertas/dia/grupo em vez de ~24. Suficiente pra reduzir ruído sem perder visibilidade de mudanças de estado.
- **Frontend grouping em vez de backend:** mais simples, não requer mudança no schema. O backend continua retornando a lista flat, o componente agrupa antes de renderizar.
- **Agrupar por `type + group_id`:** uma notification "Bot Offline — Osmar Palpites" que aparece 5x vira 1 item com badge "(5)".

## Implementation Plan

### Tasks

#### Task 1: Aumentar janela de deduplicação

- [ ] **1.1** Mudar janela de 1h para 6h
  - File: `admin-panel/src/app/api/dashboard/stats/route.ts`
  - Action: Na L27, mudar `60 * 60 * 1000` para `6 * 60 * 60 * 1000`
  - Notes: 1 linha. Reduz de ~24 inserções/dia/grupo para ~4.

#### Task 2: Agrupar notificações no frontend

- [ ] **2.1** Criar lógica de agrupamento no `NotificationsPanel`
  - File: `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx`
  - Action: Antes do `map` na L73, agrupar notificações por `type::group_id`:
    ```typescript
    const grouped = notifications.reduce((acc, n) => {
      const key = `${n.type}::${n.group_id ?? ''}`;
      if (!acc.has(key)) acc.set(key, { ...n, count: 1 });
      else acc.get(key)!.count += 1;
      return acc;
    }, new Map<string, Notification & { count: number }>());
    const groupedList = [...grouped.values()];
    ```
  - Action: Usar `groupedList` no `.map()` em vez de `notifications`
  - Action: Quando `count > 1`, renderizar badge ao lado do título: `<span className="ml-1.5 text-xs bg-gray-200 text-gray-600 rounded-full px-1.5">{count}x</span>`
  - Notes: A notificação mais recente do grupo é a que aparece (primeira no array, já que é DESC por created_at). O `onMarkAsRead` marca apenas essa — as outras continuam no banco mas ficam "escondidas" pelo agrupamento.

### Acceptance Criteria

- [ ] **AC 1:** Given 5 notificações "Bot Offline" do mesmo grupo nas últimas 6h, when o dashboard carrega, then mostra 1 item com badge "5x"
- [ ] **AC 2:** Given notificações de tipos diferentes (bot_offline + new_trial), when o dashboard carrega, then cada tipo aparece separadamente (não são agrupados entre si)
- [ ] **AC 3:** Given a janela de 6h, when um bot fica offline, then no máximo 4 notificações são criadas por dia (em vez de 24)
- [ ] **AC 4:** Given notificações agrupadas, when o operador clica "Marcar lida" no item agrupado, then apenas a notificação mais recente é marcada como lida

## Additional Context

### Dependencies
- Nenhuma dependência externa.

### Testing Strategy

**Testes unitários:**
- Testar agrupamento no `NotificationsPanel`: passar array com 5 notifications do mesmo type+group_id e verificar que renderiza 1 item com badge "5x"
- Testar que notifications de tipos diferentes NÃO são agrupadas

**Validação E2E (Playwright):**
1. Login como super_admin
2. Navegar para /dashboard
3. Verificar que notificações repetidas de "Bot Offline" aparecem agrupadas
4. Verificar que "Novo Membro Trial" aparece separadamente

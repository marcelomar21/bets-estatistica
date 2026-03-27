---
title: 'Fix — Contadores de membros inconsistentes com paginação'
slug: 'member-counters-consistency'
created: '2026-03-16'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'TypeScript 5', 'Vitest 3.2', 'React Testing Library']
files_to_modify:
  - 'admin-panel/src/app/api/members/route.ts'
  - 'admin-panel/src/app/(auth)/members/page.test.tsx'
code_patterns:
  - 'Service response: { success: true, data: { items, pagination, counters } }'
  - 'counters.total calculado como total - adminsCount (bug)'
  - 'pagination.total usa mainResult.count direto (correto)'
  - 'adminsCount via query separada com .eq(is_admin, true)'
test_patterns:
  - 'vi.spyOn(global, fetch) para mock de API'
  - 'mockFetchByUrl() com membersByPage customizável'
  - 'MembersApiResponse type com counters.total, pagination.total'
---

# Tech-Spec: Fix — Contadores de membros inconsistentes com paginação

**Created:** 2026-03-16
**Linear:** GURU-8

## Overview

### Problem Statement

Na página `/members`, o header mostra "Total: 24" via `counters.total` mas a paginação mostra "Total de 27 membros" via `pagination.total`. A diferença de 3 são os admins — `counters.total` faz `total - adminsCount` enquanto `pagination.total` usa o count bruto da query.

O operador vê dois números diferentes pro mesmo conceito e fica confuso.

### Solution

Parar de subtrair admins de `counters.total`. Ambos counters e paginação passam a mostrar o mesmo valor. Admins continuam com contagem própria no card roxo "Admins".

### Scope

**In Scope:**
- Corrigir `counters.total` para incluir admins
- Atualizar testes que verificam o valor de `counters.total`

**Out of Scope:**
- Mudanças no frontend (os componentes já consomem `counters.total` e `pagination.total` — quando iguais, a inconsistência desaparece)
- Mudanças no card de Admins (continua mostrando contagem separada)

## Context for Development

### Codebase Patterns

- **API response format:** `{ success: true, data: { items, pagination: { page, per_page, total, total_pages }, counters: { total, trial, ativo, vencendo, admins } } }`
- **Counter queries:** 5 queries separadas em paralelo — main (total), trial, ativo, vencendo, admins — cada uma com `.select('*', { count: 'exact', head: true })`
- **pagination.total:** usa `mainResult.count` direto (inclui admins) — correto
- **counters.total:** faz `total - adminsCount` — o bug

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `admin-panel/src/app/api/members/route.ts` | API route — L186 é o bug (`total: total - adminsCount`) |
| `admin-panel/src/app/(auth)/members/page.tsx` | Frontend — L258 (`counters.total`) e L399 (`pagination.total`) |
| `admin-panel/src/app/(auth)/members/page.test.tsx` | Testes — mock de `counters` nos fixtures |

### Technical Decisions

- **Não mudar o frontend:** os componentes já consomem os valores corretos. Quando a API retorna `counters.total === pagination.total`, a inconsistência desaparece naturalmente.
- **Manter o card Admins:** o counter `admins` continua separado. É informação complementar, não conflitante.

## Implementation Plan

### Tasks

#### Task 1: Corrigir counters.total na API

- [x] **1.1** Remover subtração de adminsCount em `route.ts`
  - File: `admin-panel/src/app/api/members/route.ts`
  - Action: Na L186, mudar `total: total - adminsCount` para `total: total`
  - Notes: 1 linha. O `total` já vem de `mainResult.count` que inclui todos os membros.

#### Task 2: Atualizar testes

- [ ] **2.1** Atualizar mock de counters em `page.test.tsx`
  - File: `admin-panel/src/app/(auth)/members/page.test.tsx`
  - Action: Nos fixtures que definem `counters.total`, ajustar o valor para incluir admins (se o mock tiver admins nos items, o total deve refleti-los)
  - Notes: Verificar se algum teste compara `counters.total` diretamente. O fixture `defaultMembersPage` tem `total: 2` com 0 admins — sem mudança necessária. Apenas testes que mockam admins precisam ajuste.

### Acceptance Criteria

- [x] **AC 1:** Given a página /members com 24 membros regulares e 3 admins, when carrega, then `counters.total` mostra 27 (igual a `pagination.total`)
- [ ] **AC 2:** Given o card roxo "Admins", when carrega, then continua mostrando 3 (contagem independente)
- [ ] **AC 3:** Given todos os testes existentes, when rodados, then passam sem regressões

## Additional Context

### Dependencies
- Nenhuma dependência externa.

### Testing Strategy

**Testes unitários:**
- Verificar que a API retorna `counters.total === pagination.total`
- O fixture padrão nos testes não tem admins, então não precisa de mudança

**Validação E2E (Playwright):**
1. Login como super_admin
2. Navegar para /members
3. Verificar que o counter "Total" no header bate com o "Total de X membros" na paginação

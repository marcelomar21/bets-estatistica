---
title: 'UX — Empty state informativo na página de postagem'
slug: 'postagem-empty-state'
created: '2026-03-16'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'React 19', 'TypeScript 5', 'Tailwind CSS 4']
files_to_modify:
  - 'admin-panel/src/components/features/posting/PostingQueueTable.tsx'
  - 'admin-panel/src/app/(auth)/postagem/page.tsx'
code_patterns:
  - 'PostingQueueTable aceita prop emptyMessage (string opcional)'
  - 'Empty state atual: div com p.text-sm.text-gray-500 (L167-173)'
  - 'Toolbar de bulk schedule visível mesmo com lista vazia (L952-975)'
  - 'queueData.postable filtrado via postableBets (useMemo)'
test_patterns:
  - 'Sem testes existentes para PostingQueueTable ou postagem/page'
  - 'Padrão do projeto: Vitest + React Testing Library'
---

# Tech-Spec: UX — Empty state informativo na página de postagem

**Created:** 2026-03-16
**Linear:** GURU-9

## Overview

### Problem Statement

Quando não há apostas na fila de postagem, o `PostingQueueTable` mostra apenas "Nenhuma aposta elegivel para postagem." — texto plano, sem ícone, sem contexto, sem ação. O operador não sabe se é normal ou se algo está errado. A toolbar de bulk schedule continua visível mas desabilitada, gerando confusão.

### Solution

Melhorar o empty state com ícone, descrição contextual, e link para `/bets`. Esconder toolbar quando lista vazia.

### Scope

**In Scope:**
- Melhorar empty state do `PostingQueueTable` com ícone + descrição + call-to-action
- Esconder toolbar de bulk schedule quando não há apostas

**Out of Scope:**
- Criar testes (não há testes existentes — fora do escopo deste fix)
- Mudanças no fluxo de postagem
- Mudanças na API

## Context for Development

### Codebase Patterns

- **Empty state atual:** `PostingQueueTable.tsx` L167-173 — `<div>` com `<p>` texto simples
- **Toolbar:** `page.tsx` L952-975 — inputs de time + botões, visíveis sempre que `queueData && !isPreviewActive`
- **Link pattern:** projeto usa `next/link` para navegação interna
- **Estilo de cards informativos:** padrão `rounded-lg border border-{color}-200 bg-{color}-50 p-3` (usado no bot invite link card)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `admin-panel/src/components/features/posting/PostingQueueTable.tsx` | L167-173 — empty state a melhorar |
| `admin-panel/src/app/(auth)/postagem/page.tsx` | L943-985 — seção "Fila de Postagem" com toolbar |

## Implementation Plan

### Tasks

#### Task 1: Melhorar empty state no PostingQueueTable

- [ ] **1.1** Atualizar empty state em `PostingQueueTable.tsx`
  - File: `admin-panel/src/components/features/posting/PostingQueueTable.tsx`
  - Action: Substituir L167-173 por empty state com:
    - Ícone de clipboard/lista vazia (SVG inline, `h-10 w-10 text-gray-300`)
    - Título: "Nenhuma aposta na fila"
    - Descrição: "As apostas aparecem aqui automaticamente quando tiverem odds e link. Verifique o pipeline de apostas para acompanhar."
    - Link: `<a href="/bets">Ver apostas →</a>` com estilo `text-blue-600 hover:text-blue-800 text-sm font-medium`
  - Notes: Manter prop `emptyMessage` como override opcional. O novo layout é o fallback.

#### Task 2: Esconder toolbar quando lista vazia

- [ ] **2.1** Condicionar toolbar ao tamanho da lista
  - File: `admin-panel/src/app/(auth)/postagem/page.tsx`
  - Action: Na L952, adicionar condição `{postableBets.length > 0 && (` ao redor do bloco de toolbar (bulk schedule time input + botões)
  - Notes: O heading "Fila de Postagem (0 apostas)" continua visível — só a toolbar é escondida

### Acceptance Criteria

- [ ] **AC 1:** Given nenhuma aposta na fila, when a página /postagem carrega, then mostra ícone + texto explicativo + link para /bets
- [ ] **AC 2:** Given nenhuma aposta na fila, when a página carrega, then a toolbar de bulk schedule NÃO é exibida
- [ ] **AC 3:** Given apostas na fila, when a página carrega, then a toolbar e tabela aparecem normalmente (sem regressão)

## Additional Context

### Dependencies
- Nenhuma dependência externa.

### Testing Strategy

**Validação E2E (Playwright):**
1. Login como super_admin, selecionar grupo
2. Navegar para /postagem
3. Se lista vazia: verificar ícone + texto + link para /bets
4. Verificar que toolbar não aparece quando lista vazia

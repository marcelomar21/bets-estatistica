---
title: 2026-03-16 GURU-9 Postagem Empty State
type: note
permalink: guru/changelog/2026-03-16-guru-9-postagem-empty-state
---

# 2026-03-16 — GURU-9 Postagem Empty State

## PR
- #149 feat(postagem): improve empty state with icon, description and link

## Mudança
- Empty state da fila de postagem agora mostra ícone + descrição + link para /bets
- Toolbar de bulk schedule escondida quando não há apostas na fila

## Arquivos
- `admin-panel/src/components/features/posting/PostingQueueTable.tsx` L167-177
- `admin-panel/src/app/(auth)/postagem/page.tsx` L952
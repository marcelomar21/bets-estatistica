---
title: '2026-03-27 PR #166 — Fix post-now maxDaysAhead + timeout feedback'
type: note
permalink: guru/changelog/2026-03-27-pr-166-fix-post-now-max-days-ahead-timeout-feedback
tags:
- fix
- posting
- CAP 1000 Tips
- PR-166
---

# 2026-03-27 — PR #166: Fix post-now maxDaysAhead + timeout feedback

## PRs mergeados
- **#166** `fix(posting): bypass maxDaysAhead for manual posts + improve timeout feedback`

## Resumo das mudanças

### Bug corrigido
O "Post Now" manual do admin panel falhava silenciosamente para apostas com kickoff > 2 dias. O admin panel aceitava as apostas (valida apenas `kickoff > now`), mas o bot filtrava com `maxDaysAhead=2` no `getFilaStatus()`. Resultado: bot postava 0, frontend esperava 60s e mostrava "Bot não respondeu".

### Mudanças

**Bot (2 arquivos):**
- `betService.js`: `getFilaStatus()` aceita `{ skipMaxDaysFilter }` para pular filtro de `maxDaysAhead`
- `postBets.js`: Passa `skipMaxDaysFilter: true` quando é post manual (`allowedBetIds` presente)

**Admin Panel (6 arquivos):**
- `post-now/route.ts`: Retorna `warnings` quando apostas têm kickoff > 2 dias (não-bloqueante)
- `post-now/status/route.ts`: Verifica se bot limpou flag `post_now_requested_at` (distingue "bot processou 0" de "bot offline")
- `PostNowButton.tsx` + `postagem/page.tsx`: Exibe warnings amber + para polling cedo com mensagem descritiva quando `botProcessed=true`
- `bets/[id]/distribute/route.ts` + `bets/bulk/distribute/route.ts`: Auto-atribuem `post_at` via round-robin ao distribuir manualmente (estava null, causando posts agendados a ignorar apostas)

### Sem migrations

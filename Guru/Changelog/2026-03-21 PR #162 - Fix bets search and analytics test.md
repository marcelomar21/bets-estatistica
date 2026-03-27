---
title: '2026-03-21 PR #162 - Fix bets search and analytics test'
type: note
permalink: guru/changelog/2026-03-21-pr-162-fix-bets-search-and-analytics-test
tags:
- changelog
- fix
- bets
- analytics
- supabase
---

# 2026-03-21 — PR #162: fix(bets+analytics)

## Mudanças

### Bets search fix
- **Problema**: busca por time na página de apostas retornava erro 500 (qualquer busca textual falhava)
- **Causa raiz**: `.or()` do Supabase/PostgREST não suporta misturar colunas de tabela estrangeira (`league_matches.home_team_name`) com colunas da tabela pai (`bet_market`) num único `.or()`
- **Fix**: usar `{ referencedTable: 'league_matches' }` no `.or()` para busca por time
- **Trade-off**: busca por `bet_market` (nome do mercado) removida do text search — para cross-table OR seria necessária uma RPC
- Placeholder atualizado de "Buscar por time ou mercado..." para "Buscar por time..."

### Analytics accuracy test fix
- Mock do teste `analytics-accuracy` não tinha `.range()` após commit `d5a536f` ter adicionado paginação na rota
- Adicionado mock de `.range()` que retorna dados na primeira chamada e array vazio nas subsequentes

## Arquivos alterados
- `admin-panel/src/app/api/bets/route.ts`
- `admin-panel/src/components/features/bets/BetFilters.tsx`
- `admin-panel/src/components/features/bets/__tests__/BetComponents.test.tsx`
- `admin-panel/src/app/api/__tests__/analytics-accuracy.test.ts`

## Sem migrations

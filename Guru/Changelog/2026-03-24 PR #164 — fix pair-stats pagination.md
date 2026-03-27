---
title: '2026-03-24 PR #164 — fix pair-stats pagination'
type: note
permalink: guru/changelog/2026-03-24-pr-164-fix-pair-stats-pagination
tags:
- fix
- bets
- pair-stats
- pagination
---

# 2026-03-24 — PR #164: fix pair-stats pagination

## O que mudou

`fetchPairStats()` em `admin-panel/src/lib/pair-stats.ts` não paginava a query ao Supabase. Com o limite padrão de 1000 rows, apenas ~57% das 1767 apostas resolvidas eram consideradas no cálculo da TAXA HIST. na tabela de Apostas.

## Fix

Adicionada paginação com `while` loop (mesmo padrão de `analytics/accuracy/route.ts`), garantindo que todas as apostas resolvidas são incluídas no cálculo.

## Impacto

Taxas históricas na tabela de Apostas estavam severamente subestimadas:

| La Liga + Categoria | Antes | Depois |
|---|---|---|
| Gols | 48% (26/54) | 67% (58/86) |
| Escanteios | 27% (12/44) | 56% (41/73) |
| Cartões | 37% (10/27) | 63% (29/46) |
| BTTS | 28% (5/18) | 69% (29/42) |

## Arquivos alterados

- `admin-panel/src/lib/pair-stats.ts` — paginação na query de `fetchPairStats()`

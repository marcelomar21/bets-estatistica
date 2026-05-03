---
title: GURU-50 Refinement — Campeonatos Adicionais Pagos
type: note
permalink: guru/changelog/guru-50-refinement-campeonatos-adicionais-pagos
tags:
- refinement
- GURU-50
- premium-leagues
- mercado-pago
---

# GURU-50 Refinement — Campeonatos Adicionais Pagos

**Date:** 2026-03-28
**Status:** Ready to Dev
**Linear:** GURU-50
**Tech Spec:** `_bmad-output/implementation-artifacts/tech-spec-campeonatos-adicionais-pagos.md`

## Summary

Refinement of the paid additional championships feature. Group admins can purchase premium leagues (R$100/month each) via Mercado Pago preapproval subscriptions. Bot distribution enforces premium access.

## Key Design Decisions

1. **`league_tiers` table** (separate from `league_seasons`) — avoids duplication across multiple seasons per league
2. **`group_league_purchases` table** — tracks MP subscriptions per premium league per group
3. **1 MP preapproval per league per group** — independent lifecycle, `external_reference` = `league:{groupId}:{leagueName}`
4. **Bot enforcement** in `isGroupEligibleForBet()` — hard block, not just UI
5. **Backward compatible** — all existing leagues default to `standard`

## New Database Objects

- `league_tiers` (migration 063) — tier classification + price per league
- `group_league_purchases` (migration 064) — purchase tracking with MP refs

## Stories (4, 13 tasks total)

- **50-1**: Migration + league_tiers + super_admin API + UI (4 tasks)
- **50-2**: Purchase API + MP integration + webhook (3 tasks)
- **50-3**: League preferences UI premium support (2 tasks)
- **50-4**: Bot distribution premium enforcement (4 tasks)

## Estimate

8 points

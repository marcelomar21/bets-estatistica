---
title: '2026-03-28 PR #168 formatPickDisplay fix'
type: note
permalink: guru/changelog/2026-03-28-pr-168-format-pick-display-fix
tags:
- changelog
- fix
- admin-panel
- ui
---

# 2026-03-28 — PR #168 merged

## fix(bets): use formatPickDisplay to prevent duplicated bet description

**Commit:** `defe868c` (squash merge)
**Closes:** GURU-27

### O que mudou
- `BetEditDrawer` renderizava `{bet_market} — {pickDisplay}` causando duplicação quando market == pick (ex: "BTTS — BTTS")
- Adotou `formatPickDisplay()` em 7 componentes: BetEditDrawer, OddsEditModal, LinkEditModal, DistributeModal, ResultEditModal, PostingHistoryTable, postagem/page.tsx
- Testes atualizados para novo formato

### Impacto
- Apenas display de texto — sem mudança de lógica ou dados
- Nenhuma migration SQL
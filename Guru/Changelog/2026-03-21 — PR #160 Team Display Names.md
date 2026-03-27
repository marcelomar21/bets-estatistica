---
title: '2026-03-21 — PR #160 Team Display Names'
type: note
permalink: guru/changelog/2026-03-21-pr-160-team-display-names
tags:
- changelog
- pr-160
- team-names
- migration-060
---

# PR #160 — Team Display Names

**Data:** 2026-03-21
**Branch:** `feature/team-display-names`
**Status:** Mergeado

## Resumo

Feature que permite super admins customizarem nomes de times exibidos em todo o sistema (bot, relatórios, admin panel) sem alterar dados brutos da API.

## Mudanças

### Migration 060: `team_display_names`
- Tabela com `api_name` (UNIQUE), `display_name`, `is_override` (coluna gerada)
- RLS: SELECT para authenticated, INSERT/UPDATE apenas para super_admin
- Seed automático de 366 times a partir de `league_matches`
- Trigger `updated_at`

### Backend
- `lib/teamDisplayNames.js`: Resolver com cache em memória (5min TTL), deduplicação de promises
- `bot/services/betService.js`: Resolver aplicado em `getEligibleBets()` e `getBetsReadyForPosting()`
- `agent/persistence/htmlRenderer.js`, `generateMarkdown.js`, `reportUtils.js`: Resolver aplicado (funções tornadas async)
- `agent/persistence/reportService.js`, `saveOutputs.js`: Callers atualizados para await

### Admin Panel
- `GET/PATCH /api/team-display-names`: API com sanitização de search, limites de batch (100), validação de comprimento (200 chars)
- `useTeamDisplayNames` hook: Singleton module-level (1 fetch compartilhado entre 8 componentes)
- Página `/team-names`: Edição inline, debounce search, dirty-check
- Sidebar: Link "Nomes de Times" na seção SuperAdmin
- 8 componentes atualizados com `resolve()`: BetTable, BetEditDrawer, DistributeModal, LinkEditModal, OddsEditModal, PostingQueueTable, PostingHistoryTable, ResultEditModal

## Arquivos (20)

**Novos (5):**
- `sql/migrations/060_team_display_names.sql`
- `lib/teamDisplayNames.js`
- `admin-panel/src/app/api/team-display-names/route.ts`
- `admin-panel/src/hooks/useTeamDisplayNames.ts`
- `admin-panel/src/app/(auth)/team-names/page.tsx`

**Modificados (15):**
- `bot/services/betService.js`
- `agent/persistence/htmlRenderer.js`, `generateMarkdown.js`, `reportUtils.js`, `reportService.js`, `saveOutputs.js`
- 8 componentes admin panel + `Sidebar.tsx`

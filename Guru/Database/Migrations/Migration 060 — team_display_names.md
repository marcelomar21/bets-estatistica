---
title: Migration 060 — team_display_names
type: note
permalink: guru/database/migrations/migration-060-team-display-names
tags:
- migration
- migration-060
- team-names
---

# Migration 060 — team_display_names

**Data:** 2026-03-21
**PR:** #160

## Tabela

```sql
CREATE TABLE team_display_names (
  id BIGSERIAL PRIMARY KEY,
  api_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) <= 200),
  is_override BOOLEAN GENERATED ALWAYS AS (api_name IS DISTINCT FROM display_name) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Características
- **Sem group_id** — dado global compartilhado entre todos os tenants
- **`is_override`** — coluna gerada que indica se o display_name foi customizado
- **RLS ativo**: SELECT para authenticated, ALL para super_admin
- **Seed**: Popular com DISTINCT de `home_team_name` e `away_team_name` de `league_matches`
- **Trigger**: `updated_at` automático

## Notas
- Novos times do pipeline diário NÃO entram automaticamente. Re-rodar seed SQL quando necessário.
- 366 times iniciais inseridos.

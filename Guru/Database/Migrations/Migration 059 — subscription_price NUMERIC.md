---
title: Migration 059 — subscription_price NUMERIC
type: note
permalink: guru/database/migrations/migration-059-subscription-price-numeric
tags:
- database
- migration
- pricing
---

# Migration 059 — subscription_price VARCHAR → NUMERIC(10,2)

**PR:** #155
**Data:** 2026-03-16
**Arquivo:** `sql/migrations/059_subscription_price_numeric.sql`

## O que faz
1. Adiciona coluna temporária `subscription_price_new NUMERIC(10,2)`
2. Converte dados VARCHAR existentes para NUMERIC (regex extrai número, troca `,` por `.`)
3. Drop coluna VARCHAR original
4. Rename `subscription_price_new` → `subscription_price`
5. Adiciona CHECK `subscription_price >= 0`
6. Lock `ACCESS EXCLUSIVE` na tabela `groups` durante a migração

## Impacto
- `groups.subscription_price` agora é `NUMERIC(10,2)` em vez de `VARCHAR`
- Supabase JS v2 retorna como `number` no JavaScript
- Valores não parseáveis (ex: "gratuito") viram `NULL`
- Bot e admin panel adaptados para usar número + `formatBRL()` para display

## Pré-requisitos de deploy
⚠️ Aplicar ANTES do deploy do admin panel e bot

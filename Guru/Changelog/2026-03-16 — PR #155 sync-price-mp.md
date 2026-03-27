---
title: '2026-03-16 — PR #155 sync-price-mp'
type: note
permalink: guru/changelog/2026-03-16-pr-155-sync-price-mp
tags:
- changelog
- pricing
- mercadopago
- migration
---

# 2026-03-16 — PR #155: Sync subscription_price com Mercado Pago

## PRs
- **#155** `feat(pricing): sync subscription_price with Mercado Pago` — merged via squash

## Resumo
Migrou `subscription_price` de VARCHAR para NUMERIC(10,2) e sincroniza automaticamente o preço com o plano do Mercado Pago ao salvar em Community Settings.

## Mudanças principais
- **Migration 059:** `subscription_price` VARCHAR → NUMERIC(10,2) com conversão automática de dados existentes (regex extrai número do texto)
- **Nova função `updateSubscriptionPlanPrice()`** em `mercadopago.ts` — `PUT /preapproval_plan/{id}` com `auto_recurring.transaction_amount`
- **`formatBRL()` utility** criada em bot (`bot/lib/formatPrice.js`) e admin panel (`admin-panel/src/lib/format.ts`)
- **CommunitySettingsForm:** input numérico com preview BRL, retry de MP sync, warning ao limpar preço
- **OnboardingEditor:** preview formata preço numérico via `formatBRL()`
- **Onboarding wizard:** agora grava `subscription_price` no DB junto com `mp_plan_id`
- **Bot (6+ arquivos):** `startCommand.js`, `memberEvents.js`, `notificationService.js` — todos usam `formatBRL()` para formatar preço numérico
- **telegram.js:** `|| null` → `?? null` para preservar preço 0 corretamente

## Migration
- `sql/migrations/059_subscription_price_numeric.sql`
- ⚠️ Deve ser aplicada ANTES do deploy do admin panel e bot
- Converte dados existentes automaticamente (ex: "R$ 49,90/mês" → 49.90)
- VARCHARs não parseáveis viram NULL

## Arquivos modificados (20)
sql/migrations/059_subscription_price_numeric.sql, admin-panel/src/lib/mercadopago.ts, admin-panel/src/lib/format.ts, admin-panel/src/app/api/groups/[groupId]/community-settings/route.ts, admin-panel/src/app/api/groups/onboarding/route.ts, admin-panel/src/components/features/community/CommunitySettingsForm.tsx, admin-panel/src/components/features/community/OnboardingEditor.tsx, admin-panel/src/app/(auth)/community-settings/page.tsx, admin-panel/src/app/(auth)/onboarding/page.tsx, bot/handlers/startCommand.js, bot/handlers/memberEvents.js, bot/services/notificationService.js, bot/telegram.js, bot/lib/formatPrice.js + testes

---
title: PR 161 - Fix analytics pagination + evaluator model
type: note
permalink: guru/changelog/pr-161-fix-analytics-pagination-evaluator-model
tags:
- fix
- analytics
- bot
- pr-161
---

# PR #161 — fix(analytics+bot): paginate accuracy query and update evaluator model

**Data:** 2026-03-21
**PR:** https://github.com/marcelomar21/bets-estatistica/pull/161

## Mudanças

### 1. Paginação na API de analytics accuracy
- **Arquivo:** `admin-panel/src/app/api/analytics/accuracy/route.ts`
- **Problema:** Query do Supabase batia no limite padrão de 1000 linhas do PostgREST. Com 1703 apostas resolvidas, apenas as primeiras 1000 eram retornadas, causando taxas de acerto erradas (40% ao invés de ~65%).
- **Fix:** Adicionado loop de paginação com `PAGE_SIZE = 1000` e `.range()` para buscar todos os registros.

### 2. Modelo do evaluator corrigido
- **Arquivo:** `bot/services/resultEvaluator.js`
- **Problema:** Fallback hardcoded era `gpt-5.1-mini` (modelo inexistente na API OpenAI). Todas as avaliações de resultado por LLM falhavam com "All LLM providers failed".
- **Fix:** Fallback atualizado para `gpt-5.4-mini`. Env var `EVALUATOR_MODEL_OPENAI=gpt-5.4-mini` também configurada no Render.

## Mudanças operacionais (não são código)

### BOT_MODE alterado de `group` para `mixed`
- **Serviço:** `bets-bot-unified` (Render `srv-d6fliv6a2pns7382ckd0`)
- **Problema:** Com `BOT_MODE=group`, 9 jobs centrais estavam parados desde 25/02 (track-results, audit-results, enrich-odds, process-webhooks, kick-expired, trial-reminders, reconciliation, check-affiliate-expiration, cleanup-stuck-jobs).
- **Causa raiz:** Quando a arquitetura migrou de múltiplos bots para bot unificado (PR #126), o `BOT_MODE` ficou como `group` sem um serviço `central` separado.
- **Fix:** Alterado para `mixed` — modo que roda tanto jobs de grupo quanto centrais.

### 107 apostas pendentes processadas
- 688 apostas estavam pendentes desde 27/02 (sem resultado computado)
- Executado `track-results` e `audit-results` manualmente via `/debug/run-job/`
- Resultado: 61 success, 46 failure, 90 inicialmente falharam por falta de crédito OpenAI + modelo errado

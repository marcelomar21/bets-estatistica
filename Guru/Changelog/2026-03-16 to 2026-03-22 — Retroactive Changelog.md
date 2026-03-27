---
title: 2026-03-16 to 2026-03-22 — Retroactive Changelog
type: note
permalink: guru/changelog/2026-03-16-to-2026-03-22-retroactive-changelog
tags:
- changelog
- retroactive
---

# 2026-03-16 to 2026-03-22 — Retroactive Changelog

Entradas retroativas para PRs que nao foram registrados no vault na epoca.

## 16/Mar

- **#139** `feat(admin)`: Sidebar reorganizada em 3 modulos colapsiveis (Comunidade, Tipster, SuperAdmin) com drill-down
- **#140** `fix(analyses)`: Filtrar analises por league preferences do grupo em vez de apostas distribuidas
- **#141** `fix(bot)`: Coluna `generated_copy` (migration 055), sanitizacao Markdown Telegram via `telegramMarkdown.js`, persistir copy LLM no DB
- **#142** `fix(members)`: Usar service_role client para bot_pool em operacoes Telegram (cancel/reactivate/toggle-admin)
- **#143** `fix(onboarding)`: Conceder todas as permissoes admin ao bot no Telegram (changeInfo, addAdmins, anonymous, manageCall)
- **#147** `fix(members)`: Auto-ajustar status ao toggle admin (trial→ativo, ativo→trial)
- **#150** `fix(scheduler)`: Remover cron central de distribute-bets duplicado (4x execucoes), usar lock de concorrencia
- **#151** `fix(dashboard)`: Ignorar bot_health orfaos (group_id null), cleanup via migration. Fecha GURU-11
- **#152** `feat(notifications)`: Agrupar alertas repetidos com badge de contagem (5x), dedup window 1h→6h. Fecha GURU-7
- **#153** `refactor(dashboard)`: Consolidar 7 cards de performance em 1 compacto, remover bot stats
- **#154** `feat(dashboard)`: Ticker horizontal estilo bolsa para accuracy por grupo, filtrar grupos de teste

## 16/Mar (testes)

- **#156** `fix(tests)`: Atualizar testes do bot para subscriptionPrice numerico (migration 059)

## 18-19/Mar

- **#157** `fix(pipeline)`: Remover skip logic em syncSeasons.js que bloqueava fases eliminatorias (Champions, Europa League)
- **#158** `feat(pipeline)`: Adicionar Copa do Brasil ao sync diario (94 jogos, temporada 2026)

## 21/Mar

- **#159** `fix(bot)`: Converter kickoff times de UTC para BRT antes de exibir no Telegram

## 22/Mar

- **#163** `feat(agent)`: Calculator tool para LLM calcular estatisticas exatas. Consistency checker corrigido (usava lightModel, agora heavyModel). MAX_AGENT_STEPS 6→8

## Migrations incluidas
- **055**: `generated_copy` column (PR #141)
- **058**: Cleanup orphan bot_health (PR #151)
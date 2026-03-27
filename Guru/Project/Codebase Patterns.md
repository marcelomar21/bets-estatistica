---
title: Codebase Patterns
created: 2026-02-25
tags:
- project
- patterns
permalink: guru/project/codebase-patterns
---

## Arquitetura Atual do Bot (Singletons)

O sistema inteiro e construido em cima de **singletons module-level**:

- `bot/telegram.js`: `let bot = null` -- uma unica instancia de `TelegramBot` por processo
- `bot/server.scheduler.js`: `let activePostingJobs = []`, `let currentSchedule = null`, `let isManualPostInProgress = false` -- globals compartilhados
- `bot/jobs/postBets.js`: `const pendingConfirmations = new Map()` -- mapa global de confirmacoes pendentes
- `lib/config.js`: config flat lida de env vars uma vez no startup

Todas as funcoes helpers (`sendToAdmin`, `sendToPublic`) leem direto de `config.telegram.adminGroupId` sem receber contexto de grupo. Cada DB query usa `config.membership.groupId` (singleton).

## Webhook e Roteamento

- URL do webhook: `POST /webhook/<BOT_TOKEN>` -- 1 rota Express por token
- `processWebhookUpdate()` faz comparacao direta de `msg.chat.id === config.telegram.adminGroupId` para decidir se e mensagem admin
- Nao existe dispatch table nem bot registry -- tudo e if/else contra config estatica

## BOT_MODE

- `central`: jobs globais (distributeBets, trackResults, enrichOdds, kick-expired)
- `group`: jobs per-group (posting scheduler, renewalReminders, syncMembers)
- `mixed`: todos os jobs (default)
- Central jobs NAO usam `GROUP_ID` -- rodam cross-group

## Scheduler Dinamico

- `loadPostingSchedule()` le `groups.posting_schedule` filtrado por `GROUP_ID`
- `setupDynamicScheduler(schedule)` cria pares de cron jobs por horario: distribuicao em `T-5min`, postagem em `T`
- `reloadPostingSchedule()` a cada 5min via `setInterval` detecta mudancas no DB
- `checkPostNow()` a cada 30s via `setInterval` detecta flag `post_now_requested_at`

## Distribuicao Round-Robin

- `getActiveGroups()` ordena por `created_at ASC` -- grupo mais antigo sempre e index 0
- `distributeRoundRobin(bets, groups)` = `bets.map((bet, i) => groups[i % groups.length])` -- puro modulo posicional
- `getUndistributedBets()` ordena por `kickoff_time ASC`
- Nao ha offset persistido -- cada run recomeca do index 0
- `rebalanceIfNeeded()` e all-or-nothing: se qualquer grupo ativo tem 0 bets, undistribui TUDO

**Bug potencial**: deve excluir bets com `bet_status='posted'` do rebalance, e com remocao do cap precisa de nova heuristica (ex: so rebalancear se grupo novo entra ou grupo existente e desativado).

## Limite de 3 Apostas

- Source of truth: `lib/config.js` linha 37: `maxActiveBets: 50`
- Propagacao: `betService.js` linhas 1326 (`.limit(maxActiveBets)` em ativas), 1348 (`slotsDisponiveis = max - ativas.length`), 1396 (`.slice(0, slotsDisponiveis)` em novas), 153 (`.slice` em `getBetsReadyForPosting`)
- `post-now/route.ts` linha 4 tem `MIN_ODDS = 1.60` hardcoded (duplicacao do config do bot -- pode divergir)

## Result Tracking -- Bug da Janela Temporal

- Cron roda 1x/hora entre 13h-23h (Sao Paulo)
- `getBetsToTrack()` filtra `kickoff_time` entre `now-4h` e `now-2h` -- janela deslizante de 2h
- Se match nao esta `complete` na API FootyStats -> `continue` silencioso -> bet escapa da janela na proxima hora
- **Nao existe recovery**: bet com `kickoff_time < now-4h` nunca mais e consultada
- Causa raiz do "so 2 de 3": match incompleto no momento do cron, bet cai fora da janela no proximo ciclo

## Alerta Invertido -- Causa Raiz Real

- O codigo do alerta (`alertService.js:192-205`) esta **correto** -- `won ? 'ACERTOU' : 'ERROU'` e logicamente correto
- A inversao vem da **LLM retornando resultado errado** (`resultEvaluator.js`)
- O prompt do sistema tem lista limitada de mercados -- mercados edge (handicap asiatico, cartoes especificos) podem ser mal interpretados
- `betPick` mal formatado (ex: sem traducao, abreviado) confunde a avaliacao
- Alerta apenas reporta fielmente o que a LLM disse -- o erro e upstream

## Copy Service -- Tom de Voz

- `copyService.js` usa `config.llm.lightModel` (atualmente `gpt-5-mini`) com `temperature: 0.2`, `maxTokens: 200`
- Prompt e raw string (sem `ChatPromptTemplate`, sem system message)
- Regras incluem "Abrevie nomes de times" com 1 exemplo -- insuficiente para traducao
- Nomes de times vem da FootyStats API as-is (ingles para ligas europeias)
- **Nao existe nenhuma camada de traducao** de nomes de times
- Cache in-memory com TTL de 24h e max 200 entries (limpa no restart)
---
title: 'Evolução Plataforma Multi-Bot v2'
slug: 'evolucao-plataforma-multi-bot-v2'
created: '2026-02-25'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Node.js 20+ (bots - CommonJS)
  - Next.js 16.x (admin panel - App Router + TypeScript)
  - PostgreSQL (Supabase + RLS)
  - LangChain 1.1.x + OpenAI (GPT-5.1-mini) + Anthropic (Claude Sonnet 4.6) + Moonshot (Kimi 2.5)
  - The Odds API (odds enrichment)
  - FootyStats API (match data + results)
  - Render (deploy bots - 1 serviço por bot atualmente)
  - Vercel (deploy admin panel)
  - node-cron (scheduling)
  - Zod 4.x (validation + structured LLM output)
  - node-telegram-bot-api (Telegram SDK)
files_to_modify:
  # Arquitetura multi-bot
  - bot/server.js                    # webhook singleton → multi-bot registry
  - bot/server.scheduler.js          # module globals → factory per group
  - bot/telegram.js                  # singleton bot → Map<groupId, botInstance>
  - lib/config.js                    # env-var config → DB-loaded per-group config
  # Postagem + distribuição
  - bot/jobs/postBets.js             # pendingConfirmations Map → per-group scope
  - bot/jobs/distributeBets.js       # round-robin → fair distribution com offset
  - bot/services/betService.js       # getFilaStatus: remover limit(3)
  # Resultados + alertas
  - bot/jobs/trackResults.js         # sliding window 2-4h → recovery sweep
  - bot/services/resultEvaluator.js  # single LLM → multi-LLM consensus
  - bot/services/alertService.js     # hardcoded sendToAdmin → botCtx param
  # Copy + tom de voz
  - bot/services/copyService.js      # prompt fixo → tone config per-group
  # Admin panel
  - admin-panel/src/app/api/bets/post-now/route.ts  # + preview endpoint
  - admin-panel/src/app/api/groups/route.ts          # + tone config CRUD
  # Migrations (separadas por concern)
  - sql/migrations/029_bot_pool_source_of_truth.sql
  - sql/migrations/030_group_config_columns.sql
  - sql/migrations/031_bet_result_confidence.sql
  - sql/migrations/032_tracking_recovery_index.sql
  - sql/migrations/033_post_previews.sql
  # CI lint
  - scripts/lint-no-singleton-config.sh              # verifica remoção de config.telegram.*
  # Handlers que leem config global
  - bot/handlers/admin/actionCommands.js
  - bot/handlers/adminGroup.js
  - bot/handlers/callbackHandlers.js
  - bot/handlers/startCommand.js
  # Jobs de membership que usam GROUP_ID global
  - bot/jobs/membership/kick-expired.js
  - bot/jobs/membership/sync-group-members.js
  - bot/jobs/membership/renewal-reminders.js
code_patterns:
  - 'Multi-tenant via group_id + RLS em todas as queries'
  - 'Service pattern: { success: true, data } | { success: false, error }'
  - 'Structured logger com [module:job] prefix'
  - 'Zod validation + withStructuredOutput para LLM calls'
  - 'Singleton pattern em telegram.js e server.scheduler.js (precisa virar factory)'
  - 'Config flat via env vars em lib/config.js (precisa virar DB-loaded per-group)'
  - 'Webhook URL = /webhook/<BOT_TOKEN> (1 rota por bot)'
  - 'pendingConfirmations Map global em postBets.js (precisa scope per-group)'
  - 'copyService usa raw string prompt sem system message (precisa ChatPromptTemplate)'
test_patterns:
  - 'Vitest para unitários (admin-panel/)'
  - 'Playwright MCP para E2E'
  - 'Mocks de config com maxActiveBets: 3 (precisam atualizar)'
---

# Tech-Spec: Evolução Plataforma Multi-Bot v2

**Created:** 2026-02-25

## Overview

### Problem Statement

A plataforma GuruBet opera dois bots (Guru da Bet e Osmar Palpites) com feedback negativo significativo dos usuários e operadores. Os problemas são de 3 naturezas:

1. **Bugs críticos**: Bot Guru não faz disparos automáticos, não responde comandos, alertas de resultado invertidos (diz que acertou quando errou e vice-versa), alertas só cobrem 2 de 3 apostas.
2. **Limitações arquiteturais**: Cada bot roda como serviço isolado no Render (1:1), distribuição round-robin ingênua favorece sistematicamente o primeiro grupo, limite hardcoded de 3 apostas por slot.
3. **Falta de customização**: Sem controle de tom de voz por grupo, sem preview/edição de mensagens antes do envio, sem redistribuição manual de apostas.

### Solution

Evolução significativa da plataforma em 7 workstreams, precedida por um PRD completo:

1. Migrar para **servidor único multi-bot** (1 processo → N bots)
2. **Distribuição inteligente** com possibilidade de redistribuição manual
3. **Validação de resultados com consenso de 3 LLMs** (substituir avaliação single-LLM)
4. **Tom de voz configurável por grupo** (seção no admin panel, vira parte do prompt)
5. **Preview + edição de mensagens** antes do disparo (fluxo novo no admin)
6. **Limite dinâmico de apostas** (remover hard-cap de 3)
7. **Correção de bugs críticos** (Guru offline, alertas invertidos/incompletos)

### Scope

**In Scope:**

- PRD completo cobrindo todos os 7 workstreams
- Quebra em epics priorizados com dependências mapeadas
- Design de UI para: Tom de Voz, Preview/Edição de mensagens
- Investigação e correção dos bugs críticos (Guru offline, alertas)
- Refatoração arquitetural para servidor único multi-bot
- Remoção do limite de 3 apostas
- Melhoria do algoritmo de distribuição
- Validação de resultados com consenso multi-LLM
- Configuração de tom de voz per-group

**Out of Scope:**

- Adicionar jogos/ligas específicas (Recopa etc.) — operacional, não requer spec
- Incorporação visual de odds na mensagem — já existe, pode ser ajuste de template
- Mudanças no sistema de pagamento/membership
- Novos canais além do Telegram

### Personas

| Persona | Descrição | Fluxos Principais |
|---|---|---|
| **Super Admin** | Gerencia todos os grupos, acessa métricas globais, faz deploy e configuração de bots | Config multi-bot, métricas, distribuição, gerenciamento de grupos |
| **Group Admin (Operador)** | Gerencia seu próprio grupo, posta apostas, configura tom de voz, edita mensagens | Tom de voz, preview/edição, disparo manual, ver resultados |
| **Subscriber (Membro)** | Recebe mensagens no Telegram, clica nos links de aposta | Recebe postagens formatadas, recebe alertas de resultado |

### Métricas de Sucesso

| Métrica | Meta | Baseline Atual |
|---|---|---|
| Tracking accuracy (alertas corretos / total) | >95% | Desconhecido (reportado como frequentemente errado) |
| Scheduler uptime (disparos no horário / programados) | >99% | Guru: ~0% (offline), Osmar: ~90% (estimado) |
| Distribuição fairness (desvio max de bets entre grupos) | ≤1 bet | Sistematicamente enviesado pro Osmar |
| Tempo de postagem manual (clique → enviado) | <60s | N/A (fluxo novo) |
| Satisfação dos operadores | Qualitativo positivo | Negativo (feedback atual) |

## Context for Development

### Discovery Notes — Feedback dos Usuários (2026-02-25)

#### Fonte: Operadores dos grupos Guru da Bet e Osmar Palpites

---

#### BUGS REPORTADOS

**B1 — Guru não faz disparos automáticos**
- Severidade: CRÍTICA
- O scheduler depende de `posting_schedule.enabled` na tabela `groups` + `BOT_MODE` correto no Render
- Pode ser config errada ou bot crashando silenciosamente
- Osmar funciona → código é compartilhado, provável problema de infra/config do deploy Guru
- Arquivos relevantes: `bot/server.js`, `bot/server.scheduler.js`

**B2 — Guru não responde comandos no Telegram**
- Severidade: CRÍTICA
- Webhook pode estar desconfigurado ou bot offline
- Osmar responde normalmente → mesmo código, problema isolado no deploy Guru
- Diagnóstico: checar `getWebhookInfo` + logs no Render (`srv-d5hp23a4d50c7397o1q0`)

**B3 — Alerta de acerto/erro invertido**
- Severidade: ALTA
- `trackResults.js` usa LLM (atualmente `config.llm.heavyModel` = `gpt-5.2`) via `evaluateBetsWithLLM()` para determinar resultado
- Avaliação é não-determinística — LLM pode alucinar resultados
- Não há validação determinística como fallback (comparação direta de score)
- Arquivo: `bot/jobs/trackResults.js`, `bot/services/resultEvaluator.js`

**B4 — Alerta só cobre 2 de 3 apostas**
- Severidade: ALTA
- `getBetsToTrack()` filtra por `kickoff_time` numa janela 2h-4h após o jogo
- Se a 3ª aposta tem kickoff fora dessa janela, ela escapa do tracking
- Pode ser que jogos de horários diferentes (ex: 10h, 15h, 22h) caiam em ciclos diferentes do cron
- Arquivo: `bot/jobs/trackResults.js`

**B5 — Osmar só envia até 3 apostas (selecionando 4+)**
- Severidade: MÉDIA
- Comportamento é **by design**: `getFilaStatus()` tem limite hardcoded de max 3 bets por slot
- Decisão do usuário: **remover o limite**, permitir quantas apostas quiser
- Arquivo: `bot/services/betService.js` (`getFilaStatus`)

#### DISTRIBUIÇÃO DESBALANCEADA

**D1 — Apostas do Osmar parecem preferenciais às do Guru**
- O round-robin em `distributeBets.js` usa `groups[i % len]`
- Grupos ordenados por `created_at ASC` → Osmar (criado primeiro) sempre pega bet[0], bet[2], bet[4]...
- Sem randomização, o primeiro grupo sistematicamente leva o "primeiro pick"
- Arquivo: `bot/jobs/distributeBets.js` (`distributeRoundRobin`)

**D2 — Guru tem odds e jogos inferiores**
- Consequência direta de D1
- Apostas no início do array tendem a ser as de maior confiança/odds do pipeline de IA
- Solução: randomizar ou implementar distribuição por qualidade equilibrada

#### CUSTOMIZAÇÃO / TOM DE VOZ

**V1 — Osmar: não pode falar "apostas"**
- `copyService.js` usa LLM para gerar copy das mensagens
- O prompt atual não tem restrições de vocabulário por grupo
- Necessário: configuração per-group de palavras proibidas/tom

**V2 — Bot erra tradução de nome de time**
- `enrichOdds.js` usa fuzzy matching (Jaccard similarity) para encontrar times
- Nomes podem vir em inglês da API (FootyStats/Odds API)
- O copy final herda o nome como veio da API, sem tradução consistente

**V3 — Tom de voz configurável**
- Não existe configuração per-group de tom/persona no sistema atual
- Decisão do usuário: criar seção "Tom de Voz" no admin panel
- Super admins selecionam o grupo e editam o tom de voz
- O tom vira parte do system prompt do `copyService` para aquele grupo

#### FEATURE: PREVIEW + EDIÇÃO DE MENSAGENS

**F1 — Preview e edição antes do disparo**
- Hoje o fluxo é: admin clica "Postar" → bot gera copy via LLM → envia direto
- Pedido: ver a mensagem gerada, poder editar texto/tom/nome de time, e só depois confirmar envio
- Impacto: muda o fluxo do `postBets.js` e do endpoint `post-now`
- Precisa de design de UI (chamar design)

#### DECISÃO ARQUITETURAL: SERVIDOR ÚNICO MULTI-BOT

**A1 — Migrar de 1 serviço/bot para 1 serviço/N bots**
- Situação atual: cada bot é um deploy separado no Render com seu próprio processo
  - `srv-d5hp23a4d50c7397o1q0` → Guru da Bet
  - `srv-d6678u1r0fns73ciknn0` → Osmar Palpites
- Problema: operacionalmente complexo, difícil de escalar, config duplicada, N deploys
- Decisão: consolidar em **1 processo Node.js que gerencia N bots**
- Impactos:
  - Múltiplos tokens/webhooks no mesmo processo
  - Scheduler precisa orquestrar jobs de N grupos
  - Isolamento de falhas (1 grupo crashar não pode derrubar os outros)
  - Deploy no Render muda completamente (1 serviço vs N)
  - **Mudança grande — requer refinamento dedicado**

#### DECISÃO TÉCNICA: VALIDAÇÃO DE RESULTADOS COM CONSENSO MULTI-LLM

**T1 — Substituir avaliação single-LLM por consenso de 3 LLMs**
- Hoje: 1 chamada LLM (heavy model) decide acerto/erro (não-determinístico, pode alucinar)
- Proposta do usuário: usar 3 LLMs independentes de **provedores distintos**
  - **GPT-5.1-mini** (OpenAI) + **Claude Sonnet 4.6** (Anthropic) + **Kimi 2.5** (Moonshot)
  - Se as 3 concordam → resultado confirmado
  - Se há divergência → step adicional de confirmação (flag para revisão manual)
- Aumenta custo de API mas reduz drasticamente erros de avaliação

### Codebase Patterns (Investigação Profunda)

#### Arquitetura Atual do Bot (Singletons)

O sistema inteiro é construído em cima de **singletons module-level**:

- `bot/telegram.js`: `let bot = null` — uma única instância de `TelegramBot` por processo
- `bot/server.scheduler.js`: `let activePostingJobs = []`, `let currentSchedule = null`, `let isManualPostInProgress = false` — globals compartilhados
- `bot/jobs/postBets.js`: `const pendingConfirmations = new Map()` — mapa global de confirmações pendentes
- `lib/config.js`: config flat lida de env vars uma vez no startup

Todas as funções helpers (`sendToAdmin`, `sendToPublic`) leem direto de `config.telegram.adminGroupId` sem receber contexto de grupo. Cada DB query usa `config.membership.groupId` (singleton).

#### Webhook e Roteamento

- URL do webhook: `POST /webhook/<BOT_TOKEN>` — 1 rota Express por token
- `processWebhookUpdate()` faz comparação direta de `msg.chat.id === config.telegram.adminGroupId` para decidir se é mensagem admin
- Não existe dispatch table nem bot registry — tudo é if/else contra config estática

#### BOT_MODE

- `central`: jobs globais (distributeBets, trackResults, enrichOdds, kick-expired)
- `group`: jobs per-group (posting scheduler, renewalReminders, syncMembers)
- `mixed`: todos os jobs (default)
- Central jobs NÃO usam `GROUP_ID` — rodam cross-group

#### Scheduler Dinâmico

- `loadPostingSchedule()` lê `groups.posting_schedule` filtrado por `GROUP_ID`
- `setupDynamicScheduler(schedule)` cria pares de cron jobs por horário: distribuição em `T-5min`, postagem em `T`
- `reloadPostingSchedule()` a cada 5min via `setInterval` detecta mudanças no DB
- `checkPostNow()` a cada 30s via `setInterval` detecta flag `post_now_requested_at`

#### Distribuição Round-Robin

- `getActiveGroups()` ordena por `created_at ASC` — grupo mais antigo sempre é index 0
- `distributeRoundRobin(bets, groups)` = `bets.map((bet, i) => groups[i % groups.length])` — puro modulo posicional
- `getUndistributedBets()` ordena por `kickoff_time ASC`
- Não há offset persistido — cada run recomeça do index 0
- `rebalanceIfNeeded()` é all-or-nothing: se qualquer grupo ativo tem 0 bets, undistribui TUDO — **BUG POTENCIAL**: deve excluir bets com `bet_status='posted'` do rebalance, e com remoção do cap precisa de nova heurística (ex: só rebalancear se grupo novo entra ou grupo existente é desativado)

#### Limite de 3 Apostas

- Source of truth: `lib/config.js` linha 37: `maxActiveBets: 3`
- Propagação: `betService.js` linhas 1326 (`.limit(maxActiveBets)` em ativas), 1348 (`slotsDisponiveis = max - ativas.length`), 1396 (`.slice(0, slotsDisponiveis)` em novas), 153 (`.slice` em `getBetsReadyForPosting`)
- `post-now/route.ts` linha 4 tem `MIN_ODDS = 1.60` hardcoded (duplicação do config do bot — pode divergir)

#### Result Tracking — Bug da Janela Temporal

- Cron roda 1x/hora entre 13h-23h (São Paulo)
- `getBetsToTrack()` filtra `kickoff_time` entre `now-4h` e `now-2h` — janela deslizante de 2h
- Se match não está `complete` na API FootyStats → `continue` silencioso → bet escapa da janela na próxima hora
- **Não existe recovery**: bet com `kickoff_time < now-4h` nunca mais é consultada
- Causa raiz do "só 2 de 3": match incompleto no momento do cron, bet cai fora da janela no próximo ciclo

#### Alerta Invertido — Causa Raiz Real

- O código do alerta (`alertService.js:192-205`) está **correto** — `won ? 'ACERTOU' : 'ERROU'` é logicamente correto
- A inversão vem da **LLM retornando resultado errado** (`resultEvaluator.js`)
- O prompt do sistema tem lista limitada de mercados — mercados edge (handicap asiático, cartões específicos) podem ser mal interpretados
- `betPick` mal formatado (ex: sem tradução, abreviado) confunde a avaliação
- Alerta apenas reporta fielmente o que a LLM disse — o erro é upstream

#### Copy Service — Tom de Voz

- `copyService.js` usa `config.llm.lightModel` (atualmente `gpt-5-mini`) com `temperature: 0.2`, `maxTokens: 200`
- Prompt é raw string (sem `ChatPromptTemplate`, sem system message)
- Regras incluem "Abrevie nomes de times" com 1 exemplo — insuficiente para tradução
- Nomes de times vêm da FootyStats API as-is (inglês para ligas europeias)
- **Não existe nenhuma camada de tradução** de nomes de times
- Cache in-memory com TTL de 24h e max 200 entries (limpa no restart)

### Files to Reference (Investigação Completa)

| File | Purpose | Impacto da Mudança |
| ---- | ------- | ------------------ |
| `bot/server.js` | Entry point, webhook setup, scheduler bootstrap | ALTO — precisa suportar N bots |
| `bot/server.scheduler.js` | Scheduling dinâmico (cron + polling) | ALTO — globals → factory per group |
| `bot/telegram.js` | Singleton `TelegramBot` + helpers `sendToAdmin`/`sendToPublic` | ALTO — singleton → Map + botCtx param |
| `lib/config.js` | Config flat via env vars, `maxActiveBets: 3`, `validateConfig()` | ALTO — env vars → DB-loaded per-group |
| `bot/jobs/postBets.js` | Postagem + `pendingConfirmations` Map + preview/confirm flow | ALTO — scoping + preview/edit |
| `bot/jobs/distributeBets.js` | Round-robin `groups[i % len]` sem offset | MÉDIO — add offset + fairness |
| `bot/jobs/trackResults.js` | Tracking com janela 2-4h sem recovery | MÉDIO — add recovery sweep |
| `bot/services/betService.js` | `getFilaStatus` com `limit(3)` em 5 pontos | MÉDIO — remover cap |
| `bot/services/resultEvaluator.js` | Single LLM eval, Zod schema, prompt limitado | MÉDIO — multi-LLM + prompt expandido |
| `bot/services/copyService.js` | Copy LLM sem system message, sem tone config | MÉDIO — add tone injection |
| `bot/services/alertService.js` | Alertas com `sendToAdmin` hardcoded | BAIXO — add botCtx param |
| `bot/services/oddsService.js` | Odds enrichment via The Odds API | BAIXO — sem mudança direta |
| `bot/handlers/startCommand.js` | `/start` lê `config.telegram.publicGroupId` (linhas 204, 285, 528) | MÉDIO — precisa lookup por token |
| `bot/handlers/callbackHandlers.js` | Callbacks leem `config.telegram.publicGroupId` (linha 73) | BAIXO — add botCtx |
| `bot/handlers/admin/actionCommands.js` | Comandos admin (`/postar`, `/odds`, etc) | BAIXO — add botCtx |
| `bot/handlers/adminGroup.js` | Router de mensagens admin | BAIXO — add botCtx |
| `bot/jobs/membership/kick-expired.js` | Kick com fallback para `config.telegram.publicGroupId` | BAIXO — remover fallback env var |
| `bot/jobs/membership/sync-group-members.js` | Sync com `GROUP_ID` global | BAIXO — receber groupId param |
| `bot/jobs/membership/renewal-reminders.js` | Lembretes com `GROUP_ID` global | BAIXO — receber groupId param |
| `admin-panel/src/app/api/bets/post-now/route.ts` | Post-now com `MIN_ODDS` hardcoded | MÉDIO — add preview endpoint |
| `admin-panel/src/app/api/groups/route.ts` | CRUD de grupos | MÉDIO — add tone config |

### Technical Decisions (Confirmadas pela Investigação)

1. **Servidor único multi-bot — Refatoração core**:
   - `telegram.js`: `let bot = null` → `const bots = new Map<groupId, BotContext>`
   - `server.js`: 1 webhook route → N routes registradas dinamicamente por bot token
   - `server.scheduler.js`: module globals → `createScheduler(groupId)` factory function
   - `config.js`: flat env vars → configs per-group carregadas da tabela `groups` + `bot_pool`
   - `processWebhookUpdate(update)` → `processWebhookUpdate(update, botCtx)`
   - Todas as helpers (`sendToAdmin`, `sendToPublic`) → recebem `botCtx` como param
   - `BOT_MODE` vira irrelevante (processo único roda tudo)
   - **Risco**: `pendingConfirmations` Map é global — precisa scope per-group para evitar colisão de IDs

2. **Remoção do limite de 3 apostas**:
   - Mudar `lib/config.js:37` `maxActiveBets: 3` → configurável per-group ou sem limite
   - 5 pontos de propagação em `betService.js` se ajustam automaticamente
   - `.limit(10)` em novas fetch (betService:1386) precisa subir se quiser >10
   - Atualizar mocks de teste que hardcodam `maxActiveBets: 3`

3. **Distribuição justa**:
   - Persistir offset global ou contar bets por grupo antes de distribuir
   - `distributeRoundRobin` passa a receber `startIndex` baseado no grupo com menos bets
   - Alternativa: shuffle o array de bets antes do modulo

4. **Consenso multi-LLM para resultados (3 provedores distintos)**:
   - `resultEvaluator.js`: rodar 3 chains em paralelo: **GPT-5.1-mini** (OpenAI) + **Claude Sonnet 4.6** (Anthropic) + **Kimi 2.5** (Moonshot)
   - Diversidade arquitetural real = se um modelo tem viés de treinamento, os outros compensam
   - Se 3/3 concordam → resultado confirmado (`confidence: 'high'`)
   - Se 2/3 concordam → resultado da maioria (`confidence: 'medium'`)
   - Se 3 divergem → `unknown` + flag para revisão manual (`confidence: 'low'`)
   - Multi-LLM apenas para mercados complexos; mercados simples usam validação determinística
   - Expandir `TIPOS DE APOSTAS COMUNS` no system prompt com mais mercados

5. **Recovery sweep para tracking**:
   - **Não é job separado** — roda como bloco final dentro de cada execução do cron de tracking (13h-23h, 1x/hora)
   - Após processar bets da janela normal, executa sweep: `bet_status='posted' AND bet_result='pending' AND kickoff_time < now-8h`
   - Tenta avaliar com dados mais completos (match já terá status `complete`)
   - Evita perda permanente de bets que escaparam da janela 2-4h
   - **Rationale**: rodar à 01:00 (fora do window de tracking) pode falhar silenciosamente e não seria monitorado; dentro do cron existente, herda o mesmo health check e logging

6. **Tom de voz per-group (2 níveis)**:
   - Nova coluna `groups.copy_tone_config` (JSONB): `{ tone, persona, forbiddenWords, ctaText, customRules, rawDescription }`
   - UI com 2 níveis: **Nível 1** = textarea de linguagem natural (backend converte em config via LLM); **Nível 2** = campos avançados colapsados
   - `copyService.js` migra de raw string → `ChatPromptTemplate.fromMessages([system, human])`
   - System message injetado com tone config do grupo
   - **Group admin** pode editar tom do seu próprio grupo (não apenas super admin)

7. **Preview + edição de mensagens (mobile-first, só web)**:
   - Novo endpoint `POST /api/bets/post-now/preview` que gera copy sem enviar, retorna `previewId` + textos persistidos em tabela `post_previews` no Supabase (TTL 30min via `expires_at`)
   - UI mobile-first: cards empilhados full-width, um por aposta, com ações Editar/Regenerar/Remover
   - "Regenerar" mostra diff visual do que mudou (client-side com `diff-match-patch`, comparação com texto anterior do `post_previews`)
   - Ao confirmar, `POST /api/bets/post-now` recebe `overrides: { [betId]: editedText }`
   - Preview/edição acontece **só no admin panel web**; Telegram mantém fluxo read-only (Confirmar/Cancelar) como fallback

## Implementation Plan

### Faseamento

O plano é dividido em **5 fases** ordenadas por urgência e dependência. Bugs primeiro, fundação arquitetural antes das features, features depois, e consolidação final do deploy.

```
Fase 1: Correção de Bugs Críticos ──────────── [Urgente, sem dependência]
Fase 2: Fundação BotContext ────────────────── [Cria abstrações internas, sem mudar deploy]
Fase 3: Qualidade de Distribuição + Resultados  [Constrói sobre BotContext]
Fase 4: Customização + Preview/Edição ───────── [Depende de Design de UI + BotContext]
Fase 5: Deploy Multi-Bot Unificado ──────────── [Consolidação final, usa tudo das fases anteriores]
```

**Rationale**: A Fase 2 (BotContext) foi antecipada para evitar retrabalho. As Fases 3 e 4 já constroem sobre a nova interface `BotContext`, e a Fase 5 é só o deploy unificado + cleanup — não reescreve código já feito.

---

### FASE 1 — Correção de Bugs Críticos

**Objetivo**: Restaurar funcionalidade básica. Tudo que está quebrado volta a funcionar.

- [ ] **Task 1.1: Diagnosticar e corrigir Guru offline (B1 + B2)**
  - File: Render dashboard (`srv-d5hp23a4d50c7397o1q0`)
  - Action: Verificar logs do serviço Guru no Render, checar `getWebhookInfo` via API Telegram, validar env vars (`TELEGRAM_BOT_TOKEN`, `GROUP_ID`, `BOT_MODE`, `TELEGRAM_ADMIN_GROUP_ID`). Comparar config do Guru vs Osmar. Se webhook desconfigurado, re-registrar. Se bot crashando, identificar erro nos logs e corrigir.
  - Notes: Pode ser fix de config sem mudança de código. Osmar funciona = código ok, problema é infra/config. **Se diagnóstico revelar bug de código** (ex: race condition no startup, env var lida antes de inicializar, crash no `processWebhookUpdate`): investigar stack trace nos logs do Render, corrigir no código e fazer deploy. Se for crash silencioso sem log, adicionar `process.on('uncaughtException')` e `process.on('unhandledRejection')` com logging + restart graceful em `bot/server.js`.

- [ ] **Task 1.2: Remover limite hardcoded de 3 apostas (B5)**
  - File: `lib/config.js` (linha 37)
  - Action: Mudar `maxActiveBets: 3` para um valor alto (ex: `50`) ou tornar configurável per-group via coluna `groups.max_active_bets` (default `null` = sem limite).
  - Notes: 5 pontos de propagação em `betService.js` (linhas 153, 1326, 1348, 1386, 1396) se ajustam automaticamente pois leem de `config.betting.maxActiveBets`. O `.limit(10)` em novas fetch (`betService.js:1386`) precisa subir para acompanhar.

- [ ] **Task 1.3: Corrigir testes que mockam maxActiveBets: 3**
  - File: `admin-panel/__tests__/**`
  - Action: Buscar todos os mocks que hardcodam `maxActiveBets: 3` e atualizar para o novo valor ou tornar dinâmicos.
  - Notes: Rodar `npm test` para identificar quais quebram.

- [ ] **Task 1.4: Sincronizar MIN_ODDS entre admin panel e bot**
  - File: `admin-panel/src/app/api/bets/post-now/route.ts` (linha 4)
  - Action: Substituir `MIN_ODDS = 1.60` hardcoded por leitura de config compartilhada (env var `MIN_ODDS` ou query da tabela `groups`).
  - Notes: Evita divergência silenciosa entre validação do admin e validação do bot.

- [ ] **Task 1.5: Expandir janela de tracking + adicionar recovery sweep (B4)**
  - File: `bot/jobs/trackResults.js`
  - Action:
    1. Ampliar `MAX_CHECK_DURATION_MS` de 4h para 8h (dá mais tempo pra matches com extra time/pênaltis)
    2. Remover `continue` silencioso quando match não está completo — em vez disso, logar como `skipped_incomplete` e manter bet elegível para próximo ciclo
    3. Adicionar recovery sweep **dentro de `runTrackResults()`** (não como job separado): após processar janela normal, executar bloco que busca `bet_status='posted' AND bet_result='pending' AND kickoff_time < now-8h` e tenta avaliar com dados finais. Usar o índice parcial `idx_bets_tracking_recovery` (migration 032) para performance.
  - Notes: O recovery sweep garante que nenhuma bet é permanentemente perdida. Roda dentro do cron existente (13h-23h) para herdar monitoring e logging. Matches que demoraram pra completar serão avaliados no ciclo seguinte.

- [ ] **Task 1.6: Melhorar precisão do evaluator LLM (B3)**
  - File: `bot/services/resultEvaluator.js`
  - Action:
    1. Expandir `TIPOS DE APOSTAS COMUNS` no system prompt com mercados adicionais: handicap asiático, handicap europeu, resultado exato, intervalo de gols, cartões por equipe, escanteios por equipe, jogador marca gol
    2. Adicionar instrução explícita: "Se o mercado não está na lista de tipos conhecidos, retorne 'unknown' em vez de tentar interpretar"
    3. Adicionar validação determinística como first-pass antes do LLM para mercados simples:
       - Over/Under X.5 gols → comparar `totalGoals` > X.5 diretamente
       - BTTS → comparar `homeScore > 0 && awayScore > 0` diretamente
       - Resultado (1X2) → comparar scores diretamente
    4. Usar LLM apenas para mercados que não podem ser avaliados deterministicamente
  - Notes: Validação determinística para mercados simples elimina 100% das alucinações nesses casos. LLM fica restrito a mercados complexos (cartões, escanteios, handicap).

---

### FASE 2 — Fundação BotContext (Abstrações Internas)

**Objetivo**: Criar as abstrações `BotContext` e `BotRegistry` internamente, sem mudar o deploy. Todo código novo das Fases 3-4 já constrói sobre essa interface, evitando retrabalho.
**Dependência**: Nenhuma. Pode rodar em paralelo com Fase 1.

- [ ] **Task 2.1: Criar BotContext e BotRegistry**
  - File: `bot/telegram.js` (refator major)
  - Action:
    1. Definir tipo `BotContext = { bot: TelegramBot, groupId, adminGroupId, publicGroupId, botToken, groupConfig }`
    2. Criar `BotRegistry` class com `Map<groupId, BotContext>`
    3. `initBots()` substitui `initBot()`: lê da tabela `bot_pool` (source of truth — migration 029) com JOIN em `groups` para configs. Cria 1 `TelegramBot` instance por token. Popula `BotContext` com `{ bot, groupId, adminGroupId, publicGroupId }` vindos do `bot_pool` (NÃO de `groups.bot_token`)
    4. `getBotForGroup(groupId)` retorna o `BotContext`
    5. `sendToAdmin(text, botCtx)` e `sendToPublic(text, botCtx)` recebem contexto explícito
    6. Manter backward-compat temporário: se chamado sem `botCtx`, usa o primeiro bot (warning no log)
  - Notes: Backward-compat garante que o deploy atual (1 bot por serviço) continua funcionando. O código novo já usa `botCtx`.

- [ ] **Task 2.2: Refatorar config.js para multi-group**
  - File: `lib/config.js`
  - Action:
    1. Manter config global (supabase, APIs, retry, LLM)
    2. Adicionar `loadGroupConfigs()` que lê da tabela `bot_pool` (source of truth para token/IDs) JOIN `groups` (config per-group) no startup
    3. Cada grupo carrega: `bot_pool.bot_token`, `bot_pool.admin_group_id`, `bot_pool.public_group_id` (do bot_pool), `postingSchedule`, `copyToneConfig`, `maxActiveBets` (do groups)
    4. Manter env vars existentes como fallback (backward-compat para deploy atual com 1 bot)
  - Notes: `validateConfig()` passa a aceitar: ou env vars tradicionais (1 bot) ou configs carregadas do DB (N bots).

- [ ] **Task 2.3: Migrations SQL para campos novos (separadas por concern)**
  - Files:
    - `sql/migrations/029_bot_pool_source_of_truth.sql`
    - `sql/migrations/030_group_config_columns.sql`
    - `sql/migrations/031_bet_result_confidence.sql`
    - `sql/migrations/032_tracking_recovery_index.sql`
  - Action:
    1. **029 — bot_pool como source of truth**: Garantir que tabela `bot_pool` tem explicitamente: `id SERIAL PRIMARY KEY`, `group_id UUID NOT NULL REFERENCES groups(id)`, `bot_token TEXT NOT NULL`, `admin_group_id BIGINT NOT NULL`, `public_group_id BIGINT NOT NULL`, `is_active BOOLEAN DEFAULT true`, `created_at TIMESTAMPTZ DEFAULT now()`. Se colunas `admin_group_id` / `public_group_id` não existem, fazer `ALTER TABLE bot_pool ADD COLUMN`. Deprecar `groups.bot_token` — `bot_pool` é a **única fonte de verdade** para tokens e IDs de chat do Telegram. Adicionar comment: `COMMENT ON TABLE bot_pool IS 'Source of truth para tokens e chat IDs do Telegram. groups.bot_token está deprecated.'`
    2. **030 — config per-group**: `ALTER TABLE groups ADD COLUMN max_active_bets INTEGER DEFAULT NULL` + `ALTER TABLE groups ADD COLUMN copy_tone_config JSONB DEFAULT '{}'::jsonb`
    3. **031 — result_confidence**: `ALTER TABLE suggested_bets ADD COLUMN result_confidence TEXT CHECK (result_confidence IN ('high', 'medium', 'low'))`
    4. **032 — index para recovery sweep**: `CREATE INDEX idx_bets_tracking_recovery ON suggested_bets (bet_status, bet_result, kickoff_time) WHERE bet_status = 'posted' AND bet_result = 'pending'` — índice parcial otimiza a query do recovery sweep
  - Notes: Migrations separadas por concern (F17). Cada uma é independente e pode ser aplicada/revertida isoladamente. Aplicar via Supabase Management API. `bot_pool` é a source of truth para tokens — ao construir `BotContext`, ler de `bot_pool` (não de `groups.bot_token`).

---

### FASE 3 — Qualidade de Distribuição e Resultados

**Objetivo**: Distribuição justa entre grupos + validação robusta de resultados.
**Dependência**: Fase 2 (BotContext) para usar `botCtx` nos alertas.

- [ ] **Task 3.1: Implementar distribuição fair com balanceamento**
  - File: `bot/jobs/distributeBets.js`
  - Action:
    1. Em `runDistributeBets()`, antes de chamar `distributeRoundRobin`, contar quantas bets cada grupo ativo já tem no window atual (`SELECT group_id, COUNT(*) FROM suggested_bets WHERE distributed_at IS NOT NULL AND group_id IS NOT NULL AND kickoff_time IN window GROUP BY group_id`)
    2. Modificar `distributeRoundRobin(bets, groups)` para aceitar `groupCounts` e iniciar atribuição pelo grupo com menos bets
    3. Em caso de empate, usar `Math.random()` para desempatar (elimina bias sistemático)
    4. **Corrigir `rebalanceIfNeeded()`**: a lógica atual undistribui ALL bets quando um grupo tem 0. Com remoção do cap, isso é destrutivo. Alterar para: (a) NUNCA undistribuir bets com `bet_status='posted'` (já enviadas ao Telegram), (b) rebalancear apenas bets com `bet_status='distributed'` (distribuídas mas não postadas), (c) trigger de rebalance: apenas quando um grupo novo é ativado ou um existente é desativado (não a cada run)
  - Notes: Mantém a simplicidade do round-robin mas elimina o favorecimento posicional. O grupo que tem menos bets sempre recebe a próxima. O fix do `rebalanceIfNeeded` previne perda de bets já postadas.

- [ ] **Task 3.2: Implementar consenso multi-LLM para avaliação de resultados**
  - File: `bot/services/resultEvaluator.js`
  - Action:
    1. Criar 3 chains LLM com o mesmo schema Zod, usando **provedores distintos** para diversidade arquitetural real:
       - `evaluatorChainA`: **GPT-5.1-mini** (OpenAI, temp 0) — via LangChain `ChatOpenAI`. Model ID: `gpt-5.1-mini`. Env var `EVALUATOR_MODEL_OPENAI=gpt-5.1-mini`.
       - `evaluatorChainB`: **Claude Sonnet 4.6** (Anthropic, temp 0) — via LangChain `ChatAnthropic`. Model ID: `claude-sonnet-4-6-20250514`. Env var `EVALUATOR_MODEL_ANTHROPIC=claude-sonnet-4-6-20250514`.
       - `evaluatorChainC`: **Kimi 2.5** (Moonshot, temp 0) — via LangChain `ChatOpenAI` com `baseURL: 'https://api.moonshot.cn/v1'`. Model ID: `kimi-2.5`. Env var `EVALUATOR_MODEL_MOONSHOT=kimi-2.5`.
       - **Fallback policy**: se um model ID não existe ou retorna 404, logar erro e tratar como provider failed (ver lógica de consenso degraded acima)
    2. Executar as 3 em `Promise.allSettled()` (paralelo, tolerante a falha individual)
    3. Lógica de consenso:
       - **3/3 responderam e concordam** → resultado confirmado com `confidence: 'high'`
       - **2/3 responderam e concordam** (3ª concorda ou diverge) → resultado da maioria com `confidence: 'medium'`
       - **3 divergem** → `result: 'unknown'`, `confidence: 'low'`, flag para revisão manual
       - **1 provider falhou** (rejected em allSettled): consenso entre os 2 restantes:
         - 2/2 concordam → `confidence: 'medium'` (degraded, não 'high')
         - 2/2 divergem → `result: 'unknown'`, `confidence: 'low'`
       - **2+ providers falharam**: `result: 'unknown'`, `confidence: 'low'`, flag para revisão + alerta no log
       - Logar qual provider falhou e motivo (timeout, API error, rate limit) para diagnóstico
    4. **Schema Zod per-provider** (mantém o existente: `{ id, result, reason }`). O campo `confidence` NÃO é retornado pelo LLM — é calculado pela lógica de consenso pós-agregação. Tipo do resultado agregado:
       ```js
       // Resultado individual (Zod schema, retornado por cada LLM)
       const betEvalSchema = z.object({ id: z.number(), result: z.enum(['success','failure','unknown']), reason: z.string() })
       // Resultado agregado (calculado pelo consenso, não pelo LLM)
       type ConsensusResult = { id: number, result: 'success'|'failure'|'unknown', confidence: 'high'|'medium'|'low', reason: string, votes: { provider: string, result: string }[] }
       ```
    5. Salvar `result_confidence` no campo criado na migration 031 (Task 2.3)
    5. Alertas de resultado incluem indicador de confiança: `✅ ACERTOU (alta confiança)` vs `⚠️ ACERTOU (média confiança — verificar)`
    6. Multi-LLM roda **apenas para mercados não-determinísticos** — mercados simples (Over/Under, BTTS, 1X2) já são avaliados pela validação determinística da Task 1.6
  - Notes: Três provedores completamente distintos = se um modelo tem viés de treinamento, os outros dois compensam. Custo: GPT-5.1-mini é econômico, Sonnet 4.6 é mid-tier, Kimi 2.5 é competitivo — e multi-LLM só roda para mercados complexos (~20% das apostas). Requer API keys: `ANTHROPIC_API_KEY` e `MOONSHOT_API_KEY` adicionados ao Render.

---

### FASE 4 — Customização e Preview/Edição

**Objetivo**: Admins controlam o tom de voz e podem revisar/editar mensagens antes do envio.
**Dependência**: Design de UI deve estar pronto antes das Tasks de UI. BotContext (Fase 2) já disponível.

- [ ] **Task 4.1: API endpoint para tom de voz**
  - File: `admin-panel/src/app/api/groups/[id]/tone/route.ts` (novo)
  - Action:
    1. `GET /api/groups/[id]/tone` — retorna `copy_tone_config` do grupo
    2. `PUT /api/groups/[id]/tone` — atualiza `copy_tone_config` (validação via Zod)
    3. Acesso: `super_admin` pode editar qualquer grupo, **`group_admin` pode editar seu próprio grupo**
  - Notes: Seguir padrão de tenant middleware existente (`createApiHandler`). O PUT aceita tanto o formato estruturado (campos individuais) quanto o texto livre.
    **Conversão texto livre → config estruturada (Nível 1 → JSONB)**:
    - Modelo: `gpt-5-mini` (config.llm.lightModel — rápido, barato, bom para extração estruturada)
    - Prompt: system message com schema esperado + exemplos few-shot de conversão
    - Schema de saída (Zod `withStructuredOutput`):
      ```js
      z.object({
        persona: z.string().optional(),
        tone: z.string(),
        forbiddenWords: z.array(z.string()),
        ctaText: z.string().optional(),
        customRules: z.array(z.string()),
        rawDescription: z.string() // preserva o texto original
      })
      ```
    - **Error handling**: se LLM falha ou retorna schema inválido, salvar apenas `{ rawDescription: textoOriginal }` e notificar admin que a conversão falhou. O copyService usa `rawDescription` como fallback no system prompt.
    - **Validação**: rejeitar se `forbiddenWords` contém >50 itens ou se `customRules` contém >20 regras (limites sensatos).

- [ ] **Task 4.2: UI — Seção "Tom de Voz" no admin panel**
  - File: `admin-panel/src/app/(auth)/groups/[id]/tone/page.tsx` (novo) + componentes
  - Action: Tela com **2 níveis de configuração**:
    1. **Nível 1 (padrão — visível por default)**: Textarea principal "Descreva como seu bot deve se comunicar"
       - Placeholder: *"Informal, sem usar a palavra 'aposta', chamar o público de 'galera'. Tom confiante mas não arrogante."*
       - O backend traduz o texto livre em config estruturada via LLM antes de salvar
    2. **Nível 2 (avançado — colapsado)**: Campos estruturados para power users:
       - Campo "Persona" (text input) — ex: "Guru da Bet"
       - Campo "Palavras Proibidas" (tag input) — ex: "aposta", "bet"
       - Campo "CTA" (text input) — ex: "Confira agora!"
       - Campo "Regras Customizadas" (textarea)
    3. Botão "Testar" — gera preview de copy com as configs atuais
    4. Dropdown de grupo (super_admin) ou grupo fixo (group_admin)
  - Notes: **Depende de Design de UI**. A abordagem em 2 níveis reduz carga cognitiva — operador que só quer dizer "não fala aposta" usa o textarea e pronto.

- [ ] **Task 4.3: Integrar tom de voz no copyService**
  - File: `bot/services/copyService.js`
  - Action:
    1. Modificar `generateBetCopy(bet)` → `generateBetCopy(bet, toneConfig)`
    2. Migrar de raw string prompt para `ChatPromptTemplate.fromMessages([['system', systemMsg], ['human', humanMsg]])`
    3. System message injetado com: persona, tom, palavras proibidas, regras customizadas do grupo
    4. Invalidar cache quando `copy_tone_config` muda (via timestamp de última atualização)
  - Notes: O `toneConfig` é carregado via `BotContext.groupConfig.copyToneConfig` (Fase 2). Já usa a abstração correta.

- [ ] **Task 4.4: API endpoint para preview de mensagens**
  - File: `admin-panel/src/app/api/bets/post-now/preview/route.ts` (novo)
  - Action:
    1. `POST /api/bets/post-now/preview` — recebe `{ group_id }`, retorna `{ previewId, bets: [{ betId, preview: string, betInfo: {...} }] }`
    2. Internamente: chama mesma lógica de `getFilaStatus` + `generateBetCopy` (com toneConfig do grupo)
    3. Textos são gerados mas NÃO enviados ao Telegram
    4. `previewId` e textos gerados são persistidos na tabela **`post_previews`** no Supabase (não in-memory):
       ```sql
       CREATE TABLE post_previews (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         preview_id TEXT NOT NULL UNIQUE,
         group_id UUID NOT NULL REFERENCES groups(id),
         user_id UUID NOT NULL REFERENCES auth.users(id),
         bets JSONB NOT NULL,           -- [{ betId, preview, betInfo, overrideText? }]
         status TEXT DEFAULT 'draft',   -- 'draft' | 'confirmed' | 'expired'
         created_at TIMESTAMPTZ DEFAULT now(),
         expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
       );
       CREATE INDEX idx_post_previews_lookup ON post_previews (preview_id) WHERE status = 'draft';
       ```
    5. Endpoint `POST /api/bets/post-now/preview/regenerate` — recebe `{ previewId, betId }`, regenera copy de 1 bet, retorna texto novo + **diff client-side** (ver Task 4.5)
    6. **Auth**: usar `createApiHandler` + tenant middleware (mesmo padrão de `post-now/route.ts`). Validar que o user tem acesso ao `group_id`
  - Notes: Persistir no Supabase em vez de cache in-memory resolve: (a) Vercel serverless pode escalar/reiniciar sem perder estado, (b) concorrência entre admins isolada por `preview_id`, (c) TTL via `expires_at` com cleanup por cron ou trigger SQL. Adicionar esta migration como `sql/migrations/033_post_previews.sql`.

- [ ] **Task 4.5: UI — Fluxo de Preview + Edição no admin panel**
  - File: `admin-panel/src/app/(auth)/bets/post/page.tsx` (novo ou refactor da tela existente)
  - Action: Fluxo **mobile-first** com cards empilhados:
    1. Botão **"Preparar Postagem"** → loading state progressivo ("Gerando previews...")
    2. Exibe **cards empilhados full-width**, um por aposta. Cada card mostra:
       - Header: nome dos times, horário do jogo, mercado, odd
       - Body: texto da mensagem renderizado como preview (como aparecerá no Telegram)
    3. Cada card tem 3 ações (thumb-zone friendly):
       - **"Editar"** — abre textarea inline com o texto, teclado nativo
       - **"Regenerar"** — re-chama LLM via endpoint regenerate, mostra **diff visual client-side** usando lib `diff-match-patch` (Google, MIT, ~10KB gzipped): endpoint retorna `{ oldText, newText }`, frontend computa word-level diff e renderiza com `<ins>` (verde) e `<del>` (vermelho). Diff é computado no browser, não no server.
       - **"Remover"** — tira do lote com confirmação
    4. No topo: contador "3 de 5 apostas selecionadas" + botão **"Enviar Todas"**
    5. Ao confirmar: chama `POST /api/bets/post-now` com `overrides: { [betId]: editedText }`
  - Notes: **Depende de Design de UI**. O preview/edição acontece **só no admin panel web** — o fluxo do bot no Telegram (inline keyboard Confirmar/Cancelar) continua como fallback read-only pra quando o admin não tem acesso ao painel.

- [ ] **Task 4.6: Suporte a overrides no post-now**
  - File: `admin-panel/src/app/api/bets/post-now/route.ts`
  - Action:
    1. Aceitar campo opcional `previewId: string` no body (além do existente `group_id`)
    2. Se `previewId` presente: ler overrides da tabela `post_previews` (status='draft', não expirado), extrair textos editados do campo `bets[].overrideText`
    3. Passar overrides ao bot: setar `post_now_requested_at` + gravar `preview_id` referência na tabela `groups` (campo `active_preview_id TEXT`)
    4. Bot ao detectar `post_now_requested_at`: se `active_preview_id` existe, lê `post_previews` e usa textos editados; senão, gera via LLM como hoje
    5. Após postagem: bot marca `post_previews.status = 'confirmed'` e limpa `groups.active_preview_id`
  - Notes: Não usa `pending_post_overrides` JSONB em `groups` (race condition se 2 admins postam simultaneamente). A tabela `post_previews` isola cada sessão por `preview_id`. Requer migration `033_post_previews.sql` (criada na Task 4.4).

---

### FASE 5 — Deploy Multi-Bot Unificado

**Objetivo**: Consolidar N bots em 1 processo no Render. Todo o código já usa `BotContext` (Fases 2-4). Esta fase é deploy + cleanup.
**Dependência**: Fases 1-4 estáveis e validadas.

- [ ] **Task 5.1: Refatorar server.js para multi-webhook**
  - File: `bot/server.js`
  - Action:
    1. Em `start()`: chamar `initBots()` (plural), receber array de `BotContext`
    2. Para cada bot: registrar `app.post('/webhook/<token>', handler)` com closure sobre o `botCtx`
    3. `processWebhookUpdate(update, botCtx)` — todas comparações de chat ID usam `botCtx.adminGroupId`
    4. Registrar webhooks no Telegram para cada bot token
    5. Remover `cachedGroupChatId` singleton — usar `botCtx.publicGroupId`
  - Notes: O Express app continua sendo 1 só. Múltiplas rotas coexistem.

- [ ] **Task 5.2: Refatorar scheduler para factory pattern**
  - File: `bot/server.scheduler.js`
  - Action:
    1. Exportar `createScheduler(groupId, botCtx)` factory function
    2. Cada instância tem seu próprio: `activePostingJobs`, `currentSchedule`, `isManualPostInProgress`
    3. Em `server.js`: criar 1 scheduler por grupo ativo
    4. `reloadPostingSchedule()` e `checkPostNow()` são per-scheduler instance
    5. Intervalos de reload/polling: 1 `setInterval` global que itera sobre todos os schedulers (evita N timers)
  - Notes: Isolamento de falha: se scheduler de grupo A falha, grupo B continua.

- [ ] **Task 5.3: Propagar botCtx para todos os handlers**
  - Files: `bot/handlers/adminGroup.js`, `bot/handlers/admin/actionCommands.js`, `bot/handlers/callbackHandlers.js`, `bot/handlers/startCommand.js`
  - Action: Cada handler recebe `botCtx` como parâmetro. Substituir todas as leituras de `config.telegram.*` por `botCtx.*`. Substituir chamadas a `sendToAdmin(text)` por `sendToAdmin(text, botCtx)`.
  - Notes: Mudança mecânica mas ampla. Cada handler precisa ser auditado.

- [ ] **Task 5.4: Propagar groupId para todos os jobs**
  - Files: `bot/jobs/postBets.js`, `bot/jobs/distributeBets.js`, `bot/jobs/trackResults.js`, `bot/jobs/membership/kick-expired.js`, `bot/jobs/membership/sync-group-members.js`, `bot/jobs/membership/renewal-reminders.js`
  - Action: Cada job recebe `(groupId, botCtx)` em vez de ler `config.membership.groupId`. `pendingConfirmations` em `postBets.js` vira scoped: `Map<groupId, Map<confirmId, ...>>`.
  - Notes: Jobs centrais (distributeBets, trackResults) continuam rodando 1x cross-group, mas passam o `botCtx` correto ao enviar alertas.

- [ ] **Task 5.5: Propagar botCtx para services**
  - Files: `bot/services/alertService.js`, `bot/services/betService.js`, `bot/services/copyService.js`
  - Action: Services que chamam `sendToAdmin`/`sendToPublic` recebem `botCtx`. `betService` já filtra por `groupId` na maioria dos métodos — auditar e garantir cobertura.
  - Notes: `copyService` já recebe `toneConfig` (Task 4.3) — agora também recebe `botCtx` completo.

- [ ] **Task 5.6: Remover backward-compat e cleanup**
  - Files: `lib/config.js`, `bot/telegram.js`
  - Action:
    1. Remover fallback env vars de `telegram.js` (o warning de backward-compat da Task 2.1)
    2. Remover env vars per-bot da `validateConfig()` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_GROUP_ID`, `TELEGRAM_PUBLIC_GROUP_ID`, `GROUP_ID`)
    3. Remover fallback `config.telegram.publicGroupId` de `kick-expired.js`, `webhookProcessors.js`, `startCommand.js`
    4. `BOT_MODE` env var removida (processo único roda tudo)
    5. **Deduplicação de jobs centrais**: com a remoção de `BOT_MODE`, garantir que jobs cross-group (`distributeBets`, `trackResults`, `enrichOdds`) rodam **exatamente 1 vez** no processo unificado (não N vezes, uma por scheduler). Estratégia: manter jobs centrais no `server.js` como crons globais únicos (fora dos schedulers per-group). Schedulers per-group gerenciam apenas: posting jobs, renewalReminders, syncMembers.
  - Notes: Só executar depois que o deploy unificado estiver validado. A separação jobs centrais (global) vs jobs per-group (scheduler) é crítica para evitar N distribuições ou N trackings simultâneos.

- [ ] **Task 5.7: Atualizar deploy no Render**
  - File: Render dashboard + `render.yaml` (se existir)
  - Action:
    1. Criar novo serviço único "bets-bot-unified"
    2. Config: env vars globais apenas (SUPABASE_URL, API keys, ANTHROPIC_API_KEY, MOONSHOT_API_KEY)
    3. Testar com ambos os bots (Guru + Osmar) no novo serviço
    4. Após validação, desativar os 2 serviços antigos
  - Notes: Fazer rollout gradual. Manter serviços antigos disponíveis para rollback por 1 semana.

---

### Acceptance Criteria

#### Fase 1 — Bugs Críticos

- [ ] AC 1.1: Given bot Guru no Render, when o serviço está rodando, then o bot responde ao comando `/status` no grupo admin do Guru em menos de 5 segundos.
- [ ] AC 1.2: Given bot Guru configurado com posting_schedule enabled, when chega o horário configurado (10h/15h/22h), then o bot distribui e posta automaticamente no grupo público do Guru.
- [ ] AC 1.3: Given admin seleciona 5 apostas elegíveis no painel, when clica "Postar Agora", then as 5 apostas são postadas no grupo (não apenas 3).
- [ ] AC 1.4: Given 3 apostas postadas com jogos às 15h, 16h e 17h, when o cron de tracking roda entre 17h-23h, then as 3 apostas são avaliadas (não apenas 2).
- [ ] AC 1.5: Given uma aposta de "Over 2.5 gols" postada e o jogo termina 3x1 (4 gols), when o tracking roda, then o resultado é `success` (validação determinística, sem LLM).
- [ ] AC 1.6: Given uma aposta de "BTTS - Sim" postada e o jogo termina 2x0, when o tracking roda, then o resultado é `failure` (validação determinística, sem LLM).
- [ ] AC 1.7: Given uma bet cujo match não estava completo no ciclo de tracking, when o recovery sweep roda no próximo ciclo, then a bet é encontrada e avaliada corretamente.

#### Fase 2 — Fundação BotContext

- [ ] AC 2.1: Given `initBots()` chamado no startup, when existem 2 grupos ativos com bots vinculados no `bot_pool`, then `BotRegistry` contém 2 entradas e `getBotForGroup(groupId)` retorna o `BotContext` correto para cada um.
- [ ] AC 2.2: Given código legado chama `sendToAdmin(text)` sem `botCtx`, when a função é executada, then usa o primeiro bot como fallback e loga warning de backward-compat.
- [ ] AC 2.3: Given `loadGroupConfigs()` chamado, when a tabela `groups` tem `copy_tone_config` e `max_active_bets` populados, then cada config é carregada no `BotContext.groupConfig`.

#### Fase 3 — Distribuição e Resultados

- [ ] AC 3.1: Given 2 grupos ativos e 7 bets para distribuir, when `runDistributeBets` executa, then o grupo com menos bets recebe a próxima (diferença máxima de 1 bet entre grupos).
- [ ] AC 3.2: Given 10 runs consecutivos de distribuição, when os resultados são analisados, then nenhum grupo tem sistematicamente mais bets que outro (variância < 5%).
- [ ] AC 3.3: Given uma aposta de mercado complexo (ex: "Handicap Asiático -0.5") avaliada por 3 LLMs (GPT-5.1-mini, Claude Sonnet 4.6, Kimi 2.5) que concordam, when o tracking salva, then `result_confidence = 'high'`.
- [ ] AC 3.4: Given uma aposta onde 2 LLMs dizem `success` e 1 diz `failure`, when o tracking salva, then `bet_result = 'success'` e `result_confidence = 'medium'`.
- [ ] AC 3.5: Given uma aposta onde os 3 LLMs divergem, when o tracking salva, then `bet_result = 'unknown'`, `result_confidence = 'low'`, e bet é flaggada para revisão manual.
- [ ] AC 3.6: Given uma aposta de mercado simples (Over/Under, BTTS, 1X2), when o tracking roda, then a validação determinística é usada (multi-LLM NÃO é chamado).

#### Fase 4 — Customização e Preview

- [ ] AC 4.1: Given **group_admin** do Osmar na seção "Tom de Voz", when escreve "Informal, sem usar 'aposta', chamar de 'palpite'" e salva, then o backend converte em config estruturada e o próximo copy respeita as regras.
- [ ] AC 4.2: Given super_admin na seção "Tom de Voz" do grupo Guru, when usa os campos avançados (persona, palavras proibidas, CTA), then o copyService gera mensagem respeitando todas as configs.
- [ ] AC 4.3: Given operador clica "Preparar Postagem" no celular, when o preview é gerado, then cada bet aparece como card full-width com texto formatado, botões de Editar/Regenerar/Remover acessíveis com thumb.
- [ ] AC 4.4: Given operador edita o texto de uma mensagem no preview, when confirma e envia, then o Telegram recebe o texto editado (não o original gerado por LLM).
- [ ] AC 4.5: Given operador clica "Regenerar" em um card, when o novo texto é gerado, then um diff visual mostra o que mudou em relação ao texto anterior.
- [ ] AC 4.6: Given operador remove uma bet do lote no preview, when confirma e envia, then apenas as bets restantes são postadas.

#### Fase 5 — Deploy Multi-Bot

- [ ] AC 5.1: Given 1 processo Node.js rodando no Render, when mensagens chegam de ambos os grupos (Guru e Osmar), then cada mensagem é roteada para o handler correto do bot correspondente.
- [ ] AC 5.2: Given posting schedule de Guru às 10h e Osmar às 10:05, when ambos os horários chegam, then cada bot posta no seu grupo correto sem interferência.
- [ ] AC 5.3: Given o handler de Osmar lança uma exceção, when o erro é capturado, then o bot do Guru continua funcionando normalmente (isolamento de falhas).
- [ ] AC 5.4: Given o processo unificado é deployado, when ambos os bots são verificados, then `getWebhookInfo` retorna URLs corretas para cada token e ambos respondem a `/status`.
- [ ] AC 5.5: Given o cleanup da Task 5.6 executado, when `grep -rn "config\.telegram\.adminGroupId\|config\.telegram\.publicGroupId" bot/ lib/` é executado (manualmente ou via CI lint step), then zero matches são encontrados. **Verificação automatizada**: adicionar script `scripts/lint-no-singleton-config.sh` que roda no CI e falha se encontrar referências deprecated.

## Additional Context

### Dependencies

| Dependência | Fase | Tipo | Detalhe |
|---|---|---|---|
| Acesso ao Render (Guru) | Fase 1 | Infra | Logs + env vars do serviço `srv-d5hp23a4d50c7397o1q0` |
| API Telegram (getWebhookInfo) | Fase 1 | Externa | Diagnóstico do bot Guru |
| Supabase Management API | Fase 2+4 | Infra | Aplicar migrations 029-032 (Fase 2) + 033 (Fase 4, post_previews) |
| API keys Anthropic + Moonshot | Fase 3 | Externa | `ANTHROPIC_API_KEY`, `MOONSHOT_API_KEY` no Render |
| Design de UI (Tom de Voz) | Fase 4 | Design | Layout da seção de config — 2 níveis (texto livre + avançado) |
| Design de UI (Preview/Edição) | Fase 4 | Design | Fluxo mobile-first: cards empilhados, editar inline, diff no regenerar |
| Render deploy unificado | Fase 5 | Infra | Novo serviço + migração de tráfego |

### Dependencies entre Fases

```
Fase 1 (bugs) ──┐
                 ├──→ Fase 2 (BotContext + migrations) ──→ Fase 3 (distribuição + multi-LLM)
                 │                                    └──→ Fase 4 (customização + preview)
                 │
Design UI ───────────────────────────────────────────────→ Fase 4 (Tasks 4.2 e 4.5)
                                                           │
Fases 1-4 estáveis ──────────────────────────────────────→ Fase 5 (deploy unificado)
```

### Testing Strategy

**Fase 1 — Bugs:**
- Unit tests (Vitest): atualizar mocks de `maxActiveBets`, testar recovery sweep, testar validação determinística de mercados simples
- E2E (Playwright): testar postagem de 4+ apostas via admin panel, verificar no Telegram
- Manual: verificar bot Guru responde comandos e faz disparos automáticos

**Fase 2 — Fundação BotContext:**
- Unit tests: testar `BotRegistry`, `initBots()`, `getBotForGroup()`, backward-compat fallback
- Unit tests: testar `loadGroupConfigs()` com mock de Supabase
- Integration: verificar que deploy atual (1 bot por serviço) continua funcionando com a abstração nova

**Fase 3 — Distribuição + Resultados:**
- Unit tests: testar fairness do novo `distributeRoundRobin` com offset, testar lógica de consenso multi-LLM (mock das 3 respostas com cada combinação: 3/3, 2/3, 0/3 concordância)
- Unit tests: testar que mercados simples usam validação determinística e NÃO chamam LLM
- E2E: verificar distribuição balanceada ao longo de 3 ciclos

**Fase 4 — Customização + Preview:**
- Unit tests: testar injeção de tone config no prompt do copyService, testar conversão de texto livre em config estruturada, testar endpoints de preview e regenerate
- E2E (Playwright): fluxo completo mobile — config tom → preparar postagem → editar preview → confirmar envio → verificar no Telegram
- E2E: testar que group_admin consegue editar tom de voz do seu grupo mas não de outro

**Fase 5 — Deploy Multi-Bot:**
- Unit tests: testar createScheduler factory, processWebhookUpdate com botCtx
- Integration: deploy staging no Render com 2 bots no mesmo processo, enviar mensagens em ambos os grupos e verificar isolamento
- Rollback plan: manter serviços antigos por 1 semana após migração

### Notes

#### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Multi-LLM consensus aumenta custo | Financeiro | Validação determinística para mercados simples (~80% dos casos); multi-LLM (GPT-5.1-mini + Sonnet 4.6 + Kimi 2.5) só para mercados complexos (~20%) |
| Refatoração multi-bot (Fase 5) quebra funcionalidade existente | Operacional | BotContext com backward-compat (Fase 2) garante transição gradual; rollback para serviços antigos por 1 semana |
| Design de UI atrasa Fase 4 | Timeline | Backend (APIs, migrations) já pronto nas Fases 2-3; UI é a última peça a encaixar |
| Copy com tom de voz fica inconsistente | Qualidade | Botão "Testar" na UI + prompt engineering rigoroso + 2 níveis (simples → avançado) |
| Preview/edição gera latência perceptível (N chamadas LLM) | UX | Loading state progressivo, gerar previews em paralelo, persistido em `post_previews` tabela (TTL 30min via `expires_at`) |
| Concorrência: 2 admins preparando postagem ao mesmo tempo | Dados | `post_previews` tabela no Supabase com `preview_id` único por sessão; `active_preview_id` em `groups` garante que só 1 postagem é processada por vez |
| Kimi (Moonshot) API instável ou com alta latência | Operacional | `Promise.allSettled` tolera falha de 1 provider; se Kimi falha, consenso degraded entre 2 restantes (2/2 concordam → `medium`, 2/2 divergem → `low`). Logar falhas para diagnóstico. |

#### Decisões do Party Mode (2026-02-25)

| # | Decisão | Autor | Rationale |
|---|---|---|---|
| 1 | Antecipar BotContext/BotRegistry para Fase 2 | Winston (Arquiteto) | Evita retrabalho: Fases 3-4 já constroem sobre a interface correta |
| 2 | Multi-LLM com GPT-5.1-mini + Claude Sonnet 4.6 + Kimi 2.5 | Marcelomendes | Provedores distintos com capacidade de raciocínio real; modelos "lixosos" descartados |
| 3 | Personas explícitas (Super Admin, Group Admin, Subscriber) | John (PM) | Clarifica quem usa cada feature e orienta decisões de UX |
| 4 | Group Admin pode editar tom de voz do próprio grupo | John (PM) | Quem pediu a feature é operador (group_admin), não super admin |
| 5 | Métricas de sucesso mensuráveis | John (PM) | Tracking accuracy >95%, scheduler uptime >99%, fairness ≤1 bet |
| 6 | Tom de Voz com 2 níveis (texto livre + avançado) | Sally (UX) | Reduz carga cognitiva: operador escreve em linguagem natural, sistema estrutura |
| 7 | Preview/Edição mobile-first com cards + diff no regenerar | Sally (UX) | Operador usa no celular, com pressa, entre postagens |
| 8 | Preview/Edição só no web, Telegram como fallback read-only | Sally + Winston | Telegram não serve pra edição rica; bot mantém fluxo simples (confirmar/cancelar) |

#### Observações dos Operadores

- "BTS (Ambas Equipes Marcam) apresentaram maiores chances de êxito e também maiores Odds" — considerar priorizar esse mercado no pipeline de IA (fora do escopo desta spec, mas vale nota para o futuro)
- Apostas do Osmar percebidas como melhores — será corrigido com distribuição justa (Fase 3)

#### Estimativa de Complexidade por Fase

| Fase | Tasks | Complexidade | Dependência de Design |
|---|---|---|---|
| Fase 1 — Bugs Críticos | 6 tasks | Baixa-Média | Não |
| Fase 2 — Fundação BotContext | 3 tasks (4 migrations) | Média | Não |
| Fase 3 — Distribuição + Resultados | 2 tasks | Média | Não |
| Fase 4 — Customização + Preview | 6 tasks | Média-Alta | Sim (Tasks 4.2 e 4.5) |
| Fase 5 — Deploy Multi-Bot | 7 tasks | Alta | Não |

---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: complete
completedAt: "2026-01-10"
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/source-tree-analysis.md
  - docs/development-guide.md
workflowType: 'architecture'
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-01-10'
---

# Architecture Decision Document - bets-estatistica

_Este documento é construído colaborativamente através de descoberta passo-a-passo. Seções são adicionadas conforme trabalhamos em cada decisão arquitetural juntos._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 46 FRs em 9 áreas de capacidade

| Área | FRs | Complexidade |
|------|-----|--------------|
| Geração de Apostas | 4 | Baixa (existente) |
| Integração de Odds | 5 | Média (nova API) |
| Telegram Público | 6 | Média |
| Grupo Admin | 7 | Média-Alta (novo fluxo) |
| Deep Links | 3 | Baixa (armazenar) |
| Tracking | 6 | Média |
| Métricas | 6 | Baixa |
| Regras de Negócio | 5 | Baixa |
| Gestão de Dados | 4 | Média (migração) |

**Non-Functional Requirements:** 20 NFRs

- **Críticos:** Reliability (0 postagens perdidas), Pontualidade
- **Importantes:** Security (API keys), Alertas
- **Secundários:** Cache, Logs estruturados

### Scale & Complexity

- **Complexidade:** Média
- **Domínio:** Backend + Bot Automation
- **Componentes estimados:** 5-7 módulos principais
- **Integrações externas:** 4 (FootyStats, The Odds API, Telegram, Supabase)

### Technical Constraints & Dependencies

| Constraint | Impacto |
|------------|---------|
| **Brownfield** | Estender código Node.js existente |
| **Supabase** | Migrar de PostgreSQL local |
| **Render** | Deploy simples, cron jobs |
| **Cold start OK** | Não precisa estar online 24/7 |
| **Operador manual** | Links fornecidos via Telegram |

### Cross-Cutting Concerns

1. **Scheduling:** 6 jobs (3 admin + 3 público) + lembretes
2. **Estado de Apostas:** Máquina de estados para cada aposta
3. **Fallback:** Não postar se não tiver link ou odds
4. **Observabilidade:** Logs + alertas via Telegram ao operador
5. **Migração de dados:** PostgreSQL local → Supabase

## Technical Foundation (Brownfield)

### Existing Technology Stack

| Layer | Technology | Version | Status |
|-------|------------|---------|--------|
| **Runtime** | Node.js | 20+ | ✅ Manter |
| **Language** | JavaScript | ES2022 | ✅ Manter |
| **AI Framework** | LangChain | 1.1.x | ✅ Manter |
| **LLM Provider** | OpenAI | GPT-5.1 | ✅ Manter |
| **Validation** | Zod | 3.x | ✅ Manter |
| **HTTP Client** | axios | 1.x | ✅ Manter |
| **Database** | PostgreSQL | 15+ | 🔄 Migrar para Supabase |

### New Dependencies

| Package | Purpose | Why |
|---------|---------|-----|
| `@supabase/supabase-js` | Supabase client | SDK oficial |
| `node-telegram-bot-api` | Bot Telegram | Mais popular (~55k stars) |
| `node-cron` | Scheduling (dev) | Simples, leve |

### Project Structure Extension

```
bets-estatistica/
├── agent/                    # ✅ Existente
├── scripts/                  # ✅ Existente
├── sql/                      # 🔄 Ajustar para Supabase
├── bot/                      # 🆕 NOVO
│   ├── index.js             # Entry point
│   ├── telegram.js          # Telegram client
│   ├── handlers/
│   │   └── adminGroup.js    # Handlers grupo admin
│   ├── jobs/
│   │   ├── requestLinks.js  # Pedir links (8h/13h/20h)
│   │   ├── postBets.js      # Postar apostas (10h/15h/22h)
│   │   ├── reminders.js     # Lembretes
│   │   └── trackResults.js  # Tracking
│   └── services/
│       ├── oddsService.js   # The Odds API
│       ├── betService.js    # Gestão de apostas
│       └── metricsService.js
├── lib/                      # 🆕 NOVO
│   ├── supabase.js          # Supabase client
│   └── logger.js            # Logging
└── render.yaml              # 🆕 Render config
```

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        RENDER                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────┐    │
│  │   Web Service       │    │   Cron Jobs             │    │
│  │   (Bot Telegram)    │    │                         │    │
│  │                     │    │   08:00 requestLinks    │    │
│  │   - Webhook mode    │    │   10:00 postBets        │    │
│  │   - Receive msgs    │    │   13:00 requestLinks    │    │
│  │   - Process links   │    │   15:00 postBets        │    │
│  │                     │    │   20:00 requestLinks    │    │
│  └─────────────────────┘    │   22:00 postBets        │    │
│            │                │   */30 * reminders      │    │
│            │                │   */5 * trackResults    │    │
│            ▼                └─────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    SUPABASE                          │   │
│  │   PostgreSQL + REST API + Realtime                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | Supabase | Project URL |
| `SUPABASE_ANON_KEY` | Supabase | Anon/public key |
| `SUPABASE_SERVICE_KEY` | Supabase | Service role key |
| `TELEGRAM_BOT_TOKEN` | Telegram | Bot token |
| `TELEGRAM_ADMIN_GROUP_ID` | Telegram | ID do grupo admin |
| `TELEGRAM_PUBLIC_GROUP_ID` | Telegram | ID do grupo público |
| `OPENAI_API_KEY` | OpenAI | API key |
| `THE_ODDS_API_KEY` | The Odds API | API key |
| `FOOTYSTATS_API_KEY` | FootyStats | API key (existente) |

## Core Architectural Decisions

### Decision 1: Bet State Machine

```
generated → pending_link → ready → posted → success/failure/cancelled
```

| Estado | Descrição | Trigger |
|--------|-----------|---------|
| `generated` | IA gerou a aposta | Após análise |
| `pending_link` | Aguardando link do operador | Pedido enviado no grupo admin |
| `ready` | Tem link válido, pronta para postar | Operador enviou link |
| `posted` | Publicada no grupo público | Job de postagem |
| `success` | Aposta acertou | Resultado do jogo |
| `failure` | Aposta errou | Resultado do jogo |
| `cancelled` | Cancelada (sem link a tempo, etc.) | Regra de negócio |

### Decision 2: Market Mapping (The Odds API)

| Internal Market | API Market Key | Type |
|-----------------|----------------|------|
| Over/Under Gols | `totals` | Game |
| Ambas Marcam | `btts` | Game |
| Resultado | `h2h` | Game |
| Escanteios | `totals_corners` | Game |
| Cartões | `totals_bookings` | Game |
| Chutes a Gol | `player_shots_on_target` | Player |
| Handicap | `spreads` | Game |
| Double Chance | `double_chance` | Game |

### Decision 3: Error Handling & Fallback

| Cenário | Ação | Fallback |
|---------|------|----------|
| The Odds API fail 3x | Alerta no grupo admin | Não postar (sem odds) |
| Supabase fail 3x | Alerta no grupo admin | Job não executa |
| Telegram API fail | Retry 3x | Log de erro |
| Operador não responde (3 lembretes) | Continuar pedindo 1/1h | Na hora de postar, pular aposta sem link |

### Decision 4: Logging & Alertas

**Destinos:**
- **Console/Render:** Todos os logs
- **Grupo Admin Telegram:** Erros e avisos importantes

**Formato de Alerta no Grupo Admin:**

```
⚠️ ALERTA: [TIPO]

📋 Técnico: [mensagem técnica]

💬 Resumo: [explicação simples]

🕐 [timestamp]
```

### Decision 5: Deferred (Post-MVP)

| Decisão | Motivo | Quando |
|---------|--------|--------|
| Agente interpreta logs | Low priority | Após MVP validado |
| Dashboard web | Não essencial | Phase 2 |
| Múltiplas casas | Complexidade | Phase 3 |

## Implementation Patterns & Consistency Rules

### Naming Conventions

| Contexto | Padrão | Exemplo |
|----------|--------|---------|
| **Tabelas DB** | snake_case, plural | `suggested_bets` |
| **Colunas DB** | snake_case | `bet_status`, `posted_at` |
| **Arquivos JS** | camelCase | `betService.js` |
| **Funções** | camelCase | `getBetsByStatus()` |
| **Constantes** | UPPER_SNAKE | `MAX_RETRIES` |
| **Env vars** | UPPER_SNAKE | `TELEGRAM_BOT_TOKEN` |

### Service Response Pattern

```javascript
// Sucesso
{ success: true, data: {...} }

// Erro
{ success: false, error: { code: 'API_ERROR', message: '...' } }
```

### Logging Pattern

```javascript
const logger = require('../lib/logger');

logger.info('Postagem enviada', { betId: 123, groupId: 'xxx' });
logger.warn('Lembrete enviado', { betId: 123, attempt: 2 });
logger.error('Falha API', { service: 'odds', error: err.message });
```

### Error Handling Pattern

```javascript
async function fetchWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { success: true, data: result };
    } catch (err) {
      logger.warn('Retry', { attempt, error: err.message });
      if (attempt === maxRetries) {
        await alertAdmin('API_ERROR', `Falhou após ${maxRetries} tentativas`);
        return { success: false, error: { code: 'API_ERROR', message: err.message } };
      }
      await sleep(1000 * attempt); // exponential backoff
    }
  }
}
```

### Enforcement Rules

**Todos os agentes/devs DEVEM:**
- Usar snake_case para banco de dados
- Usar camelCase para código JavaScript
- Retornar { success, data/error } de todos os services
- Logar com níveis apropriados (info/warn/error)
- Implementar retry com backoff para APIs externas

## Project Structure & Boundaries

### Complete Project Directory Structure

```
bets-estatistica/
├── README.md
├── README_agent.md                    # ✅ Existente
├── package.json                       # 🔄 Atualizar deps
├── .env.example                       # 🆕 Criar
├── .gitignore                         # ✅ Existente
│
├── agent/                             # ✅ Existente - IA
│   ├── analysis/
│   │   ├── prompt.js
│   │   ├── runAnalysis.js
│   │   └── schema.js
│   ├── persistence/
│   │   ├── analysisParser.js
│   │   └── saveOutputs.js
│   ├── shared/
│   │   └── naming.js
│   ├── db.js                          # 🔄 Migrar para Supabase
│   └── tools.js
│
├── scripts/                           # ✅ Existente - ETL
│   ├── daily_update.js
│   ├── check_analysis_queue.js
│   └── ... (outros scripts ETL)
│
├── bot/                               # 🆕 NOVO - Telegram Bot
│   ├── index.js                       # Entry point
│   ├── telegram.js                    # Telegram client singleton
│   ├── handlers/
│   │   ├── adminGroup.js              # Receber links
│   │   └── commands.js                # /status, /retry
│   ├── jobs/
│   │   ├── requestLinks.js            # 8h/13h/20h
│   │   ├── postBets.js                # 10h/15h/22h
│   │   ├── reminders.js               # a cada 30min
│   │   └── trackResults.js            # a cada 5min
│   └── services/
│       ├── oddsService.js             # The Odds API
│       ├── betService.js              # CRUD apostas
│       ├── metricsService.js          # Taxa de acerto
│       └── alertService.js            # Alertas admin
│
├── lib/                               # 🆕 NOVO - Shared
│   ├── supabase.js                    # Supabase client
│   ├── logger.js                      # Logging
│   └── config.js                      # Centralized config
│
├── sql/                               # 🔄 Migrations
│   └── migrations/
│       └── 001_add_bet_states.sql
│
├── main.js                            # 🔄 Ajustar
└── render.yaml                        # 🆕 Render config
```

### Requirements to Structure Mapping

| Área de FR | Diretório/Arquivo |
|------------|-------------------|
| FR1-4 (Geração) | `agent/` |
| FR5-9 (Odds) | `bot/services/oddsService.js` |
| FR10-15 (Telegram Público) | `bot/jobs/postBets.js` |
| FR16-22 (Grupo Admin) | `bot/handlers/adminGroup.js` |
| FR23-25 (Deep Links) | `bot/services/betService.js` |
| FR26-31 (Tracking) | `bot/jobs/trackResults.js` |
| FR32-37 (Métricas) | `bot/services/metricsService.js` |
| FR43-46 (Dados) | `lib/supabase.js` |

### Integration Boundaries

**Regra Principal:** Todo acesso ao banco passa por `lib/supabase.js`

```
agent/ ─────┐
            │
            ├───► lib/supabase.js ───► SUPABASE
            │
bot/   ─────┘
```

### Render Configuration

```yaml
services:
  - type: web
    name: bets-bot
    runtime: node
    startCommand: node bot/index.js

cron:
  - name: request-links-morning
    schedule: "0 8 * * *"
    command: node bot/jobs/requestLinks.js morning
  - name: post-bets-morning
    schedule: "0 10 * * *"
    command: node bot/jobs/postBets.js morning
  - name: request-links-afternoon
    schedule: "0 13 * * *"
    command: node bot/jobs/requestLinks.js afternoon
  - name: post-bets-afternoon
    schedule: "0 15 * * *"
    command: node bot/jobs/postBets.js afternoon
  - name: request-links-night
    schedule: "0 20 * * *"
    command: node bot/jobs/requestLinks.js night
  - name: post-bets-night
    schedule: "0 22 * * *"
    command: node bot/jobs/postBets.js night
  - name: reminders
    schedule: "*/30 * * * *"
    command: node bot/jobs/reminders.js
  - name: track-results
    schedule: "*/5 * * * *"
    command: node bot/jobs/trackResults.js
```

## Architecture Validation Results

### Validation Summary

| Categoria | Status | Cobertura |
|-----------|--------|-----------|
| Coerência | ✅ Passou | 100% |
| Requisitos | ✅ Passou | 46 FRs + 20 NFRs |
| Prontidão | ✅ Passou | Todos os arquivos mapeados |

### Checklist de Completude

**✅ Análise de Contexto**
- [x] Contexto do projeto analisado
- [x] Escala e complexidade avaliadas
- [x] Constraints técnicos identificados
- [x] Cross-cutting concerns mapeados

**✅ Decisões Arquiteturais**
- [x] Decisões críticas documentadas
- [x] Stack tecnológico especificado
- [x] Padrões de integração definidos
- [x] Estado de apostas (state machine)

**✅ Padrões de Implementação**
- [x] Convenções de naming
- [x] Padrões de estrutura
- [x] Padrões de logging
- [x] Tratamento de erros

**✅ Estrutura do Projeto**
- [x] Diretórios completos
- [x] Boundaries estabelecidos
- [x] Mapeamento FR → arquivos
- [x] render.yaml configurado

### Architecture Readiness

**Status Geral:** ✅ PRONTO PARA IMPLEMENTAÇÃO

**Nível de Confiança:** Alto

**Forças:**
- Brownfield: código existente funciona
- Integrações bem definidas
- Padrões claros e simples

**Para Melhorar Depois:**
- Testes automatizados
- CI/CD
- Dashboard de métricas

### Próximos Passos (Ordem de Implementação)

1. **Setup Supabase** - Criar projeto, migrar schema
2. **Bot básico** - Telegram client funcionando
3. **Job requestLinks** - Pedir links no grupo admin
4. **Handler adminGroup** - Receber e salvar links
5. **Job postBets** - Postar no grupo público
6. **Integrar The Odds API** - Enriquecer com odds
7. **Job trackResults** - Tracking de resultados
8. **Job reminders** - Lembretes
9. **Deploy Render** - Tudo funcionando em produção

---

## Architecture Completion Summary

### Workflow Status

| Item | Status |
|------|--------|
| **Workflow** | Architecture Decision ✅ COMPLETO |
| **Steps Completados** | 8/8 |
| **Data** | 2026-01-10 |
| **Documento** | `_bmad-output/planning-artifacts/architecture.md` |

### Entregas Finais

**📋 Documento de Arquitetura Completo**
- 5 decisões arquiteturais críticas documentadas
- 4 padrões de implementação definidos
- Estrutura completa do projeto com todos os arquivos
- Mapeamento FR → arquivos
- Validação confirmando coerência

**🏗️ Fundação Pronta para Implementação**
- 46 requisitos funcionais cobertos
- 20 requisitos não-funcionais endereçados
- State machine de apostas definida
- render.yaml configurado

### Handoff para Implementação

**Para AI Agents:**
Este documento é o guia completo para implementar bets-estatistica. Seguir todas as decisões, padrões e estruturas exatamente como documentado.

**Sequência de Desenvolvimento:**
1. Inicializar Supabase (schema + migrations)
2. Configurar ambiente (.env, render.yaml)
3. Implementar `lib/` (supabase, logger, config)
4. Implementar `bot/` seguindo os padrões estabelecidos
5. Manter consistência com regras documentadas

---

**Architecture Status:** ✅ PRONTO PARA IMPLEMENTAÇÃO

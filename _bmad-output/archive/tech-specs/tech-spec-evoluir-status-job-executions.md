---
title: 'Evoluir /status com Job Executions'
slug: 'evoluir-status-job-executions'
created: '2026-01-19'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['node.js-20', 'es2022-commonjs', 'supabase-rest', 'node-telegram-bot-api', 'node-cron']
files_to_modify:
  - 'bot/handlers/adminGroup.js:286'
  - 'bot/services/jobExecutionService.js'
  - 'scripts/pipeline.js'
  - 'bot/jobs/healthCheck.js:251'
  - 'bot/server.js'
code_patterns: ['service-response-pattern', 'supabase-singleton', 'logger-singleton']
test_patterns: ['jest', 'mock-supabase', 'fixtures']
---

# Tech-Spec: Evoluir /status com Job Executions

**Created:** 2026-01-19

## Overview

### Problem Statement

O comando `/status` atual é muito simples - mostra apenas "Bot online" sem contexto operacional. O health check envia warns pouco acionáveis (ex: `stuck_pending_link`) que já são visíveis em outros comandos (`/apostas`). Além disso, o pipeline que roda no GitHub Actions não grava execuções na tabela `job_executions`, impossibilitando monitoramento centralizado.

### Solution

Evoluir o `/status` para mostrar uma tabela com as últimas execuções de jobs (últimas 24h), incluindo status, horário e resultado/erro. Fazer o `pipeline.js` usar `withExecutionLogging` para gravar no banco. Remover `stuck_pending_link` do health check warn (redundante com `/apostas`).

### Scope

**In Scope:**
- Evoluir `/status` para mostrar tabela de `job_executions`
- Mostrar em formato lista (não tabela ASCII - melhor no mobile): `✅ job · hora · resultado`
- Coluna Resultado mostra: resumo do result (success), error_message (failed), ou check+count (warn)
- **Regra de exibição:** mostrar a execução mais recente de CADA job_name (não apenas últimas 24h cronológicas) - garante visibilidade de todos os jobs mesmo os menos frequentes
- Fazer `pipeline.js` usar `withExecutionLogging` para gravar no banco
- Remover `stuck_pending_link` do array de issues no health check warn
- Job de cleanup: marcar como `failed` registros com `status='running'` há mais de 1h (evita dados órfãos)
- Criar função `formatResult(jobName, result)` para padronizar exibição do JSONB por tipo de job

**Out of Scope:**
- Criar novo comando `/jobs` separado
- Mudar estrutura da tabela `job_executions`
- Alterar outros comandos admin

## Context for Development

### Codebase Patterns

**Service Response Pattern (obrigatório):**
```javascript
return { success: true, data: { ... } };
return { success: false, error: { code: 'ERROR_CODE', message: '...' } };
```

**Supabase Access (obrigatório):**
```javascript
const { supabase } = require('../lib/supabase');  // NUNCA instanciar direto
```

**Logging (obrigatório):**
```javascript
const logger = require('../lib/logger');
logger.info('[module:action] Message', { key: value });
```

### Files to Reference

| File | Linha | O que fazer |
| ---- | ----- | ----------- |
| `bot/handlers/adminGroup.js` | 286-297 | Expandir `handleStatusCommand` de 11 para ~50 linhas |
| `bot/services/jobExecutionService.js` | EOF | Adicionar `getLatestExecutions()` e `cleanupStuckJobs()` |
| `scripts/pipeline.js` | 183-260 | Wrap função `main()` com `withExecutionLogging('pipeline', ...)` |
| `bot/jobs/healthCheck.js` | 251 | Remover push de `stuck_pending_link` para issues |
| `sql/migrations/011_job_executions.sql` | - | Referência: schema da tabela |
| `_bmad-output/project-context.md` | - | Referência: patterns obrigatórios |

### Technical Decisions

1. **Formato lista, não tabela ASCII**
   - Tabelas com `│` e `─` quebram no Telegram mobile
   - Usar: `✅ job-name · HH:MM · resultado`

2. **Limite de caracteres**
   - Telegram max 4096 chars, usar margem de segurança < 2000
   - Truncar coluna "resultado" em ~30 chars se necessário

3. **Jobs "running" travados**
   - Se `status='running'` há mais de 30min → mostrar como `⏳ job · HH:MM · running há Xmin`
   - Indica possível crash, operador sabe que algo travou

4. **Import path no pipeline.js** ✅ Confirmado
   - Usar: `require('../bot/services/jobExecutionService')` de `scripts/pipeline.js`
   - GH Actions já tem `SUPABASE_SERVICE_KEY` nos secrets (confirmado no workflow)

5. **Cache do /status**
   - Cachear resultado da query por 30s (in-memory, expiração automática)
   - Evita flood se operador spammar o comando
   - Cache expira naturalmente após TTL (não há invalidação manual - simplicidade)

6. **formatResult() por tipo de job**
   - Cada job retorna estrutura JSONB diferente
   - Função centralizada para formatar de forma consistente:
     - `pipeline`: "X análises"
     - `post-bets`: "X posted, Y repost"
     - `track-results`: "X tracked (YG/ZR)"
     - `kick-expired`: "X kicked"
     - `enrich-odds`: "X enriched"
     - `reminders`: "X sent"
     - `trial-reminders`: "X sent"
     - `renewal-reminders`: "X sent"
     - `reconciliation`: "X reconciled"
     - `healthCheck`: "ok" ou "X warns"
     - default: JSON.stringify truncado em 30 chars

## Implementation Plan

### Tasks

#### Task 1: Adicionar funções de consulta ao jobExecutionService ✅
- **File:** `bot/services/jobExecutionService.js`
- **Action:** Adicionar 3 novas funções após `withExecutionLogging`:
  1. `getLatestExecutions()` - query DISTINCT ON (job_name) ORDER BY started_at DESC
  2. `cleanupStuckJobs()` - UPDATE status='failed' WHERE status='running' AND started_at < NOW() - 1h
  3. `formatResult(jobName, result)` - formata JSONB por tipo de job
- **Notes:** Seguir Service Response Pattern. Cache de 30s no `getLatestExecutions`.

#### Task 2: Evoluir handleStatusCommand ✅
- **File:** `bot/handlers/adminGroup.js:286-297`
- **Action:** Expandir função para:
  1. Chamar `getLatestExecutions()` do jobExecutionService
  2. Formatar lista: `✅ job · HH:MM · resultado` (usar formatResult)
  3. Jobs com status='running' > 30min → `⏳ job · HH:MM · running há Xmin`
  4. Mostrar contador no final: `❌ X falha(s) │ ⚠️ Y warn(s)`
- **Notes:** Limite 2000 chars. Truncar resultado em 30 chars se necessário.

#### Task 3: Integrar pipeline.js com withExecutionLogging ✅
- **File:** `scripts/pipeline.js:183-260`
- **Action:**
  1. Importar no topo: `const { withExecutionLogging } = require('../bot/services/jobExecutionService');`
  2. Extrair o corpo da função `main()` para uma função interna `runPipeline()`
  3. Na `main()`, chamar: `await withExecutionLogging('pipeline', runPipeline)`
  4. `runPipeline()` deve retornar objeto: `{ stepsRun: X, analysesGenerated: Y }`
- **Notes:** Testar localmente com `node scripts/pipeline.js --dry-run` antes de merge.

#### Task 4: Remover stuck_pending_link do healthCheck ✅
- **File:** `bot/jobs/healthCheck.js:251`
- **Action:** Remover ou comentar o bloco que faz `issues.push({ type: 'stuck_pending_link', ... })`
- **Notes:** Manter o resto do health check intacto. Warn de `stuck_ready` e outros continuam.

#### Task 5: Adicionar cleanup job ao scheduler ✅
- **File:** `bot/server.js`
- **Action:**
  1. Importar: `const { cleanupStuckJobs } = require('./services/jobExecutionService');`
  2. Adicionar cron: `cron.schedule('0 * * * *', ...)` (minuto 0 de cada hora)
  3. Dentro do cron: `await cleanupStuckJobs()` com try/catch e log
- **Notes:** Padrão `0 * * * *` = a cada hora cheia (00:00, 01:00, etc.). Log quantos registros foram limpos.

### Acceptance Criteria

- [ ] **AC1:** Given o bot está rodando, when operador envia `/status`, then resposta inclui lista de jobs com última execução de CADA job_name
- [ ] **AC2:** Given um job com status='running' há mais de 30min, when `/status` é chamado, then job aparece como `⏳ job · HH:MM · running há Xmin`
- [ ] **AC3:** Given o pipeline roda no GH Actions, when execução termina, then registro aparece em job_executions com status='success' e result JSONB
- [ ] **AC4:** Given health check detecta apostas pending_link > 8h, when warn é gerado, then `stuck_pending_link` NÃO aparece no alerta (removido)
- [ ] **AC5:** Given um registro com status='running' há mais de 1h, when cleanup job roda, then registro é atualizado para status='failed' com error_message='Timeout: job não finalizou'
- [ ] **AC6:** Given operador chama `/status` 2x em 10s, when segunda chamada é feita, then resultado vem do cache (não faz nova query)
- [ ] **AC7:** Given job `post-bets` retorna `{ posted: 2, reposted: 1 }`, when `/status` formata resultado, then mostra "2 posted, 1 repost" (ordem fixa: posted primeiro, repost depois)
- [ ] **AC8:** Given o banco está indisponível, when `/status` é chamado, then resposta mostra "Bot online" + "⚠️ Erro ao buscar jobs" (não crasha)
- [ ] **AC9:** Given a tabela job_executions está vazia, when `/status` é chamado, then resposta mostra "Bot online" + "📋 Nenhuma execução registrada"

## Additional Context

### Dependencies

- **Tabela `job_executions`** - já existe (migration 011)
- **`withExecutionLogging`** - já existe em jobExecutionService.js
- **Supabase client** - já configurado em lib/supabase.js
- **GH Actions secrets** - `SUPABASE_SERVICE_KEY` já configurado

### Testing Strategy

**Risco identificado:** Testes podem poluir tabela `job_executions` de produção se não houver isolamento.

**Mitigação:**
- Usar mocks do Supabase nos testes unitários (não fazer INSERT real)
- Testes de integração: usar banco de teste ou limpar registros criados no `afterEach`

**Testes unitários necessários:**

| Função | Arquivo de teste | O que testar |
|--------|------------------|--------------|
| `getLatestExecutions()` | `jobExecutionService.test.js` | Retorno vazio, múltiplos jobs, job running > 30min |
| `cleanupStuckJobs()` | `jobExecutionService.test.js` | Nenhum stuck, 1 stuck, múltiplos stuck |
| `formatResult()` | `jobExecutionService.test.js` | Cada tipo de job + default + null/undefined |
| `handleStatusCommand()` | `adminGroup.test.js` | Sucesso, erro banco, lista vazia, cache hit |

### Notes

**Riscos mitigados:**
- Limite de chars Telegram → truncar resultado em 30 chars
- Tabela ASCII quebra no mobile → usar formato lista
- Jobs "running" forever → cleanup a cada 1h
- Poluir banco em testes → usar mocks

**Futuras melhorias (out of scope):**
- Parâmetro `/status 48h` para histórico maior
- Notificação push quando job falha (além do alert existente)

---

## Review Notes

- Adversarial review completed
- Findings: 13 total, 6 fixed, 7 skipped (noise/undecided)
- Resolution approach: auto-fix

**Fixes aplicados:**
- F1: Cache invalidado após cleanupStuckJobs
- F2: Query stuckPending removida (DB load desnecessário)
- F3: Alerta enviado quando cleanup marca jobs como failed
- F5: Truncamento em limite de linha (não quebra markdown)
- F11: formatResult pipeline retorna 'ok' ao invés de string vazia
- F12: Testes adicionados para objeto vazio {} e stepsSkipped

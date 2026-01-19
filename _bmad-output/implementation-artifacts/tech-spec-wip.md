---
title: 'Automação e Monitoramento de Jobs'
slug: 'automacao-monitoramento-jobs'
created: '2026-01-18'
status: 'in-progress'
stepsCompleted: [1, 2]
tech_stack:
  - Node.js 20+
  - JavaScript ES2022 (CommonJS)
  - node-cron (scheduling)
  - GitHub Actions (CI/CD)
  - Supabase PostgreSQL
  - Jest (testes)
files_to_modify:
  - bot/server.js
  - .github/workflows/daily-pipeline.yml
  - sql/migrations/011_job_executions.sql
  - bot/services/jobExecutionService.js
  - bot/services/alertService.js
  - _bmad-output/project-context.md
code_patterns:
  - Service Response Pattern ({ success, data/error })
  - Job Pattern (require dotenv, logger, export runX, main check)
  - Alert Pattern (sendToAdmin via alertService)
  - Migration Pattern (sequential numbering, IF NOT EXISTS)
test_patterns:
  - Jest framework
  - Test files in __tests__/ mirroring src structure
---

# Tech-Spec: Automação e Monitoramento de Jobs

**Created:** 2026-01-18

## Overview

### Problem Statement

Jobs críticos do sistema não estão sendo executados:
1. **`trackResults.js`** (checagem de vitórias) existe mas nunca foi adicionado ao scheduler - apostas não são marcadas como ganhas/perdidas
2. **`reminders.js`** (lembrete de links pendentes) existe mas não roda
3. **Pipeline de ETL + análise IA** (`scripts/pipeline.js`) é executado manualmente, causando jogos defasados
4. **Sem visibilidade** de quais jobs rodaram, falharam ou foram pulados
5. **Scheduler atual está inchado** com múltiplas execuções desnecessárias (enrich/post 3x ao dia)

### Solution

1. **Corrigir e simplificar scheduler** em `bot/server.js`:
   - Adicionar `trackResults` (23:59) e `reminders` (09:00)
   - Simplificar: `enrichOdds`/`requestLinks` só 08:00, `postBets` só 10:00

2. **Automatizar pipeline via GitHub Actions**:
   - Workflow com cron diário às 06:00 BRT (09:00 UTC)
   - Secrets configurados no repositório

3. **Adicionar logging de execuções**:
   - Tabela `job_executions` no Supabase
   - Wrapper que registra cada run
   - Alerta no admin group se job falhar

### Scope

**In Scope:**
- Adicionar `trackResults` e `reminders` ao scheduler
- Remover execuções duplicadas (13h, 15h, 20h, 22h)
- Criar workflow GitHub Actions para pipeline
- Criar tabela e serviço de logging de jobs
- Alertas de falha no admin group
- Atualizar `project-context.md` com novos horários

**Out of Scope:**
- Manter bot acordado (ping externo) - deixar pra depois
- Mudanças nos jobs de membership (já funcionam)
- Mudanças na lógica interna dos jobs existentes

## Context for Development

### Codebase Patterns

**Job Pattern (seguir `bot/jobs/healthCheck.js`):**
```javascript
require('dotenv').config();
const logger = require('../../lib/logger');

async function runJobName() {
  logger.info('[module:job-name] Iniciando');
  // ... logic
  logger.info('[module:job-name] Concluído', { result });
  return { success: true, data: result };
}

if (require.main === module) {
  runJobName()
    .then(r => { console.log('Done:', r); process.exit(0); })
    .catch(e => { console.error('Failed:', e); process.exit(1); });
}

module.exports = { runJobName };
```

**Scheduler Pattern (em `bot/server.js`):**
```javascript
cron.schedule('0 8 * * *', async () => {
  logger.info('Running job-name');
  try {
    await runJobFunction();
  } catch (err) {
    logger.error('job-name failed', { error: err.message });
  }
}, { timezone: TZ });
```

**Alert Pattern:**
```javascript
const { sendToAdmin } = require('../telegram');
await sendToAdmin(`🔴 *JOB FAILED*\n\n...`);
```

**Migration Pattern:**
```sql
-- Migration 011: Description
-- Story/Spec reference
CREATE TABLE IF NOT EXISTS table_name (...);
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);
COMMENT ON TABLE table_name IS 'Description';
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `bot/server.js:164-318` | Scheduler atual (setupScheduler) |
| `bot/jobs/healthCheck.js` | Exemplo de job bem estruturado |
| `bot/jobs/trackResults.js` | Job existente - adicionar ao scheduler |
| `bot/jobs/reminders.js` | Job existente - adicionar ao scheduler |
| `bot/services/alertService.js` | Padrão de alertas |
| `.github/workflows/ci.yml` | CI existente - referência para novo workflow |
| `scripts/pipeline.js` | Pipeline a ser automatizado |
| `sql/migrations/006_system_config.sql` | Exemplo de migration |
| `_bmad-output/project-context.md` | Documentação a atualizar |

### Technical Decisions

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| GitHub Actions para pipeline | Sim | Free tier suficiente, já tem CI configurado |
| Tabela `job_executions` | Supabase | Consistência com stack, queries fáceis |
| Wrapper de execução | Função helper | Evita código duplicado em cada job |
| Horário pipeline | 06:00 BRT | Dados prontos antes do enrich (08:00) |

## Implementation Plan

### Tasks

_A ser preenchido no Step 3_

### Acceptance Criteria

_A ser preenchido no Step 3_

## Additional Context

### Dependencies

**Existentes (não precisa instalar):**
- `node-cron` - já usado no scheduler
- `@supabase/supabase-js` - já usado
- GitHub Actions - já configurado

**GitHub Secrets necessários:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `FOOTYSTATS_API_KEY`
- `OPENAI_API_KEY`
- `DATABASE_URL` (opcional, para pool direto)

### Testing Strategy

_A ser preenchido no Step 3_

### Notes

**Scheduler Final:**
| Horário | Job | Status |
|---------|-----|--------|
| 00:01 | `kick-expired` | mantém |
| 03:00 | `reconciliation` | mantém |
| 06:00 | Pipeline (GitHub Actions) | **NOVO** |
| 08:00 | `enrichOdds` + `requestLinks` | **simplifica** |
| 09:00 | `trial-reminders` + `reminders` | **adiciona** |
| 10:00 | `renewal-reminders` + `postBets` | **simplifica** |
| 23:59 | `trackResults` | **NOVO** |
| */5min | `healthCheck` | mantém |
| */30s | `process-webhooks` | mantém |

**Jobs removidos:**
- 13:00 `enrichOdds` + `requestLinks`
- 15:00 `postBets`
- 20:00 `enrichOdds` + `requestLinks`
- 22:00 `postBets`

---
title: 'Automação e Monitoramento de Jobs'
slug: 'automacao-monitoramento-jobs'
created: '2026-01-18'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Node.js 20+
  - JavaScript ES2022 (CommonJS)
  - node-cron (scheduling)
  - GitHub Actions (CI/CD)
  - Supabase PostgreSQL
  - Jest (testes)
files_to_modify:
  - bot/server.js
  - bot/jobs/healthCheck.js
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
adversarial_review:
  rounds: 2
  date: '2026-01-18'
  findings_fixed: 18
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
   - Adicionar `trackResults` (02:00 - para pegar jogos noturnos) e `reminders` (09:00)
   - Simplificar: `enrichOdds`/`requestLinks` só 08:00, `postBets` só 10:00
   - Integrar logging via `withExecutionLogging` wrapper

2. **Automatizar pipeline via GitHub Actions**:
   - Workflow com cron diário às 06:00 BRT (09:00 UTC)
   - Secrets configurados no repositório
   - Notificação de falha E sucesso via Telegram

3. **Adicionar logging de execuções**:
   - Tabela `job_executions` no Supabase (com cleanup policy)
   - Wrapper que registra cada run
   - Alerta no admin group se job falhar (com debounce)

### Scope

**In Scope:**
- Adicionar `trackResults` e `reminders` ao scheduler
- Remover execuções duplicadas (13h, 15h, 20h, 22h)
- Atualizar `healthCheck.js` para novos horários
- Criar workflow GitHub Actions para pipeline (com notificação de falha e sucesso)
- Criar tabela e serviço de logging de jobs
- Alertas de falha no admin group (com debounce)
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
| `bot/jobs/healthCheck.js` | Exemplo de job + POST_SCHEDULE a atualizar |
| `bot/jobs/trackResults.js` | Job existente - exporta `runTrackResults` (verificado) |
| `bot/jobs/reminders.js` | Job existente - exporta `runReminders` (verificado) |
| `bot/services/alertService.js` | Padrão de alertas (ver debounce em `canSendWebhookAlert`) |
| `.github/workflows/ci.yml` | CI existente - referência para novo workflow |
| `scripts/pipeline.js` | Pipeline a ser automatizado - requer DATABASE_URL |
| `sql/migrations/006_system_config.sql` | Exemplo de migration |
| `_bmad-output/project-context.md` | Documentação a atualizar |

### Technical Decisions

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| GitHub Actions para pipeline | Sim | Free tier suficiente, já tem CI configurado |
| Tabela `job_executions` | Supabase | Consistência com stack, queries fáceis |
| Wrapper de execução | Função helper | Evita código duplicado em cada job |
| Horário pipeline | 06:00 BRT | Dados prontos antes do enrich (08:00) |
| Horário trackResults | 02:00 BRT | Pega jogos noturnos que terminam após meia-noite |
| Debounce alertas | 60 minutos | Evita flood no admin group |
| Notificação sucesso | Sim | Confirma que pipeline está rodando |

## Implementation Plan

### Tasks

> **IMPORTANTE:** Tasks devem ser executadas na ordem listada. Algumas têm dependências explícitas.

- [x] **Task 1: Criar migration da tabela job_executions**
  - File: `sql/migrations/011_job_executions.sql`
  - Action: Criar tabela para registrar execuções de jobs
  - Schema:
    ```sql
    -- Migration 011: Job Executions Logging
    -- Tech-Spec: automacao-monitoramento-jobs

    CREATE TABLE IF NOT EXISTS job_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_name TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running', -- running/success/failed
      duration_ms INTEGER,
      result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_job_executions_job_name ON job_executions(job_name);
    CREATE INDEX IF NOT EXISTS idx_job_executions_started_at ON job_executions(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_executions_cleanup ON job_executions(created_at)
      WHERE created_at < NOW() - INTERVAL '30 days';

    COMMENT ON TABLE job_executions IS 'Log de execuções de jobs. Cleanup: DELETE WHERE created_at < NOW() - INTERVAL 30 days';
    COMMENT ON COLUMN job_executions.status IS 'running = em execução, success = sucesso, failed = falhou';
    ```
  - Note: Cleanup manual via query ou job futuro (fora do escopo MVP)

- [x] **Task 2: Adicionar jobFailureAlert no alertService** ⚠️ DEVE SER FEITA ANTES DA TASK 3
  - File: `bot/services/alertService.js`
  - Action: Adicionar função com debounce (similar a `canSendWebhookAlert`):
    ```javascript
    // Debounce cache for job failure alerts
    const jobAlertCache = new Map();
    const JOB_ALERT_DEBOUNCE_MINUTES = 60;

    function canSendJobAlert(jobName) {
      const cacheKey = `job_${jobName}`;
      const lastSent = jobAlertCache.get(cacheKey);
      const now = Date.now();
      const debounceMs = JOB_ALERT_DEBOUNCE_MINUTES * 60 * 1000;

      if (lastSent && (now - lastSent) < debounceMs) {
        logger.debug('[alertService] Job alert debounced', { jobName });
        return false;
      }

      jobAlertCache.set(cacheKey, now);
      return true;
    }

    async function jobFailureAlert(jobName, errorMessage, executionId) {
      if (!canSendJobAlert(jobName)) {
        logger.info('[alertService] Job failure alert debounced', { jobName, executionId });
        return { success: true, debounced: true };
      }

      const text = `
    🔴 *JOB FAILED*

    📋 *Job:* ${jobName}
    🔑 *ID:* \`${executionId || 'N/A'}\`

    ❌ *Erro:*
    ${errorMessage}

    🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      `.trim();

      return sendToAdmin(text);
    }
    ```
  - Adicionar `jobFailureAlert` ao `module.exports`

- [x] **Task 3: Criar jobExecutionService.js** (depende de Task 2)
  - File: `bot/services/jobExecutionService.js`
  - Action: Criar serviço com funções:
    ```javascript
    const { supabase } = require('../../lib/supabase');
    const logger = require('../../lib/logger');
    const { jobFailureAlert } = require('./alertService');

    async function startExecution(jobName) {
      const { data, error } = await supabase
        .from('job_executions')
        .insert({ job_name: jobName, status: 'running' })
        .select('id')
        .single();

      if (error) {
        // Log warning but don't fail - job should still run even if logging fails
        logger.warn('[jobExecutionService] Failed to start execution logging (job will still run)', {
          jobName,
          error: error.message
        });
        return { success: false, error };
      }
      return { success: true, data: { executionId: data.id } };
    }

    async function finishExecution(executionId, status, result = null, errorMessage = null) {
      const startResult = await supabase
        .from('job_executions')
        .select('started_at')
        .eq('id', executionId)
        .single();

      const durationMs = startResult.data
        ? Date.now() - new Date(startResult.data.started_at).getTime()
        : null;

      const { error } = await supabase
        .from('job_executions')
        .update({
          status,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
          result,
          error_message: errorMessage
        })
        .eq('id', executionId);

      if (error) {
        logger.warn('[jobExecutionService] Failed to finish execution logging', {
          executionId,
          error: error.message
        });
        return { success: false, error };
      }
      return { success: true };
    }

    async function withExecutionLogging(jobName, fn) {
      const startResult = await startExecution(jobName);
      const executionId = startResult.success ? startResult.data.executionId : null;

      if (!executionId) {
        logger.warn('[jobExecutionService] Running job without execution logging', { jobName });
      }

      try {
        const result = await fn();
        if (executionId) {
          await finishExecution(executionId, 'success', result);
        }
        return result;
      } catch (err) {
        if (executionId) {
          await finishExecution(executionId, 'failed', null, err.message);
          await jobFailureAlert(jobName, err.message, executionId);
        } else {
          // Still send alert even if logging failed
          await jobFailureAlert(jobName, err.message, null);
        }
        throw err;
      }
    }

    module.exports = { startExecution, finishExecution, withExecutionLogging };
    ```

- [x] **Task 4: Atualizar POST_SCHEDULE no healthCheck.js**
  - File: `bot/jobs/healthCheck.js`
  - Action: Encontrar a constante `POST_SCHEDULE` e atualizar:
    ```javascript
    // ANTES:
    const POST_SCHEDULE = [10, 15, 22]; // 10:00, 15:00, 22:00

    // DEPOIS:
    const POST_SCHEDULE = [10]; // Apenas 10:00 (simplificado)
    ```
  - Note: Isso evita alertas falsos de "postagem não executada" às 15h e 22h

- [x] **Task 5: Simplificar scheduler - remover duplicatas**
  - File: `bot/server.js`
  - Action: Remover os cron jobs identificados por seu conteúdo (NÃO por número de linha):
    - Remover bloco que contém `cron.schedule('0 13 * * *'` e comentário `afternoon-prep`
    - Remover bloco que contém `cron.schedule('0 15 * * *'` e comentário `afternoon-post`
    - Remover bloco que contém `cron.schedule('0 20 * * *'` e comentário `night-prep`
    - Remover bloco que contém `cron.schedule('0 22 * * *'` e comentário `night-post`
  - Buscar por: `// Afternoon prep`, `// Afternoon post`, `// Night prep`, `// Night post`

- [x] **Task 6: Adicionar trackResults ao scheduler (02:00)**
  - File: `bot/server.js`
  - Action: Adicionar import e cron job:
    ```javascript
    // No topo do arquivo, adicionar imports:
    const { runTrackResults } = require('./jobs/trackResults');
    const { withExecutionLogging } = require('./services/jobExecutionService');

    // Na função setupScheduler(), adicionar:
    // Track results - 02:00 São Paulo (pega jogos noturnos que terminam após meia-noite)
    cron.schedule('0 2 * * *', async () => {
      logger.info('[scheduler] Running track-results job');
      try {
        await withExecutionLogging('track-results', runTrackResults);
        logger.info('[scheduler] track-results complete');
      } catch (err) {
        logger.error('[scheduler] track-results failed', { error: err.message });
      }
    }, { timezone: TZ });
    ```
  - Verificado: `bot/jobs/trackResults.js` exporta `runTrackResults` na linha 224

- [x] **Task 7: Adicionar reminders ao scheduler (09:00)**
  - File: `bot/server.js`
  - Action: Adicionar import e incluir no job das 09:00 (após trial-reminders):
    ```javascript
    // No topo do arquivo, adicionar import:
    const { runReminders } = require('./jobs/reminders');

    // No cron das 09:00, APÓS o bloco de trial-reminders, adicionar:
    // Link reminders (follow-up após requestLinks das 08:00)
    logger.info('[scheduler] Running reminders job');
    try {
      await withExecutionLogging('reminders', runReminders);
      logger.info('[scheduler] reminders complete');
    } catch (err) {
      logger.error('[scheduler] reminders failed', { error: err.message });
    }
    ```
  - Verificado: `bot/jobs/reminders.js` exporta `runReminders` na linha 140
  - Note: `reminders.js` é follow-up para links não respondidos após `requestLinks` das 08:00

- [x] **Task 8: Integrar withExecutionLogging nos jobs existentes**
  - File: `bot/server.js`
  - Action: Envolver TODOS os jobs com `withExecutionLogging`. Código completo:
    ```javascript
    // Job das 08:00 (morning-prep):
    cron.schedule('0 8 * * *', async () => {
      logger.info('[scheduler] Running morning-prep jobs');
      try {
        await withExecutionLogging('enrich-odds', runEnrichment);
        await withExecutionLogging('request-links', () => runRequestLinks('morning'));
        logger.info('[scheduler] morning-prep complete');
      } catch (err) {
        logger.error('[scheduler] morning-prep failed', { error: err.message });
      }
    }, { timezone: TZ });

    // Job das 10:00 (morning-post):
    cron.schedule('0 10 * * *', async () => {
      logger.info('[scheduler] Running morning-post jobs');
      try {
        await withExecutionLogging('renewal-reminders', runRenewalReminders);
        await withExecutionLogging('post-bets', () => runPostBets('morning'));
        logger.info('[scheduler] morning-post complete');
      } catch (err) {
        logger.error('[scheduler] morning-post failed', { error: err.message });
      }
    }, { timezone: TZ });
    ```
  - **Não envolver healthCheck** - roda a cada 5min, geraria ~288 registros/dia

- [x] **Task 9: Criar workflow GitHub Actions para pipeline**
  - File: `.github/workflows/daily-pipeline.yml`
  - Action: Criar workflow com notificação de falha E sucesso:
    ```yaml
    name: Daily Pipeline

    on:
      schedule:
        # 09:00 UTC = 06:00 BRT
        # Nota: Brasil não tem horário de verão desde 2019
        - cron: '0 9 * * *'
      workflow_dispatch:  # Permite rodar manualmente

    jobs:
      pipeline:
        runs-on: ubuntu-latest
        timeout-minutes: 30

        steps:
          - uses: actions/checkout@v4

          - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
              node-version: '20'
              cache: 'npm'

          - name: Install dependencies
            run: npm ci

          - name: Run pipeline
            env:
              SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
              SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
              DATABASE_URL: ${{ secrets.DATABASE_URL }}
              FOOTYSTATS_API_KEY: ${{ secrets.FOOTYSTATS_API_KEY }}
              OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
              THE_ODDS_API_KEY: ${{ secrets.THE_ODDS_API_KEY }}
              NODE_ENV: production
              TZ: America/Sao_Paulo
            run: node scripts/pipeline.js

          - name: Notify success
            if: success()
            env:
              TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
              TELEGRAM_ADMIN_GROUP_ID: ${{ secrets.TELEGRAM_ADMIN_GROUP_ID }}
            run: |
              curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d chat_id="${TELEGRAM_ADMIN_GROUP_ID}" \
                -d parse_mode="Markdown" \
                -d text="✅ *PIPELINE OK*%0A%0A📋 Daily Pipeline concluído%0A🕐 $(TZ=America/Sao_Paulo date +'%d/%m/%Y %H:%M') BRT"

          - name: Notify failure
            if: failure()
            env:
              TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
              TELEGRAM_ADMIN_GROUP_ID: ${{ secrets.TELEGRAM_ADMIN_GROUP_ID }}
            run: |
              curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d chat_id="${TELEGRAM_ADMIN_GROUP_ID}" \
                -d parse_mode="Markdown" \
                -d text="🔴 *PIPELINE FAILED*%0A%0A📋 Workflow: Daily Pipeline%0A🔗 [Ver logs](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})%0A%0A🕐 $(TZ=America/Sao_Paulo date +'%d/%m/%Y %H:%M') BRT"
    ```

- [x] **Task 10: Atualizar console.log do scheduler**
  - File: `bot/server.js`
  - Action: Atualizar a lista de jobs no final de `setupScheduler()`:
    ```javascript
    console.log('⏰ Scheduler jobs:');
    console.log('   00:01 - Kick expired members (membership)');
    console.log('   02:00 - Track results');
    console.log('   03:00 - Cakto reconciliation (membership)');
    console.log('   08:00 - Enrich odds + Request links');
    console.log('   09:00 - Trial reminders + Link reminders');
    console.log('   10:00 - Renewal reminders + Post bets');
    console.log('   */5   - Health check');
    console.log('   */30s - Process webhooks (membership)');
    ```

- [x] **Task 11: Atualizar project-context.md**
  - File: `_bmad-output/project-context.md`
  - Action: Atualizar seção de File Structure Reference:
    - Mudar `requestLinks.js    # 8h/13h/20h` para `requestLinks.js    # 8h`
    - Mudar `postBets.js        # 10h/15h/22h` para `postBets.js        # 10h`
    - Adicionar `trackResults.js    # 2h`
    - Adicionar `reminders.js       # 9h`

- [ ] **Task 12: Aplicar migration no Supabase**
  - Action: Executar SQL da migration 011 no Supabase Dashboard
  - Verificar: Tabela `job_executions` criada com índices

- [ ] **Task 13: Configurar GitHub Secrets**
  - Action: Verificar/adicionar secrets no repositório GitHub:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_KEY`
    - `DATABASE_URL` ⚠️ **Necessário para pipeline.js**
    - `FOOTYSTATS_API_KEY`
    - `OPENAI_API_KEY`
    - `THE_ODDS_API_KEY`
    - `TELEGRAM_BOT_TOKEN`
    - `TELEGRAM_ADMIN_GROUP_ID`

### Acceptance Criteria

- [ ] **AC1:** Given o scheduler está rodando, when chega 02:00 BRT, then `trackResults` é executado com `withExecutionLogging` e cria registro em `job_executions`
- [ ] **AC2:** Given o scheduler está rodando, when chega 09:00 BRT, then `reminders` é executado após `trial-reminders` com logging
- [ ] **AC3:** Given o scheduler foi simplificado, when verifico `job_executions` entre 13:00-22:59 BRT, then não há registros de `afternoon-prep`, `afternoon-post`, `night-prep`, `night-post`
- [ ] **AC4:** Given GitHub Actions está configurado, when o cron dispara às 06:00 BRT, then o pipeline roda com sucesso
- [ ] **AC5:** Given GitHub Actions está configurado, when eu clico em "Run workflow" manualmente, then o pipeline roda
- [ ] **AC6:** Given o pipeline FALHA no GitHub Actions, when o step "Notify failure" roda, then uma mensagem com link para logs é enviada ao Telegram
- [ ] **AC7:** Given o pipeline SUCEDE no GitHub Actions, when o step "Notify success" roda, then uma mensagem de confirmação é enviada ao Telegram
- [ ] **AC8:** Given a tabela `job_executions` existe, when `withExecutionLogging` é chamado, then um registro é criado com `started_at` e `status='running'`
- [ ] **AC9:** Given um job está em execução, when ele termina com sucesso, then o registro é atualizado com `status='success'` e `duration_ms`
- [ ] **AC10:** Given um job falha pela 1ª vez, when `jobFailureAlert` é chamado, then alerta é enviado ao grupo admin
- [ ] **AC11:** Given um job falha pela 2ª vez em menos de 60 minutos, when `jobFailureAlert` é chamado, then alerta NÃO é enviado (debounce) e log info é registrado
- [ ] **AC12:** Given `healthCheck.js` foi atualizado, when chega 15:00 ou 22:00 BRT, then o healthCheck NÃO alerta sobre "postagem falhou" (POST_SCHEDULE atualizado)
- [ ] **AC13:** Given `project-context.md` foi atualizado, when um dev consulta os horários, then vê os novos horários (02h, 08h, 09h, 10h)

## Additional Context

### Dependencies

**Existentes (não precisa instalar):**
- `node-cron` - já usado no scheduler
- `@supabase/supabase-js` - já usado
- GitHub Actions - já configurado

**GitHub Secrets necessários (configurar se não existem):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL` ⚠️ **Obrigatório - pipeline.js usa conexão direta**
- `FOOTYSTATS_API_KEY`
- `OPENAI_API_KEY`
- `THE_ODDS_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_GROUP_ID`

**Ordem de execução (IMPORTANTE - respeitar dependências):**
1. Task 1 (migration) + Task 12 (aplicar no Supabase)
2. Task 2 (alertService - jobFailureAlert) ← **PRIMEIRO**
3. Task 3 (jobExecutionService) ← depende de Task 2
4. Task 4 (healthCheck POST_SCHEDULE)
5. Tasks 5-8, 10 (modificações no scheduler)
6. Task 9 + Task 13 (GitHub Actions + secrets)
7. Task 11 (documentação)

### Testing Strategy

**Testes Manuais:**
1. Rodar `node bot/jobs/trackResults.js` e verificar que funciona standalone
2. Rodar `node bot/jobs/reminders.js` e verificar que funciona standalone
3. Iniciar bot localmente e verificar logs do scheduler
4. Verificar que jobs das 13h/15h/20h/22h NÃO aparecem no console.log
5. Trigger manual do workflow no GitHub Actions
6. Verificar notificação de SUCESSO no Telegram após pipeline
7. Simular falha no pipeline e verificar notificação de FALHA no Telegram
8. Verificar registros na tabela `job_executions` após execuções
9. Testar debounce: forçar falha 2x em menos de 60min, verificar que só 1 alerta é enviado
10. Verificar que log info é registrado quando alerta é debounced

**Validação em Produção:**
1. Deploy para Render
2. Aguardar 02:00 BRT e verificar trackResults nos logs
3. Aguardar 09:00 BRT e verificar reminders nos logs
4. Verificar que 15:00 e 22:00 NÃO geram alertas no healthCheck
5. Verificar tabela `job_executions` no Supabase
6. Aguardar 06:00 BRT e verificar GitHub Actions + notificação Telegram

### Notes

**Scheduler Final:**
| Horário | Job | Status |
|---------|-----|--------|
| 00:01 | `kick-expired` | mantém |
| **02:00** | **`trackResults`** | **NOVO** |
| 03:00 | `reconciliation` | mantém |
| 06:00 | Pipeline (GitHub Actions) | **NOVO** |
| 08:00 | `enrichOdds` + `requestLinks` | **simplifica** |
| **09:00** | `trial-reminders` + **`reminders`** | **adiciona** |
| 10:00 | `renewal-reminders` + `postBets` | **simplifica** |
| */5min | `healthCheck` | mantém (sem logging) |
| */30s | `process-webhooks` | mantém |

**Jobs removidos:**
- 13:00 `enrichOdds` + `requestLinks`
- 15:00 `postBets`
- 20:00 `enrichOdds` + `requestLinks`
- 22:00 `postBets`

**Funções verificadas nos arquivos:**
- `bot/jobs/trackResults.js:224` → exporta `runTrackResults`
- `bot/jobs/reminders.js:140` → exporta `runReminders`

**Riscos mitigados (via Adversarial Review - 2 rodadas, 18 findings):**
1. ~~GitHub Actions falha silenciosamente~~ → Notificação falha E sucesso via Telegram
2. ~~Secrets não configurados~~ → Task 13 com lista completa incluindo DATABASE_URL
3. ~~Timezone issues~~ → `TZ=America/Sao_Paulo` explícito, nota sobre horário de verão
4. ~~trackResults não pega jogos noturnos~~ → Mudado para 02:00 BRT
5. ~~healthCheck alerta falso positivo~~ → POST_SCHEDULE atualizado
6. ~~jobExecutionService não integrado~~ → Tasks 6-8 usam `withExecutionLogging` com código completo
7. ~~Alertas flood admin group~~ → Debounce de 60min com log quando debounced
8. ~~job_executions cresce infinitamente~~ → Índice de cleanup + comentário
9. ~~Dependência circular Tasks 2/3~~ → Ordem corrigida: Task 2 antes de Task 3
10. ~~DATABASE_URL faltando~~ → Adicionado ao workflow e lista de secrets
11. ~~Task 8 vaga~~ → Código completo para jobs 08:00 e 10:00
12. ~~jobExecutionService falha silenciosamente~~ → Adicionado logger.warn quando logging falha

**Nota sobre Timezone:**
- Brasil não tem horário de verão desde 2019
- `TZ=America/Sao_Paulo` no node-cron lida automaticamente
- GitHub Actions cron usa UTC fixo (09:00 UTC = 06:00 BRT)

**Cleanup de job_executions (manual, fora do escopo MVP):**
```sql
DELETE FROM job_executions WHERE created_at < NOW() - INTERVAL '30 days';
```

**Esclarecimento reminders vs requestLinks:**
- `requestLinks` (08:00): Envia lista de apostas que precisam de links
- `reminders` (09:00): Cobra resposta de links não enviados após requestLinks
- Não há duplicação - são funções complementares

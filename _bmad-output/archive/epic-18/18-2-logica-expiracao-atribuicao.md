# Story 18.2: Lógica de Expiração de Atribuição

Status: done

---

## Story

**As a** sistema,
**I want** expirar atribuição de afiliado após 14 dias,
**So that** afiliado só receba comissão de conversões recentes.

---

## Acceptance Criteria

### AC1: Expiração de Atribuição Após 14 Dias
**Given** membro tem `affiliate_code` definido
**When** `affiliate_clicked_at` é mais de 14 dias atrás
**Then** atribuição é considerada expirada
**And** `affiliate_code` deve ser limpo (set null)
**And** `affiliate_clicked_at` deve ser limpo (set null)
**And** `affiliate_history` é preservado (nunca apagar)

### AC2: Job de Verificação Diária
**Given** job `check-affiliate-expiration` agendado
**When** executa diariamente às 00:30 BRT
**Then** busca todos os membros com `affiliate_clicked_at < now() - 14 days`
**And** limpa `affiliate_code` e `affiliate_clicked_at` desses membros
**And** loga quantidade de atribuições expiradas

### AC3: Função isAffiliateValid (Já Implementada em 18.1)
**Given** função `isAffiliateValid(member)` chamada
**When** `affiliate_code` existe e `affiliate_clicked_at` < 14 dias
**Then** retorna `true`
**When** `affiliate_code` é null ou `affiliate_clicked_at` >= 14 dias
**Then** retorna `false`

### AC4: Renovação de Atribuição
**Given** membro com atribuição expirada (ou limpa pelo job) clica em novo link de afiliado
**When** bot processa /start com `aff_NEWCODE`
**Then** atribuição é renovada com novo código
**And** novo clique é adicionado ao histórico (append-only)

---

## Tasks / Subtasks

- [x] **Task 1: Adicionar função clearExpiredAffiliates no memberService** (AC: #1, #2)
  - [x] 1.1: Criar função `clearExpiredAffiliates()` que busca membros expirados
  - [x] 1.2: Atualizar `affiliate_code = null` e `affiliate_clicked_at = null` para expirados
  - [x] 1.3: Garantir que `affiliate_history` NÃO é modificado
  - [x] 1.4: Retornar contagem de atribuições expiradas
  - [x] 1.5: **Adicionar `clearExpiredAffiliates` ao module.exports**

- [x] **Task 2: Criar job check-affiliate-expiration.js** (AC: #2)
  - [x] 2.1: Criar arquivo `bot/jobs/membership/check-affiliate-expiration.js`
  - [x] 2.2: Implementar função `runCheckAffiliateExpiration()`
  - [x] 2.3: Usar prefixo de logging `[membership:check-affiliate-expiration]` consistente
  - [x] 2.4: Usar lock in-memory (`let jobRunning = false`) para prevenir execução concorrente

- [x] **Task 3: Registrar job no scheduler** (AC: #2)
  - [x] 3.1: Adicionar import do job em `bot/server.js` (linha ~177)
  - [x] 3.2: Adicionar cron schedule para 00:30 BRT (`30 0 * * *`) entre kick-expired e track-results
  - [x] 3.3: Usar `withExecutionLogging()` do `jobExecutionService`
  - [x] 3.4: Atualizar lista de jobs no console output

- [x] **Task 4: Verificar comportamento de renovação** (AC: #4)
  - [x] 4.1: Verificar que `setAffiliateCode()` funciona quando `affiliate_code` é null
  - [x] 4.2: Testar fluxo: atribuição expirada → novo clique → renovação
  - [x] 4.3: Verificar que histórico é preservado após expiração + renovação

- [x] **Task 5: Testes unitários**
  - [x] 5.1: Adicionar testes para `clearExpiredAffiliates()` em `__tests__/services/memberService.test.js`
  - [x] 5.2: Testar que membros não expirados não são afetados
  - [x] 5.3: Testar que `affiliate_history` nunca é modificado
  - [x] 5.4: **Criar `__tests__/jobs/membership/check-affiliate-expiration.test.js`**
  - [x] 5.5: Testar job completo com mock do memberService

---

## ⚠️ DO / DO NOT

### ✅ DO (Fazer)

1. **CRIAR** `bot/jobs/membership/check-affiliate-expiration.js`
2. **ADICIONAR** `clearExpiredAffiliates()` em `bot/services/memberService.js`
3. **ADICIONAR** `clearExpiredAffiliates` ao `module.exports` em memberService.js
4. **ADICIONAR** schedule em `bot/server.js` (entre kick-expired 00:01 e track-results 02:00)
5. **CRIAR** `__tests__/jobs/membership/check-affiliate-expiration.test.js`
6. **MODIFICAR** `__tests__/services/memberService.test.js` com novos testes
7. **USAR** lock in-memory (`let jobRunning = false`) - padrão do projeto
8. **USAR** prefixo `[membership:check-affiliate-expiration]` em TODOS os logs do job

### ❌ DO NOT (Não Fazer)

1. **NÃO CRIAR** `isAffiliateValid()` - já existe em `memberService.js:1657`
2. **NÃO CRIAR** `bot/jobs/membership/index.js` - não existe, jobs são registrados em `server.js`
3. **NÃO USAR** distributed locks - projeto usa locks in-memory simples
4. **NÃO MODIFICAR** `affiliate_history` - deve ser preservado sempre (append-only)
5. **NÃO USAR** prefixo `[membership:affiliate]` no job - usar o nome do job

---

## Dev Notes

### Contexto do Negócio
- **Janela de Atribuição:** 14 dias (modelo "último clique expira")
- **Comissão:** Afiliado só recebe se usuário pagar dentro de 14 dias do clique
- **Histórico:** Preservado para auditoria (nunca deletar)
- **Job Schedule:** 00:30 BRT (entre kick-expired 00:01 e track-results 02:00)

### isAffiliateValid - JÁ EXISTE (NÃO CRIAR)

```
Localização: bot/services/memberService.js:1657
Exportada: Sim (linha 1726)
Funcionamento: Retorna true se affiliate_clicked_at < 14 dias, false caso contrário
```

A função já foi implementada na Story 18.1. Será usada na Story 18.3 para validar afiliados antes de gerar link de pagamento.

### Nova Função: clearExpiredAffiliates

```javascript
/**
 * Clear expired affiliate attributions (clicked > 14 days ago)
 * Story 18.2: Lógica de Expiração de Atribuição
 *
 * @returns {Promise<{success: boolean, data?: {cleared: number}, error?: object}>}
 */
async function clearExpiredAffiliates() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Find members with expired affiliates
    const { data: expired, error: selectError } = await supabase
      .from('members')
      .select('id, telegram_id, affiliate_code')
      .not('affiliate_code', 'is', null)
      .lt('affiliate_clicked_at', cutoffDate.toISOString());

    if (selectError) {
      logger.error('[membership:check-affiliate-expiration] clearExpiredAffiliates: select error', {
        error: selectError.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: selectError.message } };
    }

    if (!expired || expired.length === 0) {
      logger.info('[membership:check-affiliate-expiration] clearExpiredAffiliates: no expired affiliates found');
      return { success: true, data: { cleared: 0 } };
    }

    // Clear affiliate_code and affiliate_clicked_at (preserve history)
    const ids = expired.map((m) => m.id);
    const { error: updateError } = await supabase
      .from('members')
      .update({
        affiliate_code: null,
        affiliate_clicked_at: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (updateError) {
      logger.error('[membership:check-affiliate-expiration] clearExpiredAffiliates: update error', {
        error: updateError.message,
        count: ids.length,
      });
      return { success: false, error: { code: 'DB_ERROR', message: updateError.message } };
    }

    logger.info('[membership:check-affiliate-expiration] clearExpiredAffiliates: cleared expired affiliates', {
      count: expired.length,
      affiliateCodes: expired.map((m) => m.affiliate_code),
    });

    return { success: true, data: { cleared: expired.length } };
  } catch (err) {
    logger.error('[membership:check-affiliate-expiration] clearExpiredAffiliates: unexpected error', {
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

**Adicionar ao module.exports em memberService.js:**
```javascript
  // Story 18.2: Affiliate expiration
  clearExpiredAffiliates,
```

### Template do Job

```javascript
/**
 * Job: Check Affiliate Expiration - Clear expired affiliate attributions
 * Story 18.2: Lógica de Expiração de Atribuição
 *
 * Clears affiliate_code and affiliate_clicked_at for members whose
 * last affiliate click was more than 14 days ago.
 * Preserves affiliate_history (never deleted).
 *
 * Run: node bot/jobs/membership/check-affiliate-expiration.js
 * Schedule: 00:30 BRT daily
 */
require('dotenv').config();

const logger = require('../../../lib/logger');
const { clearExpiredAffiliates } = require('../../services/memberService');

const JOB_NAME = 'check-affiliate-expiration';

// Lock to prevent concurrent runs (in-memory, same process)
let jobRunning = false;

/**
 * Run the check-affiliate-expiration job
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function runCheckAffiliateExpiration() {
  if (jobRunning) {
    logger.warn(`[membership:${JOB_NAME}] Job already running, skipping`);
    return { success: false, error: { code: 'JOB_ALREADY_RUNNING' } };
  }

  jobRunning = true;
  const startTime = Date.now();

  try {
    logger.info(`[membership:${JOB_NAME}] Starting job`);

    const result = await clearExpiredAffiliates();

    if (!result.success) {
      logger.error(`[membership:${JOB_NAME}] Job failed`, { error: result.error });
      return result;
    }

    const duration = Date.now() - startTime;
    logger.info(`[membership:${JOB_NAME}] Job completed`, {
      duration,
      cleared: result.data.cleared,
    });

    return {
      success: true,
      data: {
        cleared: result.data.cleared,
        duration,
      },
    };
  } catch (err) {
    logger.error(`[membership:${JOB_NAME}] Unexpected error`, { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  } finally {
    jobRunning = false;
  }
}

// CLI execution
if (require.main === module) {
  runCheckAffiliateExpiration()
    .then((result) => {
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runCheckAffiliateExpiration };
```

### Modificações em server.js

**1. Adicionar import (após linha 176, junto com outros jobs de membership):**
```javascript
const { runCheckAffiliateExpiration } = require('./jobs/membership/check-affiliate-expiration');
```

**2. Adicionar schedule (após kick-expired ~linha 276, ANTES de track-results):**
```javascript
// Check affiliate expiration - 00:30 São Paulo (Story 18.2)
cron.schedule('30 0 * * *', async () => {
  logger.info('[scheduler] Running check-affiliate-expiration job');
  try {
    await withExecutionLogging('check-affiliate-expiration', runCheckAffiliateExpiration);
  } catch (err) {
    logger.error('[check-affiliate-expiration] Scheduler error', { error: err.message });
  }
}, { timezone: TZ });
```

**3. Atualizar console output (ordem cronológica):**
```javascript
console.log('   00:01 - Kick expired members (membership)');
console.log('   00:30 - Check affiliate expiration (membership)'); // NOVO
console.log('   02:00 - Track results');
```

**Nota:** `withExecutionLogging` vem de `./services/jobExecutionService` (já importado no arquivo).

---

## Project Structure Notes

### Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `bot/jobs/membership/check-affiliate-expiration.js` | Novo job de expiração |
| `__tests__/jobs/membership/check-affiliate-expiration.test.js` | Testes do job |

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/memberService.js` | Adicionar `clearExpiredAffiliates()` + export |
| `bot/server.js` | Adicionar import (linha ~176) e schedule (após linha ~276) |
| `__tests__/services/memberService.test.js` | Adicionar testes para `clearExpiredAffiliates` |

### Schedule Completo de Jobs

| Horário | Job | Módulo |
|---------|-----|--------|
| 00:01 BRT | kick-expired | membership |
| **00:30 BRT** | **check-affiliate-expiration** | **membership (NOVO)** |
| 02:00 BRT | track-results | betting |
| 03:00 BRT | reconciliation | membership |
| 08:00 BRT | enrich-odds + request-links | betting |
| 09:00 BRT | trial-reminders + link-reminders | membership |
| 10:00 BRT | renewal-reminders + post-bets | membership + betting |
| */5 min | health-check | system |
| */30 seg | process-webhooks | membership |

---

## Verificação de setAffiliateCode com Null

A função `setAffiliateCode()` (implementada em 18.1) já suporta membros com campos null:
- Quando `affiliate_code` é null, sobrescreve com novo código
- Quando `affiliate_clicked_at` é null, define novo timestamp
- `affiliate_history` faz append independente do estado anterior

**Verificar no código:** `bot/services/memberService.js` - função `setAffiliateCode()`

---

## Intelligence da Story 18.1

### Learnings Relevantes

1. **Migration:** Número 012 (sequencial)
2. **Trial de Afiliado:** 2 dias (config.membership.affiliateTrialDays)
3. **Logging:** Prefixo do job para consistência
4. **Testes:** 32 testes criados (18 memberService + 14 startCommand)

### Padrões Obrigatórios

**Service Response Pattern:**
```javascript
return { success: true, data: { cleared: 5 } };
return { success: false, error: { code: 'DB_ERROR', message: '...' } };
```

**Lock Pattern (in-memory):**
```javascript
let jobRunning = false;
// No início: if (jobRunning) return;
// jobRunning = true;
// finally: jobRunning = false;
```

---

## References

- **PRD Afiliados:** `_bmad-output/planning-artifacts/prd-afiliados.md` - FR6, FR7, FR8
- **Epic 18:** `_bmad-output/planning-artifacts/epics-afiliados.md` - Story 18.2
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md` - ADR-003
- **Story 18.1:** `_bmad-output/implementation-artifacts/18-1-tracking-afiliados-entrada.md`
- **isAffiliateValid:** `bot/services/memberService.js:1657` (JÁ EXISTE)
- **Padrão de Job:** `bot/jobs/membership/kick-expired.js` (referência)

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementação sem erros

### Completion Notes List

- Implementada função `clearExpiredAffiliates()` em memberService.js (linhas 1685-1755)
- Criado job `check-affiliate-expiration.js` com lock in-memory e logging consistente
- Registrado schedule 00:30 BRT em server.js entre kick-expired e track-results
- Verificado que `setAffiliateCode()` já suporta campos null (renovação funciona)
- Criados 7 testes para `clearExpiredAffiliates` e 8 testes para o job (total 15 testes)
- Todos os 562 testes passando
- `affiliate_history` nunca é modificado (preservado sempre)

### Code Review Fixes Applied

- **H1 Fixed:** Adicionado teste para verificar que membros não expirados não são afetados (Task 5.2)
- **M1 Fixed:** Implementado batch processing (500 IDs por vez) para evitar limites Supabase
- **M2 Fixed:** Documentado edge case de affiliate_code sem affiliate_clicked_at no JSDoc
- **L1 Fixed:** Removido logging de affiliate codes (privacidade) - agora loga apenas count e batches
- **L2 Fixed:** Adicionado comentário sobre comportamento NULL no código

### Change Log

- 2026-01-19: Story 18.2 implementada - Sistema de expiração de afiliados após 14 dias
- 2026-01-19: Code review fixes - batch processing, testes adicionais, privacidade de logs

### File List

**Criados:**
- `bot/jobs/membership/check-affiliate-expiration.js`
- `__tests__/jobs/membership/check-affiliate-expiration.test.js`

**Modificados:**
- `bot/services/memberService.js` (adicionado clearExpiredAffiliates + export)
- `bot/server.js` (adicionado import + schedule 00:30 + console output)
- `__tests__/services/memberService.test.js` (adicionados 5 testes para clearExpiredAffiliates)

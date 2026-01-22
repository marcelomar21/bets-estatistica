# Story 16.3: Implementar Processamento Assíncrono de Webhooks

Status: done

---

## Story

As a sistema,
I want processar eventos de pagamento do Cakto,
So that membros sejam ativados/desativados automaticamente.

---

## Acceptance Criteria

### AC1: Job process-webhooks rodando periodicamente

**Given** job process-webhooks configurado para rodar a cada 30 segundos via setInterval
**When** eventos com status 'pending' existem na tabela webhook_events
**Then** processa até 10 eventos por execução em ordem de criação (created_at ASC)
**And** atualiza status para 'processing' durante execução
**And** atualiza status para 'completed' após sucesso
**And** incrementa attempts e atualiza last_error em caso de falha

### AC2: Processamento de evento purchase_approved

**Given** evento `purchase_approved` recebido
**When** processado pelo handler
**Then** busca membro pelo email do payload ou cria novo membro como 'ativo'
**And** atualiza status do membro para 'ativo' (se era trial)
**And** registra cakto_subscription_id e cakto_customer_id
**And** registra payment_method (pix/boleto/cartao_recorrente)
**And** registra subscription_started_at = NOW() e subscription_ends_at = NOW() + 30 dias

### AC3: Processamento de evento subscription_renewed

**Given** evento `subscription_renewed` recebido
**When** processado pelo handler
**Then** atualiza last_payment_at = NOW()
**And** recalcula subscription_ends_at = NOW() + 30 dias
**And** se status era 'inadimplente', muda para 'ativo'

### AC4: Processamento de eventos de cancelamento

**Given** evento `subscription_renewal_refused` ou `subscription_canceled` recebido
**When** processado pelo handler
**Then** muda status do membro para 'inadimplente' (se era ativo)
**And** registra que membro deve ser removido (kicked_at = NULL permite kick no próximo job)

### AC5: Retry com limite de tentativas

**Given** evento com attempts >= max_attempts (5)
**When** job tenta processar
**Then** muda status do evento para 'failed'
**And** envia alerta para admin via webhookProcessingAlert()

### AC6: Lock em memória para evitar processamento concorrente

**Given** job process-webhooks iniciado
**When** outro job já está processando (mesmo processo)
**Then** pula execução imediatamente
**And** loga "Process webhooks already running, skipping"

### AC7: Recovery de eventos stuck em 'processing'

**Given** evento com status 'processing' há mais de 5 minutos
**When** job inicia
**Then** reseta status para 'pending' e incrementa attempts
**And** loga warning sobre evento stuck

---

## Tasks / Subtasks

- [x] Task 1: Criar bot/jobs/membership/process-webhooks.js (AC: #1, #6, #7)
  - [x] 1.1: Implementar lock em memória (pattern de healthCheck.js:38)
  - [x] 1.2: Implementar função runProcessWebhooks() principal
  - [x] 1.3: Query eventos 'pending' com LIMIT 10, ORDER BY created_at ASC
  - [x] 1.4: Implementar recovery de eventos 'processing' há > 5 min
  - [x] 1.5: Loop de processamento com update status 'processing' → 'completed'/'failed'
  - [x] 1.6: Chamar handler apropriado via WEBHOOK_HANDLERS registry
  - [x] 1.7: Logar com prefixo [membership:process-webhooks]

- [x] Task 2: Criar bot/services/webhookProcessors.js com handlers por evento (AC: #2, #3, #4)
  - [x] 2.1: Implementar WEBHOOK_HANDLERS registry
  - [x] 2.2: Implementar handlePurchaseApproved(payload) - ativa membro
  - [x] 2.3: Implementar handleSubscriptionCreated(payload) - registra assinatura
  - [x] 2.4: Implementar handleSubscriptionRenewed(payload) - renova +30 dias
  - [x] 2.5: Implementar handleRenewalRefused(payload) - marca inadimplente
  - [x] 2.6: Implementar handleSubscriptionCanceled(payload) - marca inadimplente
  - [x] 2.7: Retornar sempre { success, data/error } (Service Response Pattern)

- [x] Task 3: Atualizar memberService.js com funções auxiliares (AC: #2, #3, #4)
  - [x] 3.1: **CRIAR** getMemberByEmail(email) - nova função seguindo pattern existente
  - [x] 3.2: **CRIAR** activateMember(memberId, subscriptionData) - trial→ativo
  - [x] 3.3: **CRIAR** renewMemberSubscription(memberId) - atualiza datas
  - [x] 3.4: **CRIAR** markMemberAsDefaulted(memberId) - ativo→inadimplente

- [x] Task 4: Atualizar alertService.js com alerta específico (AC: #5)
  - [x] 4.1: **CRIAR** webhookProcessingAlert(eventId, eventType, error, attempts)
  - [x] 4.2: Usar debounce pattern de healthCheck.js:46 (canSendAlert)

- [x] Task 5: Integrar no scheduler em bot/server.js (AC: #1)
  - [x] 5.1: Importar runProcessWebhooks em setupScheduler()
  - [x] 5.2: Adicionar setInterval(runProcessWebhooks, 30000) - não usar cron (sub-minuto)
  - [x] 5.3: Logar início do interval no console

- [x] Task 6: Criar testes unitários
  - [x] 6.1: Testar cada handler individualmente
  - [x] 6.2: Testar retry logic e max_attempts
  - [x] 6.3: Testar lock em memória (concorrência)
  - [x] 6.4: Testar recovery de eventos stuck

---

## Dev Notes

### Aprendizados das Stories 16.1 e 16.2 (CRÍTICO)

| Aprendizado | Aplicação |
|-------------|-----------|
| Service Response Pattern | Todos handlers retornam `{ success, data/error }` |
| Optimistic Locking | Usar `.eq('status', currentStatus)` em updates |
| Logger com prefixo | `[membership:process-webhooks]` |
| Testes DB_ERROR | Cobrir casos de falha de banco |
| HMAC já validado | Story 16.2 garantiu - eventos chegam seguros |

### Lock em Memória (NÃO usar banco)

```javascript
// Pattern de healthCheck.js:38 - USAR ESTE
let processWebhooksRunning = false;

async function runProcessWebhooks() {
  if (processWebhooksRunning) {
    logger.debug('[membership:process-webhooks] Already running, skipping');
    return { success: true, skipped: true };
  }
  processWebhooksRunning = true;

  try {
    return await _processWebhooksInternal();
  } finally {
    processWebhooksRunning = false;
  }
}
```

**Por que não usar lock no banco?** O job roda no mesmo processo Node.js. Lock em memória é suficiente e mais simples. Lock distribuído só seria necessário com múltiplas instâncias do server.

### Integração no Scheduler (server.js:117)

```javascript
// Dentro de setupScheduler() em bot/server.js
const { runProcessWebhooks } = require('./jobs/membership/process-webhooks');

// NÃO usar cron - node-cron não suporta intervalos sub-minuto
// USAR setInterval para 30 segundos
setInterval(async () => {
  try {
    await runProcessWebhooks();
  } catch (err) {
    logger.error('[membership:process-webhooks] Interval error', { error: err.message });
  }
}, 30000);

logger.info('Process webhooks interval started (every 30s)');
```

### Webhook Handler Registry

```javascript
// bot/services/webhookProcessors.js
const WEBHOOK_HANDLERS = {
  'purchase_approved': handlePurchaseApproved,
  'subscription_created': handleSubscriptionCreated,
  'subscription_renewed': handleSubscriptionRenewed,
  'subscription_renewal_refused': handleRenewalRefused,
  'subscription_canceled': handleSubscriptionCanceled
};

async function processWebhookEvent(event) {
  const handler = WEBHOOK_HANDLERS[event.event_type];
  if (!handler) {
    return {
      success: false,
      error: { code: 'UNKNOWN_EVENT_TYPE', message: `Unknown: ${event.event_type}` }
    };
  }
  return handler(event.payload);
}
```

### Event Processing Flow

```
1. setInterval chama runProcessWebhooks() a cada 30s
2. Check lock em memória - se running, skip
3. Query: SELECT * FROM webhook_events
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 10
4. Recovery: UPDATE status = 'pending' WHERE status = 'processing'
             AND updated_at < NOW() - INTERVAL '5 minutes'
5. Para cada evento:
   a. UPDATE status = 'processing'
   b. handler = WEBHOOK_HANDLERS[event_type]
   c. result = await handler(payload)
   d. if (result.success):
        UPDATE status = 'completed', processed_at = NOW()
      else:
        UPDATE attempts += 1, last_error = result.error.message
        if (attempts >= 5):
          UPDATE status = 'failed'
          await webhookProcessingAlert(...)
6. Return { processed: N, failed: M }
```

### Novas Funções em memberService.js

```javascript
// CRIAR - não existe ainda
async function getMemberByEmail(email) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('email', email)
    .single();
  // ... seguir pattern de getMemberByTelegramId
}

async function activateMember(memberId, { subscriptionId, customerId, paymentMethod }) {
  // 1. Validar transição com canTransition('trial', 'ativo')
  // 2. Update com optimistic locking
  // 3. Setar subscription_started_at, subscription_ends_at, cakto_*
}

async function renewMemberSubscription(memberId) {
  // 1. Update last_payment_at = NOW()
  // 2. Update subscription_ends_at = NOW() + 30 days
  // 3. Se inadimplente, transicionar para ativo
}

async function markMemberAsDefaulted(memberId) {
  // 1. Validar transição com canTransition('ativo', 'inadimplente')
  // 2. Update status = 'inadimplente'
}
```

### Nova Função em alertService.js

```javascript
// CRIAR - seguir pattern de apiErrorAlert (linha 13)
async function webhookProcessingAlert(eventId, eventType, errorMessage, attempts) {
  // Usar debounce: canSendAlert(`webhook_${eventId}`)
  return alertAdmin(
    'ERROR',
    `Webhook ${eventType} falhou após ${attempts} tentativas`,
    `Evento ${eventId}: ${errorMessage}\n\nVerifique logs e reprocesse manualmente se necessário.`
  );
}
```

### Payload Structure do Cakto (ASSUMIDO - verificar documentação)

```javascript
// Estrutura assumida - confirmar com API Cakto antes de implementar
{
  event_id: 'evt_123',
  event_type: 'purchase_approved',
  data: {
    subscriber: {
      email: 'user@example.com',
      name: 'User Name'
    },
    subscription: {
      id: 'sub_123',
      customer_id: 'cus_123',
      status: 'active',
      payment_method: 'credit_card', // ou 'pix', 'boleto'
      current_period_end: '2026-02-17T00:00:00Z'
    }
  }
}
```

### Error Codes

| Code | Quando usar |
|------|-------------|
| `UNKNOWN_EVENT_TYPE` | event_type não reconhecido |
| `MEMBER_NOT_FOUND` | Membro não encontrado para update |
| `INVALID_PAYLOAD` | Payload do evento mal formatado |
| `INVALID_MEMBER_STATUS` | Transição de estado inválida |

### Project Structure

**Arquivos a CRIAR:**
```
bot/
├── jobs/
│   └── membership/
│       └── process-webhooks.js   # Job principal (NOVO)
└── services/
    └── webhookProcessors.js      # Handlers por evento (NOVO)
```

**Arquivos a ATUALIZAR:**
```
bot/
├── server.js                     # Adicionar setInterval em setupScheduler()
└── services/
    ├── memberService.js          # Adicionar 4 novas funções
    └── alertService.js           # Adicionar webhookProcessingAlert()
```

### References

- [Pattern: bot/jobs/healthCheck.js:38 - Lock em memória]
- [Pattern: bot/jobs/healthCheck.js:46 - canSendAlert debounce]
- [Pattern: bot/services/alertService.js:13 - apiErrorAlert]
- [Pattern: bot/services/memberService.js:126 - updateMemberStatus com optimistic locking]
- [Pattern: bot/server.js:117 - setupScheduler()]
- [Source: architecture.md#ADR-001: Processamento de Webhooks Cakto]
- [Learnings: 16-1-criar-infraestrutura-membros-state-machine.md]
- [Learnings: 16-2-criar-webhook-server-event-sourcing.md]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 236 tests pass (43 new tests for this story, including 5 from code review)

### Completion Notes List

- **Task 1**: Criado `bot/jobs/membership/process-webhooks.js` com lock em memória, recovery de eventos stuck, e batch processing de até 10 eventos
- **Task 2**: Criado `bot/services/webhookProcessors.js` com handlers para 5 tipos de eventos Cakto (purchase_approved, subscription_created, subscription_renewed, subscription_renewal_refused, subscription_canceled)
- **Task 3**: Adicionado 5 novas funções em memberService.js (getMemberByEmail, activateMember, renewMemberSubscription, markMemberAsDefaulted, createActiveMember)
- **Task 4**: Adicionado webhookProcessingAlert() em alertService.js para alertas de falha
- **Task 5**: Integrado setInterval de 30s no scheduler em server.js
- **Task 6**: Criados 38 testes unitários cobrindo handlers, retry logic, lock, e recovery

### File List

**Novos:**
- `bot/jobs/membership/process-webhooks.js` - Job principal de processamento
- `bot/services/webhookProcessors.js` - Handlers de eventos webhook
- `__tests__/services/webhookProcessors.test.js` - Testes dos handlers (28 testes)
- `__tests__/jobs/processWebhooks.test.js` - Testes do job (10 testes)

**Modificados:**
- `bot/services/memberService.js` - +5 funções auxiliares (~360 linhas adicionadas)
- `bot/services/alertService.js` - +webhookProcessingAlert() (~25 linhas)
- `bot/server.js` - +setInterval para process-webhooks (~15 linhas)

---

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5 | **Date:** 2026-01-18

### Review Summary
- **Issues Found:** 2 HIGH, 4 MEDIUM, 2 LOW
- **Issues Fixed:** 6 (all HIGH and MEDIUM)
- **Tests Added:** 5 new tests (236 total passing)

### Issues Fixed

| Severity | Issue | Fix |
|----------|-------|-----|
| HIGH | webhookProcessingAlert sem debounce (AC5 violation) | Adicionado `canSendWebhookAlert()` com cache e debounce de 5min |
| HIGH | createActiveMember não trata email duplicado | Adicionado check para error.code === '23505' retornando MEMBER_ALREADY_EXISTS |
| MEDIUM | Falta teste para handleSubscriptionCreated | Adicionado teste verificando delegação para handlePurchaseApproved |
| MEDIUM | Falta teste para handleSubscriptionCanceled | Adicionados 2 testes verificando delegação e comportamento skip |
| MEDIUM | extractEmail não valida formato | Adicionado isValidEmail() com regex básico |
| MEDIUM | renewMemberSubscription aceita trial | Documentado como comportamento esperado (retorna INVALID_MEMBER_STATUS) |

### Files Modified During Review

- `bot/services/alertService.js` - +canSendWebhookAlert debounce function
- `bot/services/memberService.js` - +unique constraint handling in createActiveMember
- `bot/services/webhookProcessors.js` - +isValidEmail validation
- `__tests__/services/webhookProcessors.test.js` - +5 new tests

### Outcome
✅ **APPROVED** - All HIGH and MEDIUM issues resolved

---

## Change Log

- 2026-01-18: Code Review aprovado - 6 issues corrigidos, 5 testes adicionados
- 2026-01-17: Implementação completa da Story 16.3 - Processamento Assíncrono de Webhooks


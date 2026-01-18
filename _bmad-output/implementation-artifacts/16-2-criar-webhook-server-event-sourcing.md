# Story 16.2: Criar Webhook Server com Event Sourcing

Status: done

---

## Story

As a sistema,
I want receber webhooks do Cakto de forma segura e confiável,
So that nunca perca eventos de pagamento.

---

## Acceptance Criteria

### AC1: Express Server com Segurança

**Given** Express server configurado na porta 3001
**When** request POST recebido em /webhooks/cakto
**Then** aplica rate limiting (100 req/min por IP)
**And** rejeita payloads > 1MB com status 413
**And** valida assinatura HMAC-SHA256 do header
**And** se assinatura inválida, retorna 401

### AC2: Event Sourcing Assíncrono

**Given** webhook com assinatura válida recebido
**When** processado pelo handler
**Then** salva evento raw na tabela `webhook_events` com status 'pending'
**And** responde 200 imediatamente (< 200ms)
**And** NÃO processa o evento síncronamente

### AC3: Idempotência

**Given** evento já recebido anteriormente (mesmo idempotency_key)
**When** webhook duplicado chega
**Then** retorna 200 sem criar novo registro
**And** loga como "duplicate webhook ignored"

### AC4: Health Check

**Given** servidor iniciado
**When** GET /health chamado
**Then** retorna { status: 'ok', port: 3001 }

---

## Tasks / Subtasks

- [x] Task 1: Criar bot/webhook-server.js (AC: #1, #4)
  - [x] 1.1: Setup Express com helmet para security headers
  - [x] 1.2: Configurar express-rate-limit (100 req/min por IP)
  - [x] 1.3: Configurar express.json com limit 1MB
  - [x] 1.4: Implementar GET /health retornando { status: 'ok', port: 3001 }
  - [x] 1.5: Rotear POST /webhooks/cakto para handler
  - [x] 1.6: Iniciar server na porta CAKTO_WEBHOOK_PORT (3001)

- [x] Task 2: Criar bot/handlers/caktoWebhook.js (AC: #1, #2, #3)
  - [x] 2.1: Implementar middleware validateHmacSignature com crypto.timingSafeEqual
  - [x] 2.2: Implementar handler principal que salva evento em webhook_events
  - [x] 2.3: Implementar idempotência via idempotency_key (upsert ou check)
  - [x] 2.4: Responder 200 imediatamente após salvar
  - [x] 2.5: Logar com prefixo [cakto:webhook]
  - [x] 2.6: Retornar 401 para assinatura inválida

- [x] Task 3: Criar testes unitários (AC: #1, #2, #3, #4)
  - [x] 3.1: Testar validação HMAC (válido e inválido)
  - [x] 3.2: Testar rate limiting
  - [x] 3.3: Testar idempotência (duplicata)
  - [x] 3.4: Testar health check
  - [x] 3.5: Testar rejeição de payload > 1MB

---

## Dev Notes

### Aprendizados da Story 16.1 (CRÍTICO)

- **Service Response Pattern**: Sempre retornar `{ success: true, data }` ou `{ success: false, error: { code, message } }`
- **Optimistic Locking**: Usar `.eq('status', currentStatus)` para prevenir race conditions
- **Testes completos**: Cobrir casos de erro DB, não apenas happy path
- **Logger com prefixo**: Usar `[module:action]` ex: `[cakto:webhook]`
- **Índices parciais**: Usar WHERE clause em índices quando apropriado

### Webhook Processing Pattern (de project-context.md)

```javascript
// ✅ SEMPRE processar webhooks de forma assíncrona
// 1. Validar HMAC
// 2. Salvar evento raw
// 3. Responder 200 IMEDIATAMENTE
// 4. Processar via job async (Story 16.3)

app.post('/webhooks/cakto', validateSignature, async (req, res) => {
  const { event_id, event_type, data } = req.body;

  // Salvar imediatamente (idempotente)
  await supabase.from('webhook_events').insert({
    idempotency_key: event_id,
    event_type,
    payload: data,
    status: 'pending'
  });

  // Responder rápido
  res.status(200).json({ received: true });
});
```

### HMAC Validation Pattern

```javascript
const crypto = require('crypto');

function validateHmacSignature(req, res, next) {
  const signature = req.headers['x-cakto-signature'];
  const secret = process.env.CAKTO_WEBHOOK_SECRET;

  if (!signature || !secret) {
    logger.warn('[cakto:webhook] Missing signature or secret');
    return res.status(401).json({ error: 'WEBHOOK_INVALID_SIGNATURE' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // CRÍTICO: Usar timingSafeEqual para prevenir timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    logger.warn('[cakto:webhook] Invalid signature', { received: signature });
    return res.status(401).json({ error: 'WEBHOOK_INVALID_SIGNATURE' });
  }

  next();
}
```

### Idempotência com Upsert

```javascript
// Usar ON CONFLICT para idempotência
const { data, error } = await supabase
  .from('webhook_events')
  .upsert(
    {
      idempotency_key: eventId,
      event_type: eventType,
      payload: payload,
      status: 'pending'
    },
    { onConflict: 'idempotency_key', ignoreDuplicates: true }
  )
  .select()
  .single();

// Se ignoreDuplicates: true, data será null para duplicata
if (!data) {
  logger.info('[cakto:webhook] duplicate webhook ignored', { eventId });
}
```

### Project Structure Notes

**Arquivos a criar:**
```
bot/
├── webhook-server.js           # Express server :3001 (NOVO)
└── handlers/
    └── caktoWebhook.js         # Handler + HMAC validation (NOVO)

__tests__/
└── handlers/
    └── caktoWebhook.test.js    # Testes (NOVO)
```

**Padrões do projeto:**
- Server principal (Telegram): porta 3000 via `bot/server.js`
- Webhook server (Cakto): porta 3001 via `bot/webhook-server.js` (SEPARADO)
- Usar `lib/supabase.js` para acesso ao banco
- Usar `lib/logger.js` para logs
- Usar `lib/config.js` para configurações

### Environment Variables Necessárias

```bash
CAKTO_WEBHOOK_SECRET=   # Secret para validar HMAC
CAKTO_WEBHOOK_PORT=3001 # Porta do webhook server
```

### Tabela webhook_events (já criada em 16.1)

```sql
-- Campos disponíveis:
id SERIAL PRIMARY KEY,
idempotency_key TEXT UNIQUE NOT NULL,  -- event_id do Cakto
event_type TEXT NOT NULL,               -- purchase_approved, etc
payload JSONB NOT NULL,                 -- Dados completos
status TEXT DEFAULT 'pending',          -- pending, processing, completed, failed
attempts INT DEFAULT 0,
max_attempts INT DEFAULT 5,
last_error TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
processed_at TIMESTAMPTZ
```

### Error Codes para Webhook

| Code | Quando usar |
|------|-------------|
| `WEBHOOK_INVALID_SIGNATURE` | HMAC inválido |
| `WEBHOOK_DUPLICATE` | Evento já processado |
| `WEBHOOK_PAYLOAD_TOO_LARGE` | Payload > 1MB |

### Dependências (já instaladas - verificar package.json)

- `express` - Server HTTP
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting

### References

- [Source: project-context.md#Webhook Processing Pattern]
- [Source: project-context.md#Membership Error Codes]
- [Source: project-context.md#New Membership Files]
- [Source: epics.md#Story 16.2]
- [Pattern: bot/server.js - Express setup existente]
- [Learnings: 16-1-criar-infraestrutura-membros-state-machine.md#Senior Developer Review]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementação sem erros

### Completion Notes List

- ✅ Express server criado em bot/webhook-server.js na porta 3001
- ✅ Security headers via helmet
- ✅ Rate limiting configurado (100 req/min por IP)
- ✅ Payload limit 1MB com erro 413
- ✅ Health check GET /health retornando { status: 'ok', port }
- ✅ HMAC-SHA256 validation com crypto.timingSafeEqual (previne timing attacks)
- ✅ Handler assíncrono salva eventos em webhook_events com status 'pending'
- ✅ Idempotência via upsert com onConflict e ignoreDuplicates
- ✅ Logs com prefixo [cakto:webhook]
- ✅ 19 testes unitários criados e passando
- ✅ 193 testes totais passando (zero regressões)
- ✅ Dependências instaladas: helmet, express-rate-limit, supertest

### File List

- bot/webhook-server.js (novo)
- bot/handlers/caktoWebhook.js (novo)
- __tests__/handlers/caktoWebhook.test.js (novo)
- _bmad-output/project-context.md (atualizado)

---

## Senior Developer Review (AI)

**Review Date:** 2026-01-17
**Outcome:** Approved (after fixes)

### Issues Found & Fixed

| Severity | Issue | Fix Applied |
|----------|-------|-------------|
| MEDIUM | Security headers (helmet) não testados | Adicionado teste verificando headers x-content-type-options, x-frame-options |
| MEDIUM | rawBody pode falhar para non-JSON | Adicionada validação de payload vazio em HMAC validation |
| LOW | PORT retornado como string | Adicionado `parseInt()` para garantir tipo numérico |
| LOW | Teste rate limit com nome enganoso | Renomeado teste e adicionada verificação de headers ratelimit |
| LOW | project-context.md referenciava migrations erradas | Atualizado para 005_membership_tables.sql |

**Total: 5 issues encontrados, 5 corrigidos automaticamente**

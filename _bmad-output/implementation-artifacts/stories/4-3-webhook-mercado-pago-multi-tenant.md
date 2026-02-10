# Story 4.3: Webhook Mercado Pago Multi-tenant

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **sistema**,
I want processar webhooks de pagamento e assinatura identificando o grupo correto,
So that pagamentos e mudanças de status de cada influencer sejam creditados corretamente.

## Acceptance Criteria

1. **AC1: Validação HMAC em 100% das requisições**
   - Given Mercado Pago envia webhook
   - When o endpoint `/webhooks/mercadopago` recebe a requisição
   - Then valida assinatura HMAC via `x-signature` header (FR45, NFR-S3)
   - And requisições sem assinatura válida retornam 401
   - **NOTA:** Já implementado em `bot/handlers/mercadoPagoWebhook.js` — `validateSignature()` + `validateSignatureMiddleware()`. NÃO reimplementar.

2. **AC2: Identificação do grupo via preapproval_plan_id**
   - Given webhook contém dados de pagamento/assinatura
   - When o processador busca detalhes na API do MP
   - Then identifica o grupo corruzando `preapproval_plan_id` da assinatura com `groups.mp_plan_id` (FR46)
   - And se `preapproval_plan_id` não encontrado, tenta `external_reference` como fallback
   - And se nenhum grupo encontrado, loga warning e processa como single-tenant (fallback para `config.telegram.publicGroupId`)
   - And valida que o grupo existe e tem `status = 'active'`

3. **AC3: Pagamento aprovado → membro ativo com group_id**
   - Given evento `payment.approved` ou `subscription_authorized_payment.approved`
   - When membro é encontrado e pagamento validado
   - Then atualiza membro para `status = 'active'` com `paid_until` (FR47, FR48)
   - And a busca de membro filtra por `group_id` (multi-tenant isolation)
   - And se membro não encontrado no grupo, busca por email sem filtro + valida grupo
   - **NOTA:** A lógica de ativação (`activateMember`, `renewMemberSubscription`, `markMemberAsDefaulted`, `reactivateRemovedMember`) já existe em `memberService.js`. A mudança é adicionar `group_id` na resolução e passá-lo para as operações.

4. **AC4: Assinatura cancelada/expirada → membro expired**
   - Given evento `subscription_preapproval` com status `cancelled`
   - When o processador identifica o membro
   - Then marca membro como `removido` (via `markMemberAsRemoved`)
   - And kick do grupo Telegram usa o `telegram_group_id` do grupo correto (NÃO `config.telegram.publicGroupId`)
   - And mensagem de despedida usa `checkout_url` do grupo correto

5. **AC5: Audit log de todos os eventos**
   - Given qualquer evento de webhook é processado
   - When o processamento completa (sucesso ou falha)
   - Then registra log com: evento, membro, `group_id`, valor, timestamp
   - And `webhook_events` armazena `group_id` para rastreabilidade por tenant
   - **NOTA:** `webhook_events` já existe. Adicionar coluna `group_id` via migration.

6. **AC6: Idempotência de webhooks duplicados**
   - Given webhook duplicado (mesmo `idempotency_key`)
   - When o endpoint recebe a requisição
   - Then ignora sem erro, retorna 200
   - **NOTA:** Já implementado via `upsert` com `ignoreDuplicates` em `handleWebhook()`. NÃO reimplementar.

7. **AC7: Retry automático até 3→5 tentativas**
   - Given processamento de evento falha
   - When job roda novamente (a cada 30s)
   - Then re-tenta evento com status `pending` e `attempts < MAX_ATTEMPTS` (NFR-R5, NFR-I5)
   - **NOTA:** Já implementado em `bot/jobs/membership/process-webhooks.js` com `MAX_ATTEMPTS: 5`. NÃO reimplementar.

8. **AC8: Notificação admin multi-tenant**
   - Given pagamento processado com sucesso
   - When notificação admin é enviada
   - Then envia para o `telegram_admin_group_id` do grupo correto
   - And inclui nome do grupo na notificação
   - And mantém fallback para `config.telegram.adminGroupId` se grupo não tiver admin group

## Tasks / Subtasks

- [x] Task 1: Migration para adicionar `group_id` em `webhook_events` (AC: #5)
  - [x] 1.1 Criar migration `026_webhook_events_group_id.sql`: `ALTER TABLE webhook_events ADD COLUMN group_id UUID REFERENCES groups(id)`
  - [x] 1.2 Adicionar índice: `CREATE INDEX idx_webhook_events_group_id ON webhook_events(group_id)`
  - [x] 1.3 NÃO adicionar NOT NULL — webhooks pré-existentes não terão group_id

- [x] Task 2: Implementar resolução de grupo no webhookProcessors (AC: #2)
  - [x] 2.1 Criar função `resolveGroupFromSubscription(subscriptionData)` que:
    - Extrai `preapproval_plan_id` da assinatura (campo na API do MP)
    - Busca `groups` onde `mp_plan_id = preapproval_plan_id`
    - Fallback: `external_reference` do checkout
    - Retorna `{ success, data: { groupId, group } }` ou fallback single-tenant
  - [x] 2.2 Criar função `resolveGroupFromPayment(paymentData)` que:
    - Se tem `preapproval_id`, chama `resolveGroupFromSubscription`
    - Se não, tenta via `point_of_interaction.transaction_data.subscription_id` → busca assinatura → resolve grupo
    - Fallback: single-tenant
  - [x] 2.3 Integrar resolução de grupo em `handleSubscriptionCreated()`, `handlePaymentApproved()`, `handlePaymentRejected()`, `handleSubscriptionCancelled()`

- [x] Task 3: Adaptar busca de membro para multi-tenant (AC: #3)
  - [x] 3.1 Em `handlePaymentApproved()`: após resolver grupo, buscar membro com filtro `group_id`
  - [x] 3.2 Em `handleSubscriptionCreated()`: vincular membro ao grupo correto via `group_id` no `createTrialMemberMP()`
  - [x] 3.3 Em `handlePaymentRejected()`: buscar membro com `group_id`
  - [x] 3.4 Em `handleSubscriptionCancelled()`: buscar membro com `group_id` e usar `telegram_group_id` do grupo para kick

- [x] Task 4: Adaptar `handleSubscriptionCancelled` para multi-tenant (AC: #4)
  - [x] 4.1 Usar `group.telegram_group_id` em vez de `config.telegram.publicGroupId` para kick
  - [x] 4.2 Usar `group.checkout_url` em vez de `process.env.MP_CHECKOUT_URL` para mensagem de despedida
  - [x] 4.3 Se grupo não encontrado, fallback graceful para single-tenant

- [x] Task 5: Adaptar notificações admin para multi-tenant (AC: #8)
  - [x] 5.1 Em `notifyAdminPayment()`: aceitar `groupId` como parâmetro
  - [x] 5.2 Buscar `telegram_admin_group_id` do grupo na tabela `groups`
  - [x] 5.3 Incluir nome do grupo na mensagem de notificação
  - [x] 5.4 Fallback para `config.telegram.adminGroupId` se grupo não configurado

- [x] Task 6: Salvar `group_id` no webhook_events (AC: #5)
  - [x] 6.1 Após resolver grupo no processamento, atualizar `webhook_events` com `group_id`
  - [x] 6.2 Update via `supabase.from('webhook_events').update({ group_id }).eq('id', eventId)`
  - [x] 6.3 Passar `eventId` para os handlers para que possam atualizar

- [x] Task 7: Testes cobrindo fluxo multi-tenant (AC: #1-#8)
  - [x] 7.1 Testar: webhook recebido → grupo resolvido via `mp_plan_id` → membro ativado no grupo correto
  - [x] 7.2 Testar: assinatura cancelada → kick no grupo correto (não no publicGroupId)
  - [x] 7.3 Testar: pagamento de grupo desconhecido → fallback single-tenant
  - [x] 7.4 Testar: notificação admin enviada para `telegram_admin_group_id` do grupo
  - [x] 7.5 Testar: `webhook_events` recebe `group_id` após processamento
  - [x] 7.6 Testar: membro buscado com filtro `group_id` (isolamento multi-tenant)
  - [x] 7.7 Testar: grupo inativo → rejeita processamento com log
  - [x] 7.8 Testar: idempotência continua funcionando (não quebrou)

## Dev Notes

### Contexto Crítico: Infraestrutura EXISTE, Falta Multi-tenant

**Esta story NÃO é para criar o webhook do zero.** Toda a infraestrutura já existe e funciona em modo single-tenant. O trabalho é **adaptar para multi-tenant** adicionando resolução de grupo em cada handler.

**Arquivos existentes que implementam o webhook:**

| Arquivo | Responsabilidade | Mudança Necessária |
|---------|------------------|--------------------|
| `bot/handlers/mercadoPagoWebhook.js` | Recebe webhook, valida HMAC, salva em `webhook_events` | **NENHUMA** — já funciona |
| `bot/webhook-server.js` | Express server na porta 3001 com rate limiting | **NENHUMA** — já funciona |
| `bot/services/webhookProcessors.js` | Processa eventos: subscription/payment → membro | **PRINCIPAL** — adicionar resolução de grupo |
| `bot/services/mercadoPagoService.js` | Cliente API do MP (getSubscription, getPayment) | **NENHUMA** — já funciona |
| `bot/services/memberService.js` | CRUD de membros, state machine | **MÍNIMA** — queries já filtram por group_id (Story 3.1) |
| `bot/jobs/membership/process-webhooks.js` | Job a cada 30s, batch processing, retry | **MÍNIMA** — passar eventId para handlers |

### Fluxo Atual (Single-tenant)

```
MP envia webhook
    │
    ▼
webhook-server.js (port 3001)
    │ POST /webhooks/mercadopago
    │ validateSignatureMiddleware
    │
    ▼
mercadoPagoWebhook.js → handleWebhook()
    │ Salva em webhook_events (status: pending)
    │ Retorna 200 imediato
    │
    ▼ (a cada 30s)
process-webhooks.js → runProcessWebhooks()
    │ Busca events pending, marca processing
    │
    ▼
webhookProcessors.js → processWebhookEvent()
    │
    ├─ subscription_preapproval created → handleSubscriptionCreated()
    │     └─ Busca membro por email/payerId ← ⚠️ SEM group_id
    │
    ├─ payment/subscription_authorized_payment approved → handlePaymentApproved()
    │     └─ Busca membro por subscription/email ← ⚠️ SEM group_id
    │
    ├─ payment rejected → handlePaymentRejected()
    │     └─ Busca membro por subscription/email ← ⚠️ SEM group_id
    │
    └─ subscription_preapproval cancelled → handleSubscriptionCancelled()
          └─ Busca membro por subscription ← ⚠️ SEM group_id
          └─ Kick usa config.telegram.publicGroupId ← ⚠️ HARDCODED
          └─ Farewell usa process.env.MP_CHECKOUT_URL ← ⚠️ HARDCODED
```

### Fluxo Desejado (Multi-tenant)

```
MP envia webhook
    │
    ▼
webhook-server.js (port 3001) — SEM MUDANÇA
    │
    ▼
mercadoPagoWebhook.js → handleWebhook() — SEM MUDANÇA
    │ Salva em webhook_events (group_id NULL por enquanto)
    │
    ▼ (a cada 30s)
process-webhooks.js → runProcessWebhooks()
    │ Passa eventId para handlers
    │
    ▼
webhookProcessors.js → processWebhookEvent()
    │
    │ ┌─────────────────────────────────────────┐
    │ │ NOVO: resolveGroupFromSubscription()     │
    │ │ ou resolveGroupFromPayment()             │
    │ │                                          │
    │ │ subscription.preapproval_plan_id          │
    │ │          ↓                                │
    │ │ SELECT * FROM groups                      │
    │ │ WHERE mp_plan_id = preapproval_plan_id    │
    │ │          ↓                                │
    │ │ { groupId, group }                        │
    │ └─────────────────────────────────────────┘
    │
    ├─ handleSubscriptionCreated(payload, groupId)
    │     └─ createTrialMemberMP({ ..., groupId })
    │
    ├─ handlePaymentApproved(payload, payment, groupId)
    │     └─ getMemberBySubscription(subId, groupId) ✅
    │     └─ activateMember(id, { ..., groupId }) ✅
    │
    ├─ handlePaymentRejected(payload, payment, groupId)
    │     └─ getMemberBySubscription(subId, groupId) ✅
    │
    └─ handleSubscriptionCancelled(payload, groupId)
          └─ Kick usa group.telegram_group_id ✅
          └─ Farewell usa group.checkout_url ✅
          └─ notifyAdmin usa group.telegram_admin_group_id ✅
    │
    ▼
    UPDATE webhook_events SET group_id = resolvedGroupId
```

### Como Resolver o Grupo a Partir do Webhook

O Mercado Pago envia webhook com `data.id` que é o ID do recurso (assinatura ou pagamento). A resolução segue:

1. **Para `subscription_preapproval`**: `data.id` = subscription ID
   - Chamar `mercadoPagoService.getSubscription(subscriptionId)`
   - Resposta contém `preapproval_plan_id` (que é o `mp_plan_id` no nosso DB)
   - Buscar: `SELECT * FROM groups WHERE mp_plan_id = preapproval_plan_id`

2. **Para `subscription_authorized_payment`**: `data.id` = authorized payment ID
   - Chamar `mercadoPagoService.getAuthorizedPayment(paymentId)`
   - Resposta contém `preapproval_id` (subscription ID)
   - Com subscription ID, buscar subscription → `preapproval_plan_id` → grupo

3. **Para `payment`**: `data.id` = payment ID
   - Chamar `mercadoPagoService.getPayment(paymentId)`
   - Resposta pode ter `point_of_interaction.transaction_data.subscription_id`
   - Com subscription ID, seguir fluxo acima

**Campo-chave na API do MP:** `preapproval_plan_id` na subscription (preapproval)
**Campo-chave no nosso DB:** `groups.mp_plan_id` (renomeado na Migration 025)

### Padrões Obrigatórios

1. **Service Response Pattern:** `{ success: true/false, data/error }` em todos os services
2. **Logging:** `logger.info/warn/error` com contexto — NUNCA `console.log`
3. **Multi-tenant:** Toda query com `group_id` — ver `memberService.js` (Story 3.1 já adaptou)
4. **State Machine:** Transições validadas via `canTransition()` em `memberService.js`
5. **Error Codes:** `MEMBER_NOT_FOUND`, `MEMBER_ALREADY_EXISTS`, `GROUP_NOT_FOUND`, `GROUP_INACTIVE`
6. **Naming:** camelCase JS, snake_case DB
7. **Supabase:** Sempre via `lib/supabase.js` — NUNCA instanciar cliente novo

### Funções Existentes no memberService que JÁ suportam group_id

Story 3.1 já adaptou o `memberService.js` para multi-tenant. As funções relevantes:
- `getMemberByEmail(email)` — busca sem group_id (global) — **pode precisar overload com groupId**
- `getMemberBySubscription(subscriptionId)` — busca por `mp_subscription_id` — **verificar se filtra group_id**
- `getMemberByPayerId(payerId)` — busca por `mp_payer_id`
- `createTrialMemberMP({ email, subscriptionId, payerId, couponCode })` — **já recebe group_id?** Verificar.
- `activateMember(memberId, opts)` — opera por ID, não precisa group_id
- `renewMemberSubscription(memberId)` — opera por ID
- `markMemberAsDefaulted(memberId)` — opera por ID
- `markMemberAsRemoved(memberId, reason)` — opera por ID

**Ação necessária:** Verificar no código se `getMemberBySubscription` e `createTrialMemberMP` aceitam/filtram `group_id`. Se não, adaptar.

### Dados do MP — Campos Relevantes da API

**Subscription (Preapproval):**
```json
{
  "id": "abc123",
  "preapproval_plan_id": "plan_xyz",  // ← CHAVE para resolver grupo
  "payer_email": "user@example.com",
  "payer_id": 12345,
  "status": "authorized" | "cancelled" | "pending",
  "external_reference": "group_id_or_custom"
}
```

**Authorized Payment:**
```json
{
  "id": 999,
  "preapproval_id": "abc123",  // ← subscription ID
  "status": "processed",
  "payment": { "status": "approved", "id": 888 }
}
```

**Payment:**
```json
{
  "id": 888,
  "status": "approved",
  "payer": { "email": "...", "id": 12345 },
  "transaction_amount": 50.00,
  "point_of_interaction": {
    "transaction_data": {
      "subscription_id": "abc123"  // ← subscription ID (nem sempre presente)
    }
  }
}
```

### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `preapproval_plan_id` ausente na API do MP | Não consegue resolver grupo | Fallback: `external_reference` ou single-tenant |
| Mesmo email em múltiplos grupos | Membro ativado no grupo errado | Sempre resolver grupo ANTES de buscar membro |
| Migration 026 em prod | Downtime se mal executada | `ADD COLUMN` sem NOT NULL é non-blocking no PostgreSQL |
| Webhook de plano antigo (pré-migration 025) | `mp_plan_id` incompatível | Fallback single-tenant para webhooks sem grupo resolvido |
| Race condition no processamento | Dois events do mesmo membro processados simultaneamente | `processWebhooksRunning` lock já existe + optimistic locking no DB |

### Learnings da Story 4.2

- **Trial fixo de 7 dias** alinhado ao Preapproval Plan do MP
- **`checkout_url`** vem do `init_point` do Preapproval Plan (Story 4.1)
- **Testes de fluxo com mocks** — padrão estabelecido em `__tests__/handlers/memberEvents.story42.test.js`
- **408/408 green** na suite após Story 4.1 review (verificar se mantém)
- **Env vars**: `MP_ACCESS_TOKEN` (bot), `MERCADO_PAGO_ACCESS_TOKEN` (admin-panel)

### Learnings da Story 4.1

- Migration 025 renomeou `mp_product_id` → `mp_plan_id` e limpou valores legados
- Preapproval Plan cria `checkout_url` via `init_point` da API MP
- ADR-005: Não usar retry automático em POST que cria recursos no MP
- Idempotência via check de `mp_plan_id` no DB antes de chamar MP

### Git Intelligence

**Commits recentes:**
```
10d7c22 fix(story-4.2): apply code review fixes and finalize status
14eb953 Merge pull request #25 (story 4.1)
ca30a6d feat(admin): implement recurring subscription via Mercado Pago preapproval plan (story 4.1)
```

**Branch naming:** `feature/story-4.3-webhook-mercado-pago-multi-tenant`
**Commit pattern:** `feat(bot): description (story 4.3)`

### Project Structure Notes

- Esta story afeta primariamente o **bot** (`bot/services/webhookProcessors.js`)
- SQL migration nova em `sql/migrations/026_webhook_events_group_id.sql`
- Admin panel NÃO é modificado
- Testes em `__tests__/services/webhookProcessors.test.js` (verificar se existe) ou criar novo

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.3]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Multi-tenant RLS, Webhook Processing]
- [Source: _bmad-output/planning-artifacts/prd.md - FR44-49, NFR-S3, NFR-R5, NFR-P2]
- [Source: bot/handlers/mercadoPagoWebhook.js - HMAC validation, event saving]
- [Source: bot/services/webhookProcessors.js - Event processing, member state changes]
- [Source: bot/services/mercadoPagoService.js - MP API client]
- [Source: bot/services/memberService.js - State machine, CRUD operations]
- [Source: bot/jobs/membership/process-webhooks.js - Async processing, retry logic]
- [Source: bot/webhook-server.js - Express server port 3001]
- [Source: sql/migrations/025_groups_mp_plan_id.sql - mp_plan_id rename]
- [Source: stories/4-2-boas-vindas-e-registro-com-status-trial.md - Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 + GPT-5 Codex (code review fixes)

### Debug Log References

- RED phase: 13 tests failed (expected) — new story43 test file before implementation
- GREEN phase: 749/749 tests passing, 0 regressions (baseline was 735)
- Review-fix phase: 65/65 tests passing em suites-alvo (`webhookProcessors`, `process-webhooks`, integração de fluxo)

### Completion Notes List

- `getMemberBySubscription()` in memberService.js was the only member function that did NOT accept groupId — adapted with optional `groupId` parameter following the same `resolveGroupId()` pattern used by `getMemberByEmail`, `getMemberByPayerId`, etc.
- `process-webhooks.js` processEvent() now passes `event.id` as `eventId` to `processWebhookEvent()` for AC5 group_id tracking
- Existing webhookProcessors.test.js required: supabase mock (for group resolution), getAuthorizedPayment mock, getMemberByPayerId mock, and mercadoPagoService.getSubscription mocks for subscription cancelled tests
- Integration test (webhookProcessingFlow.test.js) required default `getSubscription` mock in beforeEach since payment handlers now call `resolveGroupFromPayment` which fetches subscription for group resolution
- Handler signatures changed: `handlePaymentApproved(payload, eventContext, paymentData)` and `handlePaymentRejected(payload, eventContext, paymentData)` — backward compatible via defaults
- Code review fix: `resolveGroupFromSubscription()` agora aplica fallback via `external_reference` (extraindo `group_id`) quando `preapproval_plan_id` está ausente/inválido
- Code review fix: `processWebhookEvent()` agora trata `subscription_preapproval` com status/ação `expired` no mesmo fluxo de cancelamento
- Code review fix: `handlePaymentApproved()` agora tenta fallback por email sem filtro de tenant e valida `group_id` antes de usar o membro retornado
- Code review fix: `updateWebhookEventGroupId()` agora valida erro do update em `webhook_events` (antes podia logar sucesso silencioso mesmo sem persistência)
- Code review fix: lock otimista de `process-webhooks` reforçado para reduzir corrida entre workers (skip quando lock não é adquirido)

### Implementation Notes

- Group resolution uses `preapproval_plan_id → groups.mp_plan_id` mapping (AC2), com fallback `external_reference → groups.id` para rastreabilidade por tenant
- All handlers accept `eventContext = {}` parameter with `eventId` for webhook_events tracking
- `buildNotifyContext(group)` helper extracts `adminGroupId`, `groupName`, `groupId` from resolved group
- Non-critical failures in `updateWebhookEventGroupId` are logged as warnings, not thrown — preserves webhook processing reliability
- Inactive groups are filtered by the DB query `.eq('status', 'active')`, not by post-query validation
- Fallback de busca de membro por email em `handlePaymentApproved()` agora valida grupo resolvido para evitar atribuição cruzada entre tenants
- `subscription_preapproval` com status `expired` agora é tratado como cancelamento para remover membro e manter consistência de acesso

### File List

| File | Action | Description |
|------|--------|-------------|
| `sql/migrations/026_webhook_events_group_id.sql` | Created | Migration: adds nullable `group_id UUID` column + index to `webhook_events` |
| `bot/services/webhookProcessors.js` | Modified | Main change: added group resolution, multi-tenant handlers, admin notifications, webhook_events tracking + post-review fixes (`external_reference` fallback, `expired` handling, global email fallback validation) |
| `bot/services/memberService.js` | Modified | Added optional `groupId` parameter to `getMemberBySubscription()` |
| `bot/jobs/membership/process-webhooks.js` | Modified | Pass `eventId` to `processWebhookEvent()` for AC5 tracking + stronger optimistic lock handling in processing step |
| `__tests__/services/webhookProcessors.story43.test.js` | Created/Modified | Story 4.3 suite expanded with `external_reference` fallback, `expired` routing, and strict assertion for `webhook_events.group_id` update |
| `__tests__/services/webhookProcessors.test.js` | Modified | Added supabase mock, getAuthorizedPayment mock, updated handler assertions for new signatures + new tests for global email fallback/tenant validation and `expired` routing |
| `__tests__/integration/membership/webhookProcessingFlow.test.js` | Modified | Added default `getSubscription` mock for `resolveGroupFromPayment` compatibility |

### Change Log

- **Story 4.3 implementation**: Adapted single-tenant Mercado Pago webhook processing to multi-tenant by adding group resolution via `preapproval_plan_id → groups.mp_plan_id`. Each handler now resolves the target group, passes `groupId` to member service operations, kicks from group-specific Telegram group, sends farewell with group-specific checkout URL, and notifies group-specific admin group. Added `group_id` column to `webhook_events` for per-tenant audit trail.
- **Code review fixes applied (post-review)**: Implemented fallback de resolução de grupo por `external_reference`, adicionou tratamento de assinatura `expired`, reforçou fallback de lookup por email com validação de tenant, validou erro no update de `webhook_events.group_id` e fortaleceu lock otimista no job `process-webhooks`. Cobertura de testes ampliada para os cenários críticos.

# Story 16.1: Criar Infraestrutura de Membros e State Machine

Status: done

---

## Story

As a sistema,
I want ter tabelas de membros e validação de transições de estado,
So that possa gerenciar o ciclo de vida dos membros.

---

## Acceptance Criteria

### AC1: Migration de Tabelas

**Given** migration executada no Supabase
**When** tabelas criadas
**Then** estrutura inclui:
  - `members` com campos: id, telegram_id, telegram_username, email, status, cakto_subscription_id, cakto_customer_id, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at, payment_method, last_payment_at, kicked_at, created_at, updated_at
  - `member_notifications` com campos: id, member_id, type, channel, sent_at, message_id
  - `webhook_events` com campos: id, idempotency_key, event_type, payload, status, attempts, max_attempts, last_error, created_at, processed_at
**And** índices criados para consultas frequentes

### AC2: Função canTransition

**Given** função `canTransition(currentStatus, newStatus)` implementada
**When** chamada com transição válida (ex: trial → ativo)
**Then** retorna true
**And** quando chamada com transição inválida (ex: removido → ativo)
**Then** retorna false

### AC3: Função updateMemberStatus

**Given** função `updateMemberStatus(memberId, newStatus)` chamada
**When** transição é válida
**Then** atualiza status e updated_at
**And** quando transição é inválida
**Then** retorna erro com código INVALID_MEMBER_STATUS

---

## Tasks / Subtasks

- [x] Task 1: Criar migration 005_membership_tables.sql (AC: #1)
  - [x] 1.1: Criar tabela `members` com todos os campos especificados
  - [x] 1.2: Criar tabela `member_notifications` com FK para members
  - [x] 1.3: Criar tabela `webhook_events` para event sourcing
  - [x] 1.4: Adicionar índices para consultas frequentes
  - [x] 1.5: Adicionar CHECK constraints para status válidos
  - [x] 1.6: Adicionar comentários em cada tabela/coluna

- [x] Task 2: Criar bot/services/memberService.js (AC: #2, #3)
  - [x] 2.1: Definir constante VALID_TRANSITIONS com state machine
  - [x] 2.2: Implementar função canTransition(currentStatus, newStatus)
  - [x] 2.3: Implementar função updateMemberStatus(memberId, newStatus)
  - [x] 2.4: Implementar função getMemberById(memberId)
  - [x] 2.5: Implementar função getMemberByTelegramId(telegramId)
  - [x] 2.6: Seguir Service Response Pattern

- [x] Task 3: Testar migrations e service (AC: #1, #2, #3)
  - [x] 3.1: Criar testes unitários para memberService.js
  - [x] 3.2: Validar canTransition com transições válidas e inválidas
  - [x] 3.3: Validar updateMemberStatus com INVALID_MEMBER_STATUS

---

## Dev Notes

### Member State Machine

```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

**Transições Válidas:**
| De | Para | Trigger |
|----|------|---------|
| `trial` | `ativo` | `purchase_approved` webhook |
| `trial` | `removido` | Trial expirado (dia 8) |
| `ativo` | `inadimplente` | `subscription_renewal_refused` webhook |
| `ativo` | `removido` | `subscription_canceled` webhook |
| `inadimplente` | `ativo` | `subscription_renewed` webhook |
| `inadimplente` | `removido` | Após período de cobrança |

### Constante VALID_TRANSITIONS

```javascript
const VALID_TRANSITIONS = {
  trial: ['ativo', 'removido'],
  ativo: ['inadimplente', 'removido'],
  inadimplente: ['ativo', 'removido'],
  removido: []  // Estado final
};
```

### Project Structure Notes

**Arquivos a criar:**
```
sql/migrations/
└── 005_membership_tables.sql   # Nova migration (próximo número)

bot/services/
└── memberService.js            # Novo service
```

**Padrões a seguir (de betService.js):**
- Importar `{ supabase }` de `../../lib/supabase`
- Importar `logger` de `../../lib/logger`
- Retornar sempre `{ success: true, data: ... }` ou `{ success: false, error: { code, message } }`
- Usar `logger.info/warn/error` com contexto JSON

**Padrões de migration (de 004_add_odds_update_history.sql):**
- Usar `CREATE TABLE IF NOT EXISTS`
- Adicionar COMMENT ON TABLE e COMMENT ON COLUMN
- Criar índices com `CREATE INDEX IF NOT EXISTS`
- Usar naming: snake_case para tabelas/colunas

### Membership Error Codes

| Code | Quando usar |
|------|-------------|
| `MEMBER_NOT_FOUND` | Membro não existe no banco |
| `MEMBER_ALREADY_EXISTS` | Telegram ID já cadastrado |
| `INVALID_MEMBER_STATUS` | Transição de estado inválida |

### References

- [Source: project-context.md#Member State Machine]
- [Source: project-context.md#Membership Error Codes]
- [Source: project-context.md#Service Response Pattern]
- [Source: epics.md#Story 16.1]
- [Pattern: bot/services/betService.js - Service Response Pattern]
- [Pattern: sql/migrations/004_add_odds_update_history.sql - Migration pattern]

---

## Schema Detalhado

### Tabela: members

```sql
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido')),
  cakto_subscription_id TEXT,
  cakto_customer_id TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'cartao_recorrente')),
  last_payment_at TIMESTAMPTZ,
  kicked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### Tabela: member_notifications

```sql
CREATE TABLE IF NOT EXISTS member_notifications (
  id SERIAL PRIMARY KEY,
  member_id INT REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('trial_reminder', 'renewal_reminder', 'welcome', 'farewell', 'payment_received')),
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'email')),
  sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  message_id TEXT
);
```

### Tabela: webhook_events

```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMPTZ
);
```

### Índices

```sql
-- members
CREATE INDEX idx_members_telegram_id ON members(telegram_id);
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_trial_ends ON members(trial_ends_at) WHERE status = 'trial';
CREATE INDEX idx_members_subscription_ends ON members(subscription_ends_at) WHERE status = 'ativo';

-- member_notifications
CREATE INDEX idx_notifications_member ON member_notifications(member_id);
CREATE INDEX idx_notifications_type_date ON member_notifications(member_id, type, sent_at DESC);

-- webhook_events
CREATE INDEX idx_webhook_status ON webhook_events(status);
CREATE INDEX idx_webhook_pending ON webhook_events(status, created_at) WHERE status = 'pending';
```

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementação sem erros

### Completion Notes List

- ✅ Migration 005_membership_tables.sql criada com 3 tabelas (members, member_notifications, webhook_events)
- ✅ Todos os índices criados para performance (9 índices - inclui cakto_subscription)
- ✅ CHECK constraints para status e payment_method
- ✅ Trigger para updated_at automático
- ✅ memberService.js implementado com VALID_TRANSITIONS state machine
- ✅ canTransition() valida transições de estado
- ✅ updateMemberStatus() com optimistic locking (previne race conditions)
- ✅ updateMemberStatus() retorna INVALID_MEMBER_STATUS e RACE_CONDITION
- ✅ getMemberById() e getMemberByTelegramId() com Service Response Pattern
- ✅ createTrialMember() e getTrialDaysRemaining() como bônus
- ✅ 34 testes unitários criados e passando
- ✅ 174 testes totais passando (zero regressões)

### File List

- sql/migrations/005_membership_tables.sql (novo)
- bot/services/memberService.js (novo)
- __tests__/services/memberService.test.js (novo)

---

## Senior Developer Review (AI)

**Review Date:** 2026-01-17
**Outcome:** Approved (after fixes)

### Issues Found & Fixed

| Severity | Issue | Fix Applied |
|----------|-------|-------------|
| MEDIUM | `member_notifications.member_id` permitia NULL | Adicionado `NOT NULL` |
| MEDIUM | Falta índice em `cakto_subscription_id` | Adicionado `idx_members_cakto_subscription` |
| MEDIUM | Race condition em `updateMemberStatus` | Implementado optimistic locking com `.eq('status', currentStatus)` |
| LOW | `updated_at` redundante no update | Removido (trigger cuida) |
| LOW | Testes não cobriam DB_ERROR e RACE_CONDITION | Adicionados 2 novos testes |
| LOW | `canTransition` não logava same-status | Adicionado log debug |

**Total: 6 issues encontrados, 6 corrigidos automaticamente**

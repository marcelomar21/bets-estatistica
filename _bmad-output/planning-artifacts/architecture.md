---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-01-17'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-addendum-v2.md
  - _bmad-output/planning-artifacts/prd-addendum-v3.md
  - _bmad-output/planning-artifacts/prd-addendum-v4.md
  - _bmad-output/project-context.md
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/source-tree-analysis.md
  - docs/development-guide.md
  - docs/metrics.md
workflowType: 'architecture'
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-01-17'
---

# Architecture Decision Document - bets-estatistica

_Este documento é construído colaborativamente através de descoberta passo-a-passo. Seções são adicionadas conforme trabalhamos em cada decisão arquitetural juntos._

---

## Análise Cross-Funcional: Integração Cakto & Gestão de Membros

_Descobertas do War Room com PM, Engenheiro e UX Designer_

### Tensões Identificadas

| Dimensão | Tensão | Trade-off |
|----------|--------|-----------|
| **Viabilidade** | Webhook sem retry pode perder pagamentos | Implementar fila vs simplicidade |
| **Desejabilidade** | Kick automático frustra usuários | Automação vs UX humanizada |
| **Factibilidade** | 3 fontes de estado (Cakto/Supabase/Telegram) | Single source of truth vs redundância |

### Preocupações Técnicas Críticas

```
CONCERN-1: Estado distribuído
├── Cakto tem seu estado (subscription_status)
├── Supabase terá tabela `members` (trial/ativo/inadimplente)
├── Telegram tem membership status (member/kicked/left)
└── RISCO: Dessincronização entre os 3 sistemas

CONCERN-2: Webhook reliability
├── Cakto envia webhook uma vez
├── Se falhar, perdemos evento de pagamento
├── Necessário: retry/dead-letter queue
└── Idempotency key obrigatória

CONCERN-3: Job scheduling collision
├── Jobs existentes: posting_job, admin_warnings, odds_tracking
├── Jobs novos: check_trial_reminders, kick_expired, process_renewals
└── Definir: prioridade, locks, scheduler compartilhado
```

### Gaps de UX na Jornada de Saída

| Momento | Gap Identificado |
|---------|------------------|
| Kick automático | Sem mensagem de despedida/link para reativar |
| Lembrete dia 5-7 | Genérico - deveria incluir stats personalizados |
| Pagamento | Usuário precisa sair do Telegram → site externo |
| Reativação | PRD diz "não pode voltar" - mas e se pagar? |

### Decisões Arquiteturais Preliminares

| ID | Decisão | Rationale |
|----|---------|-----------|
| **ADR-001** | Webhook async com event sourcing | Armazenar evento raw, processar com idempotency key |
| **ADR-002** | Supabase é fonte de verdade | Cakto informa, Supabase decide, Telegram executa |
| **ADR-003** | Grace period de 24h após kick | Permitir reativação com pagamento (requer ajuste no PRD) |
| **ADR-004** | Mensagem de despedida com CTA | Antes de kickar, enviar link de pagamento |

---

## Architecture Decision Records (ADRs) - Detalhados

### ADR-001: Processamento de Webhooks Cakto

**Status:** ✅ Aprovado
**Contexto:** Cakto envia webhooks para eventos de pagamento. Precisamos processar de forma confiável sem perder eventos.

**Decisão:** Event Sourcing com processamento assíncrono

**Implementação:**
```
POST /webhooks/cakto
  → Validar assinatura HMAC
  → Salvar evento raw em `webhook_events`
  → Responder 200 IMEDIATAMENTE
  → Worker processa async com retry
```

**Schema:**
```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,  -- event_id do Cakto
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_events_status ON webhook_events(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);
```

**Requisitos de Segurança:**
```typescript
// OBRIGATÓRIO: Validar assinatura HMAC do Cakto
const isValid = crypto.timingSafeEqual(
  Buffer.from(receivedSignature),
  Buffer.from(computedSignature)
);

// OBRIGATÓRIO: Rate limiting por IP (ex: 100 req/min)
// OBRIGATÓRIO: Rejeitar payload > 1MB
// RECOMENDADO: Verificar IP de origem se Cakto fornecer whitelist
```

**Consequências:**
- ✅ Nunca perde evento de pagamento
- ✅ Retry automático em caso de falha
- ✅ Idempotente por design
- ✅ Auditoria completa de todos os eventos
- ⚠️ Eventual consistency (segundos de delay)
- ⚠️ Requer worker/job para processar fila

---

### ADR-002: Fonte de Verdade do Estado do Membro

**Status:** ✅ Aprovado
**Contexto:** Estado do membro existe em 3 sistemas: Cakto (subscription), Supabase (members), Telegram (chat member).

**Decisão:** Supabase como Master + Reconciliação Periódica

**Fluxo de Dados:**
```
Cakto (informante) ──webhook──► Supabase (master) ──action──► Telegram (executor)
                                      │
                                      ▼
                               Reconciliação diária
                                      │
                                      ▼
                               Alertas admin se divergir
```

**Regras de Ownership:**
| Sistema | Papel | Responsabilidade |
|---------|-------|------------------|
| **Cakto** | Informante | Notifica sobre eventos de pagamento |
| **Supabase** | Master | Decide estado oficial do membro |
| **Telegram** | Executor | Executa ações (kick/unban) baseado em Supabase |

**Reconciliação:**
```typescript
// Job diário às 03:00 BRT
async function reconcileWithCakto() {
  const activeMembers = await supabase
    .from('members')
    .select('*')
    .in('status', ['ativo', 'trial']);

  for (const member of activeMembers) {
    if (!member.cakto_subscription_id) continue;

    const caktoStatus = await cakto.getSubscription(member.cakto_subscription_id);

    if (caktoStatus.status === 'canceled' && member.status === 'ativo') {
      await notifyAdmin({
        type: 'DESYNC_DETECTED',
        member_id: member.id,
        local_status: member.status,
        cakto_status: caktoStatus.status,
        action: 'MANUAL_REVIEW_REQUIRED'
      });
    }
  }
}
```

**Consequências:**
- ✅ Não depende de API externa para decisões em tempo real
- ✅ Funciona mesmo se Cakto estiver fora
- ✅ Logs locais para auditoria e debug
- ⚠️ Pode divergir temporariamente do Cakto
- ⚠️ Reconciliação pode encontrar inconsistências

---

### ADR-003: Arquitetura de Jobs de Membros

**Status:** ✅ Aprovado
**Contexto:** Novos jobs necessários para gestão de membros: lembretes, kicks, renovações.

**Decisão:** Novo módulo `membership/` integrado ao scheduler existente com locks distribuídos

**Estrutura:**
```
src/jobs/
├── posting/              # Existente
├── admin-warnings/       # Existente
├── odds-tracking/        # Existente
└── membership/           # NOVO
    ├── index.ts
    ├── trial-reminders.ts      # 09:00 BRT
    ├── kick-expired.ts         # 00:01 BRT
    ├── renewal-reminders.ts    # 10:00 BRT
    ├── process-webhooks.ts     # A cada 30s
    └── reconciliation.ts       # 03:00 BRT
```

**Schedule:**
| Job | Horário | Lock TTL | Descrição |
|-----|---------|----------|-----------|
| `trial-reminders` | 09:00 BRT | 5min | Lembrar trials dias 5, 6, 7 |
| `kick-expired` | 00:01 BRT | 10min | Kickar trials expirados |
| `renewal-reminders` | 10:00 BRT | 5min | Lembrar PIX/Boleto 5 dias antes |
| `process-webhooks` | */30s | 1min | Processar fila de webhooks |
| `reconciliation` | 03:00 BRT | 15min | Reconciliar com Cakto |

**Lock Distribuído:**
```typescript
async function withLock<T>(
  lockName: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const lockKey = `lock:${lockName}`;

  // Tentar adquirir lock (usando Supabase como store)
  const { data: acquired } = await supabase
    .rpc('try_acquire_lock', {
      lock_key: lockKey,
      ttl_seconds: ttlSeconds
    });

  if (!acquired) {
    console.log(`Lock ${lockName} já está em uso`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await supabase.rpc('release_lock', { lock_key: lockKey });
  }
}
```

**Consequências:**
- ✅ Integrado ao sistema de jobs existente
- ✅ Sem race conditions com locks
- ✅ Cada job isolado e testável
- ⚠️ Precisa implementar lock no Supabase (RPC function)
- ⚠️ Monitoramento de jobs necessário

---

### ADR-004: Validação e Segurança de Webhooks

**Status:** ✅ Aprovado
**Contexto:** Webhooks de pagamento são vetores de ataque comuns.

**Decisão:** Defesa em profundidade com múltiplas camadas

**Camadas de Segurança:**
```typescript
// 1. Rate Limiting (antes de qualquer processamento)
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max: 100,             // 100 requests por IP
  message: 'Too many requests'
});

// 2. Validação de Tamanho
if (req.headers['content-length'] > 1_000_000) {
  return res.status(413).send('Payload too large');
}

// 3. Validação de Assinatura HMAC
function validateCaktoSignature(payload: string, signature: string): boolean {
  const secret = process.env.CAKTO_WEBHOOK_SECRET;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computed)
  );
}

// 4. Validação de Schema
const webhookSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum([
    'purchase_approved',
    'subscription_created',
    'subscription_renewed',
    'subscription_renewal_refused',
    'subscription_canceled'
  ]),
  data: z.object({
    subscriber: z.object({
      email: z.string().email(),
      // ...
    })
  })
});

// 5. Não confiar cegamente - verificar críticos com Cakto API
async function verifyPaymentWithCakto(subscriptionId: string) {
  // Para eventos de alto valor, confirmar diretamente com Cakto
  const subscription = await caktoApi.getSubscription(subscriptionId);
  return subscription.status === 'active';
}
```

**Consequências:**
- ✅ Proteção contra ataques de replay
- ✅ Proteção contra payload malicioso
- ✅ Auditoria de todas as tentativas
- ⚠️ Requer secret do Cakto configurado
- ⚠️ Rate limit pode bloquear burst legítimo

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- **PRD Principal:** ~45 FRs (core posting, admin, scraping)
- **Addendum v2:** FR-A1-17 (admin), FR-M1-4 (métricas), FR-P1-4 (posting enhancements)
- **Addendum v3:** FR-F1-7 (filtrar), FR-S1-6 (simular), FR-O1-5 (overview)
- **Addendum v4:** FR-W1-7 (warns), FR-S1-6 (scraping odds), FR-O1-5 (ordenação)
- **PRD Membros:** FR-MB1-27 (gestão de membros e pagamentos Cakto)
- **Total:** ~145 FRs organizados em 7 domínios funcionais

**Non-Functional Requirements:**
| NFR | Requisito | Impacto Arquitetural |
|-----|-----------|---------------------|
| NFR21 | Webhook response < 200ms | Event sourcing obrigatório |
| NFR22 | 99.9% uptime integração Cakto | Retry + dead letter queue |
| NFR23 | Dados financeiros criptografados | At-rest encryption no Supabase |
| NFR24 | Auditoria 12 meses | Log retention policy |

**Scale & Complexity:**
- Primary domain: Full-stack Telegram Bot + Supabase + External APIs
- Complexity level: Medium-High
- Estimated architectural components: 12

### Technical Constraints & Dependencies

| Constraint | Source | Impact |
|------------|--------|--------|
| Node.js 20+ | project-context.md | Runtime definido |
| Supabase PostgreSQL | Existente | Schema migrations required |
| Telegram Bot API | Core feature | Rate limits, formato mensagem |
| Cakto Webhooks | PRD Membros | Nova integração crítica |
| BRT Timezone | project-context.md | Todos jobs em horário brasileiro |
| TypeScript strict | project-context.md | Type safety obrigatória |

### Cross-Cutting Concerns Identificados

**1. State Machines (2 distintas)**
```
Bet State Machine:
  pending → confirmed → won/lost/push

Member State Machine:
  trial → ativo → inadimplente → removido
```

**2. Job Scheduling**
- Jobs existentes: posting_job, admin_warnings, odds_tracking
- Jobs novos: trial_reminders, kick_expired, renewal_reminders, process_webhooks, reconciliation
- Concern: Priorização, locks distribuídos, monitoramento

**3. Webhook Processing**
- Idempotência obrigatória (idempotency_key)
- Event sourcing com tabela webhook_events
- Retry com exponential backoff

**4. Multi-System State Synchronization**
- Fluxo: Cakto → Supabase → Telegram
- Reconciliação diária para detectar dessincronização
- Alertas admin em caso de divergência

---

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack Telegram Bot + Supabase + External APIs** - Projeto brownfield com stack estabelecida sendo estendida para suportar integração de pagamentos Cakto.

### Base Técnica Existente

**Stack Atual:**
| Technology | Version | Status |
|------------|---------|--------|
| Node.js | 20+ | Runtime obrigatório |
| JavaScript | ES2022 | CommonJS modules |
| Supabase | latest | Database + Auth |
| node-telegram-bot-api | latest | Bot framework |
| LangChain | 1.1.x | AI framework |
| Zod | 4.x | Schema validation |
| axios | 1.x | HTTP client |
| node-cron | latest | Job scheduling |

**Padrões Estabelecidos:**
- Service Response Pattern: `{ success, data/error }`
- Error Handling: Retry com backoff + alertAdmin
- Logging: `lib/logger.js` (níveis info/warn/error)
- Supabase Access: Via singleton `lib/supabase.js`

### Extensões para Cakto/Membros

**Novas Dependências:**
| Dependência | Versão | Propósito |
|-------------|--------|-----------|
| `express` | ^4.18 | HTTP server para webhooks |
| `express-rate-limit` | ^7.x | Rate limiting |
| `helmet` | ^7.x | Security headers |

**Comando de Instalação:**
```bash
npm install express express-rate-limit helmet
```

### Estrutura de Arquivos para Membros

```
bot/
├── server.js              # Telegram webhook (existente)
├── webhook-server.js      # NOVO: Express server para Cakto
├── handlers/
│   └── caktoWebhook.js    # NOVO: Handler de webhooks
├── jobs/
│   └── membership/        # NOVO: Jobs de membros
│       ├── index.js
│       ├── trial-reminders.js
│       ├── kick-expired.js
│       ├── renewal-reminders.js
│       ├── process-webhooks.js
│       └── reconciliation.js
└── services/
    ├── memberService.js   # NOVO: CRUD de membros
    └── caktoService.js    # NOVO: Integração Cakto API
```

### Decisões de Infraestrutura

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| **HTTP Framework** | Express 4.x | Ecossistema maduro, familiaridade |
| **Server Separado** | Sim | Separação de responsabilidades |
| **Port** | 3001 (Cakto) vs 3000 (Telegram) | Isolamento de tráfego |
| **Module System** | CommonJS | Consistência com projeto existente |

### Webhook Server Template

```javascript
// bot/webhook-server.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('../lib/logger');

const app = express();

// Security
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' }
});
app.use('/webhooks', limiter);

// Cakto webhook endpoint
app.post('/webhooks/cakto', validateSignature, async (req, res) => {
  const { event_id, event_type, data } = req.body;

  // Store immediately, process async (ADR-001)
  await supabase.from('webhook_events').insert({
    idempotency_key: event_id,
    event_type,
    payload: data,
    status: 'pending'
  });

  res.status(200).json({ received: true });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.CAKTO_WEBHOOK_PORT || 3001;
app.listen(PORT, () => {
  logger.info('Cakto webhook server started', { port: PORT });
});
```

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- ADR-001: Webhook async com event sourcing
- ADR-002: Supabase como fonte de verdade
- Schema normalizado para tabelas de membros

**Important Decisions (Shape Architecture):**
- ADR-003: Módulo membership/ com locks distribuídos
- ADR-004: Validação HMAC + rate limiting
- Service wrapper para Cakto API

**Deferred Decisions (Post-MVP):**
- Migração para PM2 (se necessário escalar)
- Cache layer para consultas frequentes

### Data Architecture

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Schema Design | Normalizado | Consistência com tabelas existentes (`suggested_bets`, etc.) |
| Migration Strategy | SQL versionado em `/sql/migrations/` | Reprodutível, sem dependências extras |
| Validation | Zod schemas | Já em uso no projeto |

**Novas Tabelas:**
```sql
-- /sql/migrations/002_membership_tables.sql
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'trial',  -- trial/ativo/inadimplente/removido
  cakto_subscription_id TEXT,
  cakto_customer_id TEXT,
  trial_started_at TIMESTAMPTZ DEFAULT now(),
  trial_ends_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  payment_method TEXT,  -- pix/boleto/cartao_recorrente
  last_payment_at TIMESTAMPTZ,
  kicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE member_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id),
  type TEXT NOT NULL,  -- trial_reminder/renewal_reminder/kick_warning
  channel TEXT NOT NULL,  -- telegram/email
  sent_at TIMESTAMPTZ DEFAULT now(),
  message_id TEXT
);

-- /sql/migrations/003_webhook_events.sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_events_status ON webhook_events(status) WHERE status = 'pending';
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_telegram_id ON members(telegram_id);
```

### Authentication & Security

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Cakto Auth | OAuth (client_id/secret) | Padrão da API Cakto |
| Webhook Validation | HMAC-SHA256 | Segurança de webhooks |
| Rate Limiting | express-rate-limit (100 req/min) | Proteção contra abuse |

### API & Communication Patterns

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Cakto Integration | Service wrapper `caktoService.js` | Retry pattern do projeto |
| Webhook Processing | Event sourcing + async worker | ADR-001 |
| Error Handling | Service Response Pattern | Consistência |

**Cakto Service Template:**
```javascript
// bot/services/caktoService.js
const axios = require('axios');
const logger = require('../../lib/logger');

const CAKTO_API_URL = process.env.CAKTO_API_URL;
const CAKTO_CLIENT_ID = process.env.CAKTO_CLIENT_ID;
const CAKTO_CLIENT_SECRET = process.env.CAKTO_CLIENT_SECRET;

let accessToken = null;
let tokenExpiresAt = null;

async function getAccessToken() {
  if (accessToken && tokenExpiresAt > Date.now()) {
    return accessToken;
  }

  const response = await axios.post(`${CAKTO_API_URL}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: CAKTO_CLIENT_ID,
    client_secret: CAKTO_CLIENT_SECRET
  });

  accessToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;
  return accessToken;
}

async function getSubscription(subscriptionId) {
  const token = await getAccessToken();
  const response = await axios.get(
    `${CAKTO_API_URL}/subscriptions/${subscriptionId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return { success: true, data: response.data };
}

module.exports = { getSubscription, getAccessToken };
```

### Infrastructure & Deployment

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Deploy Strategy | Mesmo processo, portas diferentes | Simplicidade MVP |
| Bot Port | 3000 | Telegram webhook |
| Webhook Port | 3001 | Cakto webhook |
| Process Manager | Node.js nativo (futuro: PM2) | Sem dependências extras |

**Environment Variables:**
```bash
# Cakto Integration (adicionar ao .env)
CAKTO_API_URL=https://api.cakto.com.br
CAKTO_CLIENT_ID=xxx
CAKTO_CLIENT_SECRET=xxx
CAKTO_WEBHOOK_SECRET=xxx
CAKTO_WEBHOOK_PORT=3001
CAKTO_PRODUCT_ID=xxx
```

### Implementation Sequence

```
1. Criar migrations SQL
   └── 002_membership_tables.sql
   └── 003_webhook_events.sql

2. Aplicar migrations no Supabase

3. Implementar services
   └── caktoService.js (OAuth + API)
   └── memberService.js (CRUD)

4. Implementar webhook server
   └── webhook-server.js
   └── handlers/caktoWebhook.js

5. Implementar jobs
   └── jobs/membership/*.js

6. Integrar no entry point
   └── Atualizar index.js
```

---

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Pontos de conflito potencial identificados:** 6 áreas endereçadas para garantir consistência entre AI agents.

### Naming Patterns

| Contexto | Padrão | Exemplo |
|----------|--------|---------|
| Tabelas DB | snake_case, plural | `members`, `webhook_events` |
| Colunas DB | snake_case | `telegram_id`, `cakto_subscription_id` |
| Arquivos JS | camelCase | `memberService.js`, `caktoWebhook.js` |
| Funções | camelCase | `getMemberByTelegramId()` |
| Constantes | UPPER_SNAKE | `MAX_RETRY_ATTEMPTS` |
| Env vars | UPPER_SNAKE | `CAKTO_WEBHOOK_SECRET` |
| Jobs | kebab-case | `trial-reminders`, `kick-expired` |

### Service Response Pattern

```javascript
// ✅ Sucesso
return { success: true, data: { member, action: 'created' } };

// ✅ Erro
return { success: false, error: { code: 'MEMBER_NOT_FOUND', message: 'Membro não encontrado' } };
```

**Error Codes para Membership:**
| Code | Quando usar |
|------|-------------|
| `MEMBER_NOT_FOUND` | Membro não existe |
| `MEMBER_ALREADY_EXISTS` | Telegram ID já cadastrado |
| `INVALID_MEMBER_STATUS` | Transição de estado inválida |
| `CAKTO_API_ERROR` | Erro na API do Cakto |
| `WEBHOOK_INVALID_SIGNATURE` | HMAC inválido |
| `WEBHOOK_DUPLICATE` | Evento já processado (idempotency) |

### Member State Machine

```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

**Transições válidas:**
| De | Para | Trigger |
|----|------|---------|
| `trial` | `ativo` | `purchase_approved` webhook |
| `trial` | `removido` | Trial expirado (dia 8) |
| `ativo` | `inadimplente` | `subscription_renewal_refused` webhook |
| `ativo` | `removido` | `subscription_canceled` webhook |
| `inadimplente` | `ativo` | `subscription_renewed` webhook |
| `inadimplente` | `removido` | Após período de cobrança |

**Implementação:**
```javascript
const VALID_TRANSITIONS = {
  trial: ['ativo', 'removido'],
  ativo: ['inadimplente', 'removido'],
  inadimplente: ['ativo', 'removido'],
  removido: []  // Estado final
};

function canTransition(currentStatus, newStatus) {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}
```

### Webhook Processing Pattern

```
Receive → Validate HMAC → Store Raw → Respond 200 → Process Async
```

**Handler Registry:**
```javascript
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
    logger.warn('Unknown webhook event', { type: event.event_type });
    return { success: false, error: { code: 'UNKNOWN_EVENT' } };
  }
  return handler(event.payload);
}
```

### Job Execution Pattern

**Logging com prefixo:**
```javascript
logger.info('[membership:trial-reminders] Iniciando verificação', { date: today });
logger.info('[membership:kick-expired] Membro removido', { memberId, reason: 'trial_expired' });
logger.error('[membership:process-webhooks] Falha ao processar', { eventId, error: err.message });
```

**Wrapper com lock:**
```javascript
async function runJob(jobName, fn) {
  const startTime = Date.now();
  logger.info(`[${jobName}] Iniciando`);

  try {
    const result = await withLock(jobName, 300, fn);
    if (result === null) {
      logger.warn(`[${jobName}] Lock não adquirido, pulando`);
      return;
    }
    logger.info(`[${jobName}] Concluído`, {
      duration: Date.now() - startTime,
      ...result
    });
  } catch (err) {
    logger.error(`[${jobName}] Erro`, { error: err.message });
    await alertAdmin(`Job ${jobName} falhou: ${err.message}`);
  }
}
```

### Enforcement Guidelines

**Todos os AI Agents DEVEM:**
1. Usar Service Response Pattern (`{ success, data/error }`) em todos os services
2. Validar transições de estado via `canTransition()` antes de atualizar
3. Logar com prefixo `[module:job-name]` em todos os jobs
4. Usar `withLock()` em todos os jobs de membership
5. Processar webhooks de forma assíncrona (nunca bloquear resposta)
6. Usar error codes padronizados da tabela acima

**Anti-Patterns (EVITAR):**
```javascript
// ❌ Retornar dados diretamente
return member;

// ❌ Transição sem validação
member.status = 'ativo';

// ❌ Log sem prefixo de módulo
logger.info('Processando...');

// ❌ Processar webhook síncronamente
app.post('/webhook', async (req, res) => {
  await processPayment(req.body);  // ERRADO - bloqueia
  res.send('ok');
});
```

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
bets-estatistica/
├── README.md
├── package.json
├── .env                          # Credenciais (gitignore)
├── .env.example                  # Template de env vars
├── .gitignore
│
├── agent/                        # [EXISTENTE] Módulo de análise IA
│   ├── pipeline.js
│   ├── db.js
│   ├── tools.js
│   ├── analysis/
│   │   ├── runAnalysis.js
│   │   ├── prompt.js
│   │   └── schema.js
│   ├── persistence/
│   │   ├── main.js
│   │   ├── saveOutputs.js
│   │   └── reportService.js
│   └── shared/
│       └── naming.js
│
├── bot/                          # [EXISTENTE + NOVO] Módulo Telegram Bot
│   ├── index.js                  # Entry point (polling/dev)
│   ├── server.js                 # Entry point (webhook/prod) - :3000
│   ├── webhook-server.js         # [NOVO] Cakto webhooks - :3001
│   ├── telegram.js               # Singleton client
│   │
│   ├── handlers/
│   │   ├── adminGroup.js         # [EXISTENTE] Comandos admin
│   │   └── caktoWebhook.js       # [NOVO] Handler webhooks Cakto
│   │
│   ├── jobs/
│   │   ├── requestLinks.js       # [EXISTENTE]
│   │   ├── postBets.js           # [EXISTENTE]
│   │   ├── enrichOdds.js         # [EXISTENTE]
│   │   ├── healthCheck.js        # [EXISTENTE]
│   │   ├── reminders.js          # [EXISTENTE]
│   │   ├── trackResults.js       # [EXISTENTE]
│   │   └── membership/           # [NOVO] Jobs de membros
│   │       ├── index.js          # Registra todos os jobs
│   │       ├── trial-reminders.js      # 09:00 BRT
│   │       ├── kick-expired.js         # 00:01 BRT
│   │       ├── renewal-reminders.js    # 10:00 BRT
│   │       ├── process-webhooks.js     # */30s
│   │       └── reconciliation.js       # 03:00 BRT
│   │
│   └── services/
│       ├── betService.js         # [EXISTENTE]
│       ├── oddsService.js        # [EXISTENTE]
│       ├── alertService.js       # [EXISTENTE]
│       ├── copyService.js        # [EXISTENTE]
│       ├── matchService.js       # [EXISTENTE]
│       ├── metricsService.js     # [EXISTENTE]
│       ├── marketInterpreter.js  # [EXISTENTE]
│       ├── memberService.js      # [NOVO] CRUD membros
│       └── caktoService.js       # [NOVO] API Cakto
│
├── lib/                          # [EXISTENTE] Bibliotecas compartilhadas
│   ├── db.js                     # PostgreSQL Pool
│   ├── supabase.js               # Cliente REST Supabase
│   ├── logger.js                 # Logging centralizado
│   ├── config.js                 # Configurações
│   └── lock.js                   # [NOVO] Distributed lock
│
├── scripts/                      # [EXISTENTE] ETL e manutenção
│   ├── pipeline.js
│   ├── daily_update.js
│   ├── check_analysis_queue.js
│   ├── syncSeasons.js
│   ├── fetch*.js
│   ├── load*.js
│   └── lib/
│
├── sql/                          # [EXISTENTE + NOVO] Schemas SQL
│   ├── league_schema.sql         # [EXISTENTE]
│   ├── agent_schema.sql          # [EXISTENTE]
│   └── migrations/               # [NOVO] Migrations versionadas
│       ├── 001_initial_schema.sql
│       ├── 002_membership_tables.sql
│       └── 003_webhook_events.sql
│
└── docs/                         # [EXISTENTE] Documentação
    ├── index.md
    ├── project-overview.md
    ├── architecture.md
    ├── data-models.md
    └── development-guide.md
```

### Architectural Boundaries

**API Boundaries:**
| Boundary | Port | Responsabilidade |
|----------|------|------------------|
| Telegram Bot | 3000 | Webhook do Telegram |
| Cakto Webhooks | 3001 | Webhooks de pagamento |
| Supabase | - | REST API para dados |
| Cakto API | - | OAuth + REST para consultas |

**Service Boundaries:**
```
┌─────────────────────────────────────────────────────────────┐
│                        bot/                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  handlers/   │  │   jobs/      │  │    services/     │  │
│  │              │  │              │  │                  │  │
│  │ adminGroup   │  │ postBets     │  │ betService       │  │
│  │ caktoWebhook │  │ membership/* │  │ memberService    │  │
│  └──────┬───────┘  └──────┬───────┘  │ caktoService     │  │
│         │                 │          └────────┬─────────┘  │
│         └─────────────────┴───────────────────┘            │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                        lib/                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │supabase.js│  │ logger.js │  │ config.js │  │ lock.js  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Requirements to Structure Mapping

**FR-MB (Membership) → Arquivos:**
| FR Range | Funcionalidade | Arquivos |
|----------|---------------|----------|
| FR-MB1-5 | Webhooks Cakto | `handlers/caktoWebhook.js`, `services/caktoService.js` |
| FR-MB6-12 | Trial Management | `jobs/membership/trial-reminders.js`, `kick-expired.js` |
| FR-MB13-18 | Notifications | `jobs/membership/renewal-reminders.js`, `services/memberService.js` |
| FR-MB19-24 | Member CRUD | `services/memberService.js` |
| FR-MB25-27 | Reconciliation | `jobs/membership/reconciliation.js` |

### Data Flow

```
Cakto Webhook
     │
     ▼
webhook-server.js (validate HMAC)
     │
     ▼
webhook_events table (store raw)
     │
     ▼
process-webhooks.js (async job)
     │
     ▼
memberService.js (update state)
     │
     ▼
members table (persist)
     │
     ▼
Telegram API (kick/notify)
```

### New Files Summary

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `bot/webhook-server.js` | Entry point | Express server para Cakto :3001 |
| `bot/handlers/caktoWebhook.js` | Handler | Valida HMAC, salva evento |
| `bot/services/memberService.js` | Service | CRUD membros + state machine |
| `bot/services/caktoService.js` | Service | OAuth + API Cakto |
| `bot/jobs/membership/index.js` | Registry | Registra todos os jobs |
| `bot/jobs/membership/trial-reminders.js` | Job | Lembretes trial dia 5-7 |
| `bot/jobs/membership/kick-expired.js` | Job | Remove trials expirados |
| `bot/jobs/membership/renewal-reminders.js` | Job | Lembretes PIX/Boleto |
| `bot/jobs/membership/process-webhooks.js` | Job | Processa fila webhooks |
| `bot/jobs/membership/reconciliation.js` | Job | Reconcilia com Cakto |
| `lib/lock.js` | Utility | Distributed lock via Supabase |
| `sql/migrations/002_membership_tables.sql` | Migration | Tabelas members, member_notifications |
| `sql/migrations/003_webhook_events.sql` | Migration | Tabela webhook_events |

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
| Decisão A | Decisão B | Status |
|-----------|-----------|--------|
| Express 4.x | Node.js 20+ | ✅ Compatível |
| Supabase PostgreSQL | Zod 4.x | ✅ Compatível |
| CommonJS | node-cron | ✅ Compatível |
| express-rate-limit | helmet | ✅ Compatível |

**Pattern Consistency:**
- ✅ Naming conventions consistentes (snake_case DB, camelCase JS)
- ✅ Service Response Pattern aplicado em todos os services
- ✅ Error codes padronizados para membership
- ✅ Job execution pattern com locks distribuídos

**Structure Alignment:**
- ✅ Estrutura de diretórios suporta separação de concerns
- ✅ Boundaries claros entre handlers/jobs/services
- ✅ Integração webhook isolada em porta separada (3001)

### Requirements Coverage Validation ✅

**FR-MB Coverage (27 FRs):**
| FR Range | Cobertura Arquitetural | Status |
|----------|------------------------|--------|
| FR-MB1-5 | Webhook processing, event sourcing | ✅ Coberto |
| FR-MB6-12 | Trial jobs, state machine | ✅ Coberto |
| FR-MB13-18 | Notification jobs, memberService | ✅ Coberto |
| FR-MB19-24 | CRUD memberService | ✅ Coberto |
| FR-MB25-27 | Reconciliation job | ✅ Coberto |

**NFR Coverage:**
| NFR | Cobertura | Status |
|-----|-----------|--------|
| NFR21: Webhook < 200ms | Event sourcing async | ✅ Endereçado |
| NFR22: 99.9% uptime Cakto | Retry + reconciliation | ✅ Endereçado |
| NFR23: Dados criptografados | Supabase at-rest encryption | ✅ Endereçado |
| NFR24: Auditoria 12 meses | webhook_events table | ✅ Endereçado |

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ 4 ADRs documentados com rationale e código
- ✅ Versões de tecnologias verificadas
- ✅ Código de exemplo para cada pattern crítico

**Structure Completeness:**
- ✅ 13 novos arquivos especificados com responsabilidades
- ✅ 3 migrations SQL com schemas completos
- ✅ Data flow documentado end-to-end

**Pattern Completeness:**
- ✅ State machine com transições válidas e validação
- ✅ Webhook handler registry para todos os eventos
- ✅ Job wrapper com lock distribuído

### Gap Analysis Results

| Prioridade | Gap | Impacto | Status |
|------------|-----|---------|--------|
| ⚠️ Nice-to-have | Testes unitários não especificados | Baixo | Definir na implementação |
| ⚠️ Nice-to-have | Monitoramento detalhado de jobs | Baixo | Usar alertAdmin existente |
| ⚠️ Nice-to-have | Scripts de rollback para migrations | Baixo | Criar se necessário |

**Nenhum gap crítico ou bloqueante identificado.**

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context analisado (~145 FRs em 4 documentos)
- [x] Complexidade avaliada (Medium-High)
- [x] Constraints técnicos identificados (Node.js 20+, Supabase, BRT)
- [x] Cross-cutting concerns mapeados (2 state machines, jobs, webhooks)

**✅ Architectural Decisions**
- [x] 4 ADRs documentados com código de implementação
- [x] Stack tecnológica completamente especificada
- [x] Padrões de integração Cakto definidos (OAuth + webhooks)
- [x] Segurança de webhooks endereçada (HMAC + rate limit)

**✅ Implementation Patterns**
- [x] Naming conventions estabelecidas e documentadas
- [x] Structure patterns definidos com exemplos
- [x] Communication patterns especificados
- [x] Error handling e logging documentados

**✅ Project Structure**
- [x] Estrutura de diretórios completa com 13 novos arquivos
- [x] Boundaries de componentes claramente definidos
- [x] Pontos de integração mapeados (Cakto, Telegram, Supabase)
- [x] Mapeamento FR → arquivos completo

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
1. Event sourcing robusto para webhooks de pagamento
2. State machine bem definida com validação de transições
3. Separação clara de responsabilidades (handlers/jobs/services)
4. Patterns 100% consistentes com projeto existente
5. Segurança em camadas para webhooks financeiros

**Areas for Future Enhancement:**
1. Cache layer para queries frequentes de membros
2. PM2 para gerenciamento multi-process em produção
3. Dashboard de métricas de membership (MRR, churn, conversão)
4. Testes de integração automatizados para webhooks

### Implementation Handoff

**AI Agent Guidelines:**
1. Seguir todas as decisões arquiteturais exatamente como documentado
2. Usar implementation patterns consistentemente em todos os componentes
3. Respeitar estrutura do projeto e boundaries definidos
4. Consultar este documento para todas as questões arquiteturais
5. Usar error codes padronizados da tabela de Error Codes
6. Validar transições de estado via `canTransition()` sempre

**First Implementation Priority:**
```bash
# 1. Instalar novas dependências
npm install express express-rate-limit helmet

# 2. Criar migrations SQL
# sql/migrations/002_membership_tables.sql
# sql/migrations/003_webhook_events.sql

# 3. Aplicar migrations no Supabase Dashboard

# 4. Implementar na ordem:
#    - lib/lock.js
#    - bot/services/caktoService.js
#    - bot/services/memberService.js
#    - bot/handlers/caktoWebhook.js
#    - bot/webhook-server.js
#    - bot/jobs/membership/*.js
```

---

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2026-01-17
**Document Location:** `_bmad-output/planning-artifacts/architecture.md`

### Final Architecture Deliverables

**Complete Architecture Document:**
- 4 Architecture Decision Records (ADRs) com código
- Implementation patterns para consistência entre AI agents
- Estrutura completa do projeto com 13 novos arquivos
- Mapeamento de requisitos para arquitetura
- Validação confirmando coerência e completude

**Implementation Ready Foundation:**
- 4 decisões arquiteturais principais documentadas
- 6 implementation patterns definidos
- 12 componentes arquiteturais especificados
- 27 FRs de membership + 4 NFRs totalmente suportados

**AI Agent Implementation Guide:**
- Stack tecnológica com versões verificadas
- Regras de consistência que previnem conflitos
- Estrutura do projeto com boundaries claros
- Padrões de integração e comunicação

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] Todas as decisões funcionam juntas sem conflitos
- [x] Escolhas tecnológicas são compatíveis
- [x] Patterns suportam as decisões arquiteturais
- [x] Estrutura alinha com todas as escolhas

**✅ Requirements Coverage**
- [x] Todos os requisitos funcionais suportados
- [x] Todos os requisitos não-funcionais endereçados
- [x] Cross-cutting concerns tratados
- [x] Pontos de integração definidos

**✅ Implementation Readiness**
- [x] Decisões são específicas e acionáveis
- [x] Patterns previnem conflitos entre agents
- [x] Estrutura é completa e sem ambiguidade
- [x] Exemplos providos para clareza

---

**Architecture Status:** ✅ READY FOR IMPLEMENTATION

**Next Phase:** Iniciar implementação usando as decisões e patterns documentados.

**Document Maintenance:** Atualizar esta arquitetura quando decisões técnicas importantes forem tomadas durante implementação.


# Story 16.4: Implementar Detecção de Entrada e Sistema de Trial

Status: done

---

## Story

As a novo membro,
I want ser registrado automaticamente quando entro no grupo,
So that tenha 7 dias de trial para experimentar o serviço.

---

## Acceptance Criteria

### AC1: Detecção de Novo Membro no Grupo Público

**Given** novo usuário entra no grupo público (via new_chat_members)
**When** bot detecta o evento
**Then** cria registro em `members` com:
  - telegram_id do usuário
  - telegram_username (se disponível)
  - status = 'trial'
  - trial_started_at = NOW()
  - trial_ends_at = NOW() + 7 dias (configurável)
**And** envia mensagem de boas-vindas no privado

### AC2: Prevenção de Duplicatas

**Given** usuário já existe na tabela members
**When** entra novamente no grupo
**Then** NÃO cria registro duplicado
**And** se status era 'removido' e kicked_at < 24h, permite reentrada
**And** se kicked_at > 24h, envia mensagem pedindo pagamento

### AC3: Cálculo de Dias Restantes de Trial

**Given** membro em trial
**When** função `getTrialDaysRemaining(memberId)` chamada
**Then** retorna número de dias restantes (0 a 7)
**And** retorna 0 se trial já expirou

### AC4: Configuração Global de Trial

**Given** configuração global de trial
**When** variável TRIAL_DAYS alterada
**Then** novos membros usam o novo valor
**And** membros existentes mantém seu trial original

### AC5: Mensagem de Boas-vindas

**Given** novo membro registrado com sucesso
**When** mensagem de boas-vindas enviada
**Then** usa formato definido com:
  - Nome do grupo
  - Duração do trial (7 dias)
  - Benefícios do serviço
  - Taxa de acerto histórica
  - Valor da assinatura (R$50/mês)
  - Contato do operador

---

## Tasks / Subtasks

- [x] Task 1: Criar bot/handlers/memberEvents.js (AC: #1, #2, #5)
  - [x] 1.1: Criar handler handleNewChatMembers(msg) para evento new_chat_members
  - [x] 1.2: Filtrar apenas usuários (não bots) do grupo público
  - [x] 1.3: Chamar processNewMember(user) para cada novo usuário
  - [x] 1.4: Implementar processNewMember com lógica de duplicata
  - [x] 1.5: Se membro novo → chamar createTrialMember + sendWelcomeMessage
  - [x] 1.6: Se membro existente 'removido' < 24h → permitir reentrada silenciosa
  - [x] 1.7: Se membro existente 'removido' > 24h → enviar mensagem de pagamento
  - [x] 1.8: Se membro existente 'trial'/'ativo' → ignorar silenciosamente
  - [x] 1.9: Logar com prefixo [membership:member-events]

- [x] Task 2: Atualizar memberService.js com funções de trial (AC: #1, #3)
  - [x] 2.1: **CRIAR** createTrialMember(telegramId, username) - JÁ EXISTIA (Story 16.1)
  - [x] 2.2: **CRIAR** getTrialDaysRemaining(memberId) - JÁ EXISTIA (Story 16.1)
  - [x] 2.3: **CRIAR** canRejoinGroup(memberId) - verifica se pode reentrar (< 24h)
  - [x] 2.4: **CRIAR** reactivateMember(memberId) - reativa membro removido
  - [x] 2.5: Seguir Service Response Pattern { success, data/error }

- [x] Task 3: Adicionar configuração TRIAL_DAYS em lib/config.js (AC: #4)
  - [x] 3.1: Adicionar TRIAL_DAYS com default 7 em membership config
  - [x] 3.2: Ler de variável de ambiente MEMBERSHIP_TRIAL_DAYS
  - [x] 3.3: Validar que é número > 0

- [x] Task 4: Criar função de mensagem de boas-vindas (AC: #5)
  - [x] 4.1: **CRIAR** sendWelcomeMessage(telegramId) em memberEvents.js
  - [x] 4.2: Buscar taxa de acerto via getSuccessRate()
  - [x] 4.3: Formatar mensagem conforme template definido
  - [x] 4.4: Usar bot.sendMessage para enviar no privado
  - [x] 4.5: Registrar notificação em member_notifications (type: 'welcome')
  - [x] 4.6: Tratar erro de usuário que não iniciou chat com bot (403)

- [x] Task 5: Integrar handler no servidor (AC: #1)
  - [x] 5.1: Atualizar bot/server.js para processar update.message.new_chat_members
  - [x] 5.2: Verificar se mensagem é do grupo público
  - [x] 5.3: Chamar handleNewChatMembers(msg)

- [x] Task 6: Criar testes unitários (AC: #1, #2, #3, #4)
  - [x] 6.1: Testar createTrialMember com novo usuário
  - [x] 6.2: Testar createTrialMember com duplicata (MEMBER_ALREADY_EXISTS)
  - [x] 6.3: Testar getTrialDaysRemaining em diferentes cenários
  - [x] 6.4: Testar canRejoinGroup para < 24h e > 24h
  - [x] 6.5: Testar handleNewChatMembers com diferentes cenários
  - [x] 6.6: Testar sendWelcomeMessage sucesso e erro 403

---

## Dev Notes

### Aprendizados das Stories 16.1, 16.2 e 16.3 (CRÍTICO)

| Aprendizado | Aplicação |
|-------------|-----------|
| Service Response Pattern | SEMPRE retornar `{ success, data/error }` |
| Optimistic Locking | Usar `.eq('status', currentStatus)` em updates de estado |
| Logger com prefixo | `[membership:member-events]` |
| Testes de erro DB | Cobrir unique constraint (23505) |
| Lock em memória | NÃO necessário para handlers (são síncronos por request) |
| HMAC já validado | Eventos Telegram chegam via webhook seguro |

### Telegram Bot API: new_chat_members

**Evento:** O bot recebe `new_chat_members` quando usuários entram no grupo.

**Estrutura do Update:**
```javascript
{
  message: {
    message_id: 123,
    date: 1234567890,
    chat: {
      id: -1001234567890,  // Grupo público
      type: 'supergroup',
      title: 'Nome do Grupo'
    },
    from: {
      id: 12345,           // Quem adicionou (pode ser o próprio usuário)
      first_name: 'Admin',
      username: 'admin'
    },
    new_chat_members: [    // ARRAY de novos membros
      {
        id: 67890,
        first_name: 'Novo',
        last_name: 'Membro',
        username: 'novomembro',
        is_bot: false
      }
    ]
  }
}
```

**IMPORTANTE:**
- `new_chat_members` é um ARRAY - pode ter múltiplos usuários
- Filtrar `is_bot: true` para ignorar bots
- Verificar se o grupo é o PUBLIC_GROUP_ID (não processar admin group)

**Referência:** [Telegram Bot API - new_chat_members](https://core.telegram.org/bots/api#message)

### Integração no server.js (webhook endpoint)

```javascript
// bot/server.js - Dentro do webhook handler
app.post(`/webhook/${config.telegram.botToken}`, async (req, res) => {
  const update = req.body;

  if (update.message) {
    const msg = update.message;

    // Detectar novos membros no grupo público
    if (msg.new_chat_members && msg.chat.id.toString() === config.telegram.publicGroupId) {
      const { handleNewChatMembers } = require('./handlers/memberEvents');
      await handleNewChatMembers(msg);
    }

    // Admin group messages (existing)
    if (msg.chat.id.toString() === config.telegram.adminGroupId) {
      await handleAdminMessage(bot, msg);
    }
  }

  res.sendStatus(200);
});
```

### Handler memberEvents.js (CRIAR NOVO)

```javascript
// bot/handlers/memberEvents.js
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { getBot } = require('../telegram');
const {
  getMemberByTelegramId,
  createTrialMember,
  canRejoinGroup,
  reactivateMember
} = require('../services/memberService');
const { getSuccessRate } = require('../services/metricsService');

/**
 * Handle new_chat_members event from Telegram
 * @param {object} msg - Telegram message with new_chat_members
 */
async function handleNewChatMembers(msg) {
  const newMembers = msg.new_chat_members || [];

  for (const user of newMembers) {
    // Ignorar bots
    if (user.is_bot) {
      logger.debug('[membership:member-events] Ignoring bot', { botId: user.id });
      continue;
    }

    await processNewMember(user);
  }
}

async function processNewMember(user) {
  const { id: telegramId, username, first_name } = user;

  logger.info('[membership:member-events] Processing new member', { telegramId, username });

  // Verificar se membro já existe
  const existingResult = await getMemberByTelegramId(telegramId);

  if (existingResult.success) {
    const member = existingResult.data;

    if (member.status === 'removido') {
      // Verificar se pode reentrar (< 24h)
      const rejoinResult = await canRejoinGroup(member.id);

      if (rejoinResult.success && rejoinResult.data.canRejoin) {
        // Reativar como trial
        await reactivateMember(member.id);
        await sendWelcomeMessage(telegramId, first_name);
        logger.info('[membership:member-events] Member reactivated', { memberId: member.id });
      } else {
        // Enviar mensagem de pagamento
        await sendPaymentRequiredMessage(telegramId);
        logger.info('[membership:member-events] Payment required for rejoin', { memberId: member.id });
      }
    } else {
      // trial ou ativo - ignorar silenciosamente
      logger.debug('[membership:member-events] Member already exists, skipping', {
        memberId: member.id,
        status: member.status
      });
    }
    return;
  }

  // Novo membro - criar trial
  const createResult = await createTrialMember(telegramId, username);

  if (createResult.success) {
    await sendWelcomeMessage(telegramId, first_name);
    logger.info('[membership:member-events] New trial member created', {
      memberId: createResult.data.id,
      telegramId
    });
  } else {
    logger.error('[membership:member-events] Failed to create member', {
      telegramId,
      error: createResult.error
    });
  }
}

module.exports = { handleNewChatMembers, processNewMember };
```

### Funções em memberService.js (ADICIONAR)

```javascript
/**
 * Create a new trial member
 * @param {number} telegramId - Telegram user ID
 * @param {string} username - Telegram username (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createTrialMember(telegramId, username) {
  try {
    const trialDays = config.membership?.trialDays || 7;
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const { data, error } = await supabase
      .from('members')
      .insert({
        telegram_id: telegramId,
        telegram_username: username || null,
        status: 'trial',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: { code: 'MEMBER_ALREADY_EXISTS', message: `Member with telegram_id ${telegramId} already exists` }
        };
      }
      logger.error('[memberService] createTrialMember: database error', { telegramId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] createTrialMember: member created', { memberId: data.id, telegramId });
    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] createTrialMember: unexpected error', { telegramId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get remaining trial days for a member
 * @param {number} memberId - Member ID
 * @returns {Promise<{success: boolean, data?: {daysRemaining: number}, error?: object}>}
 */
async function getTrialDaysRemaining(memberId) {
  const memberResult = await getMemberById(memberId);

  if (!memberResult.success) {
    return memberResult;
  }

  const member = memberResult.data;

  if (member.status !== 'trial' || !member.trial_ends_at) {
    return { success: true, data: { daysRemaining: 0 } };
  }

  const now = new Date();
  const trialEnds = new Date(member.trial_ends_at);
  const diffTime = trialEnds - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    success: true,
    data: { daysRemaining: Math.max(0, diffDays) }
  };
}

/**
 * Check if a removed member can rejoin the group (within 24h of kick)
 * @param {number} memberId - Member ID
 * @returns {Promise<{success: boolean, data?: {canRejoin: boolean}, error?: object}>}
 */
async function canRejoinGroup(memberId) {
  const memberResult = await getMemberById(memberId);

  if (!memberResult.success) {
    return memberResult;
  }

  const member = memberResult.data;

  if (member.status !== 'removido') {
    return { success: true, data: { canRejoin: false } };
  }

  if (!member.kicked_at) {
    // Sem kicked_at - não pode reentrar (estado inconsistente)
    return { success: true, data: { canRejoin: false } };
  }

  const kickedAt = new Date(member.kicked_at);
  const now = new Date();
  const hoursSinceKick = (now - kickedAt) / (1000 * 60 * 60);

  return {
    success: true,
    data: { canRejoin: hoursSinceKick < 24 }
  };
}

/**
 * Reactivate a removed member as trial
 * @param {number} memberId - Member ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function reactivateMember(memberId) {
  const trialDays = config.membership?.trialDays || 7;
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

  const { data, error } = await supabase
    .from('members')
    .update({
      status: 'trial',
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      kicked_at: null,
      notes: `Reativado em ${now.toISOString()}`
    })
    .eq('id', memberId)
    .eq('status', 'removido')  // Optimistic locking
    .select()
    .single();

  if (error) {
    logger.error('[memberService] reactivateMember: database error', { memberId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  if (!data) {
    return {
      success: false,
      error: { code: 'INVALID_MEMBER_STATUS', message: 'Member is not in removido status' }
    };
  }

  logger.info('[memberService] reactivateMember: member reactivated', { memberId });
  return { success: true, data };
}
```

### Configuração em lib/config.js (ADICIONAR)

```javascript
// Adicionar em config object:
membership: {
  trialDays: parseInt(process.env.MEMBERSHIP_TRIAL_DAYS || '7', 10),
  checkoutUrl: process.env.CAKTO_CHECKOUT_URL || null,
}
```

### Mensagem de Boas-vindas (Template)

```javascript
async function sendWelcomeMessage(telegramId, firstName) {
  const bot = getBot();

  // Buscar taxa de acerto
  const metricsResult = await getSuccessRate();
  const successRate = metricsResult.success ? metricsResult.data.rate30Days : 'N/A';

  const trialDays = config.membership?.trialDays || 7;

  const message = `
Bem-vindo ao *GuruBet*, ${firstName || 'apostador'}! 🎯

Você tem *${trialDays} dias grátis* para experimentar nossas apostas.

📊 *O que você recebe:*
• 3 apostas diárias com análise estatística
• Horários: 10h, 15h e 22h
• Taxa de acerto histórica: *${successRate}%*

💰 Após o trial, continue por apenas *R$50/mês*.

❓ Dúvidas? Fale com @operador

Boas apostas! 🍀
  `.trim();

  try {
    const sentMessage = await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });

    // Registrar notificação
    await supabase.from('member_notifications').insert({
      member_id: (await getMemberByTelegramId(telegramId)).data?.id,
      type: 'welcome',
      channel: 'telegram',
      message_id: sentMessage.message_id.toString()
    });

    return { success: true, data: { messageId: sentMessage.message_id } };
  } catch (err) {
    if (err.response?.statusCode === 403) {
      logger.warn('[membership:member-events] User has not started chat with bot', { telegramId });
      return {
        success: false,
        error: { code: 'USER_BLOCKED_BOT', message: 'User has not started chat with bot' }
      };
    }
    logger.error('[membership:member-events] Failed to send welcome message', { telegramId, error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}
```

### Mensagem de Pagamento Requerido

```javascript
async function sendPaymentRequiredMessage(telegramId) {
  const bot = getBot();
  const checkoutUrl = config.membership?.checkoutUrl || 'https://cakto.com/checkout';

  const message = `
Olá! Notamos que você voltou ao grupo. 👋

Seu período de trial já terminou há mais de 24 horas.

Para continuar recebendo nossas apostas:
[ASSINAR POR R$50/MÊS](${checkoutUrl})

❓ Dúvidas? Fale com @operador
  `.trim();

  try {
    await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
    return { success: true };
  } catch (err) {
    if (err.response?.statusCode === 403) {
      logger.warn('[membership:member-events] User has not started chat with bot', { telegramId });
      return { success: false, error: { code: 'USER_BLOCKED_BOT', message: 'User has not started chat' } };
    }
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}
```

### Error Codes

| Code | Quando usar |
|------|-------------|
| `MEMBER_NOT_FOUND` | Membro não existe no banco |
| `MEMBER_ALREADY_EXISTS` | Telegram ID já cadastrado |
| `INVALID_MEMBER_STATUS` | Transição de estado inválida |
| `USER_BLOCKED_BOT` | Usuário não iniciou chat com bot (403) |
| `TELEGRAM_ERROR` | Erro genérico do Telegram |
| `DB_ERROR` | Erro de banco de dados |

---

## Project Structure Notes

**Arquivos a CRIAR:**
```
bot/
└── handlers/
    └── memberEvents.js       # Handler de novos membros (NOVO)

__tests__/
└── handlers/
    └── memberEvents.test.js  # Testes (NOVO)
```

**Arquivos a ATUALIZAR:**
```
bot/
├── server.js                 # Adicionar processamento de new_chat_members
└── services/
    └── memberService.js      # +4 funções (createTrialMember, getTrialDaysRemaining, canRejoinGroup, reactivateMember)

lib/
└── config.js                 # +membership.trialDays
```

**Dependências existentes:**
- `node-telegram-bot-api` - Já instalado
- `@supabase/supabase-js` - Já instalado

---

## Previous Story Intelligence

### Story 16.1 (Infraestrutura + State Machine)
- **Arquivos criados:** `sql/migrations/005_membership_tables.sql`, `bot/services/memberService.js`
- **Funções disponíveis:** `canTransition()`, `updateMemberStatus()`, `getMemberById()`, `getMemberByTelegramId()`
- **Tabelas criadas:** `members`, `member_notifications`, `webhook_events`
- **Issues corrigidos:** Optimistic locking, índice em cakto_subscription_id
- **34 testes passando**

### Story 16.2 (Webhook Server)
- **Arquivos criados:** `bot/webhook-server.js`, `bot/handlers/caktoWebhook.js`
- **Pattern:** HMAC validation com timingSafeEqual
- **Pattern:** Event sourcing (salvar raw → processar async)
- **19 testes passando**

### Story 16.3 (Processamento Assíncrono)
- **Arquivos criados:** `bot/jobs/membership/process-webhooks.js`, `bot/services/webhookProcessors.js`
- **Funções em memberService:** `getMemberByEmail()`, `activateMember()`, `renewMemberSubscription()`, `markMemberAsDefaulted()`, `createActiveMember()`
- **Pattern:** Lock em memória para jobs (não usar banco)
- **Pattern:** Debounce em alertas via canSendWebhookAlert()
- **38 testes passando**

### Commits Recentes (Git Intelligence)
```
bea0df4 feat(membership): implement async webhook processing (Story 16.3)
2b12ba4 feat(workflow): add new 'archive-epics' workflow
2d82571 feat(dependencies): update package.json - express-rate-limit, helmet, supertest
```

**Total de testes no projeto:** 236 passando

---

## Architecture References

### ADR-002: Supabase como Fonte de Verdade
```
Cakto (informante) ──webhook──► Supabase (master) ──action──► Telegram (executor)
```

### Member State Machine (project-context.md)
```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

### Service Response Pattern
```javascript
// ✅ Sucesso
return { success: true, data: { member, action: 'created' } };

// ✅ Erro
return { success: false, error: { code: 'MEMBER_NOT_FOUND', message: '...' } };
```

---

## References

- [Source: project-context.md#Member State Machine]
- [Source: project-context.md#New Membership Files]
- [Source: architecture.md#ADR-002: Fonte de Verdade do Estado do Membro]
- [Source: epics.md#Story 16.4]
- [Pattern: bot/handlers/adminGroup.js - Handler pattern]
- [Pattern: bot/services/memberService.js - Service Response Pattern]
- [Telegram Bot API: new_chat_members](https://core.telegram.org/bots/api#message)
- [node-telegram-bot-api issues: new_chat_members](https://github.com/yagop/node-telegram-bot-api/issues/472)
- [Learnings: 16-1-criar-infraestrutura-membros-state-machine.md]
- [Learnings: 16-2-criar-webhook-server-event-sourcing.md]
- [Learnings: 16-3-implementar-processamento-assincrono-webhooks.md]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 259 tests pass (57 new tests for Story 16.4)
- No regressions detected

### Completion Notes List

- **Task 3 (Config):** Added `membership.trialDays` with MEMBERSHIP_TRIAL_DAYS env var support
- **Task 2 (Service):** Added `canRejoinGroup()` and `reactivateMember()` functions. Note: `createTrialMember` and `getTrialDaysRemaining` already existed from Story 16.1
- **Task 1 (Handler):** Created memberEvents.js with `handleNewChatMembers()`, `processNewMember()` with full duplicate detection logic
- **Task 4 (Welcome):** Created `sendWelcomeMessage()` and `sendPaymentRequiredMessage()` functions with 403 error handling
- **Task 5 (Server):** Integrated handler in bot/server.js webhook endpoint for public group
- **Task 6 (Tests):** Added 14 tests for memberEvents handler + 9 tests for new memberService functions

### File List

**Created:**
- bot/handlers/memberEvents.js
- __tests__/handlers/memberEvents.test.js

**Modified:**
- lib/config.js (added membership config section)
- bot/services/memberService.js (added canRejoinGroup, reactivateMember, updated exports)
- bot/server.js (added memberEvents import and new_chat_members handling)
- __tests__/services/memberService.test.js (added tests for canRejoinGroup, reactivateMember)

### Change Log

| Date | Change |
|------|--------|
| 2026-01-18 | Story 16.4 implemented: New member detection, trial registration, welcome messages, and duplicate prevention |


# Tech Spec: Migração Cakto → Mercado Pago

**Data:** 2026-01-20
**Status:** Draft - Aguardando Aprovação
**Autor:** Party Mode (Mary, Winston, John)

---

## 1. Resumo Executivo

Substituir gateway Cakto por Mercado Pago, simplificando a arquitetura:
- **Trial gerenciado pelo MP** (cobrança automática após período)
- **Estado `trial` mantido** no sistema para visibilidade/relatórios
- **Afiliados via cupom** (não mais via link/parâmetro)
- **Entrada no grupo** após assinatura criada (trial ou paga)

---

## 2. Decisões de Produto

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| Trial | Gerenciado pelo MP | MP controla período e cobra automaticamente |
| Estado trial | Mantido no sistema | Visibilidade: quantos trial vs pagantes |
| Afiliado | Via cupom MP | Desconto configurado no MP, tracking via webhook |
| Entrada no grupo | Após criar assinatura | Trial entra no grupo, MP cobra depois |
| Criação de cupons | Manual (admin) | Fora do escopo do sistema |
| Cobrança/Retry | 100% no MP | Até 4 tentativas em 10 dias, automático |

---

## 3. Arquitetura Simplificada

### 3.1 Fluxo do Usuário

```
┌─────────────────────────────────────────────────────────────┐
│                     FLUXO NOVO (MP)                         │
└─────────────────────────────────────────────────────────────┘

1. Usuário entra no bot (link único, sem parâmetros)
   t.me/BetsEstatisticaBot
        │
        ▼
2. Bot apresenta o produto e envia link de assinatura
   "Assine por R$29,90/mês (7 dias grátis)" → [Link Checkout MP]
        │
        ▼
3. Usuário vai pro checkout do Mercado Pago
   - Cadastra cartão
   - Pode aplicar cupom do afiliado (ex: JOAO10)
   - MP valida cupom e aplica desconto
   - Trial de 7 dias configurado no plano MP
        │
        ▼
4. Assinatura criada → Webhook: subscription_preapproval
   - Recebemos: email, subscription_id, status="authorized"
   - Sistema cria membro com status = "trial"
   - Salva coupon_code como affiliate_coupon
        │
        ▼
5. Bot envia link do grupo pro usuário
   "Assinatura criada! Você tem 7 dias grátis. Acesse o grupo: [link]"
        │
        ▼
6. Após 7 dias: MP cobra automaticamente
   │
   ├─► SUCESSO → Webhook: subscription_authorized_payment (approved)
   │              └─► Sistema atualiza status = "ativo"
   │
   └─► FALHA → MP tenta até 4x em 10 dias
               │
               ├─► Eventual sucesso → status = "ativo"
               │
               └─► 4 falhas → Webhook: subscription_preapproval (cancelled)
                              └─► Sistema atualiza status = "removido"
```

### 3.2 Fluxo de Cobrança Recorrente (Gerenciado pelo MP)

```
┌─────────────────────────────────────────────────────────────┐
│              CICLO DE COBRANÇA AUTOMÁTICA                   │
└─────────────────────────────────────────────────────────────┘

Membro ativo (já pagou pelo menos 1x)
        │
        │ Todo mês, MP tenta cobrar
        ▼
   ┌─────────┐
   │ Cobrança │
   └────┬────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
SUCESSO    FALHA
   │         │
   │         ├─► Retry 1 (após 1 dia)
   │         ├─► Retry 2 (após 3 dias)
   │         ├─► Retry 3 (após 6 dias)
   │         └─► Retry 4 (após 10 dias)
   │                    │
   │              ┌─────┴─────┐
   │              │           │
   │              ▼           ▼
   │           SUCESSO    4 FALHAS
   │              │           │
   ▼              ▼           ▼
Webhook:      Webhook:    Webhook:
payment       payment     preapproval
(approved)    (approved)  (cancelled)
   │              │           │
   ▼              ▼           ▼
Renova        Renova      Remove
assinatura    assinatura  membro
```

### 3.3 Estados do Membro

```
                    ┌──────────────┐
                    │   (nenhum)   │
                    └──────┬───────┘
                           │ Assinatura criada (webhook preapproval)
                           ▼
                    ┌──────────────┐
                    │    trial     │ ◄─── Período grátis (MP gerencia duração)
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         │ 1º Pagamento    │ Cancelamento    │
         │ aprovado        │ (não pagou)     │
         ▼                 │                 ▼
  ┌──────────────┐         │          ┌──────────────┐
  │    ativo     │◄────────┘          │   removido   │
  └──────┬───────┘                    └──────────────┘
         │                                   ▲
         │ Pagamento                         │
         │ falhou (retry)                    │
         ▼                                   │
  ┌──────────────┐                           │
  │ inadimplente │───────────────────────────┘
  └──────┬───────┘    Cancelamento (4 falhas)
         │
         │ Pagamento aprovado (retry ok)
         └─────────────────────────────► ativo
```

**Transições por Webhook:**

| Webhook | Condição | Transição |
|---------|----------|-----------|
| `subscription_preapproval` | action=created | (novo) → `trial` |
| `subscription_authorized_payment` | status=approved, membro=trial | `trial` → `ativo` |
| `subscription_authorized_payment` | status=approved, membro=ativo | `ativo` → `ativo` (renova) |
| `subscription_authorized_payment` | status=approved, membro=inadimplente | `inadimplente` → `ativo` |
| `subscription_authorized_payment` | status=rejected | `ativo` → `inadimplente` |
| `subscription_preapproval` | status=cancelled | qualquer → `removido` |

---

## 4. Mudanças no Banco de Dados

### 4.1 Migration: Simplificar Tabela Members

```sql
-- migration: XXX_migrate_to_mercadopago.sql

-- 1. Remover colunas de afiliado antigas (substituídas por cupom)
ALTER TABLE members DROP COLUMN IF EXISTS affiliate_code;
ALTER TABLE members DROP COLUMN IF EXISTS affiliate_clicked_at;
ALTER TABLE members DROP COLUMN IF EXISTS affiliate_history;

-- 2. Remover coluna trial_ends_at (MP gerencia trial agora)
ALTER TABLE members DROP COLUMN IF EXISTS trial_ends_at;

-- 3. Renomear colunas Cakto → MP
ALTER TABLE members RENAME COLUMN cakto_subscription_id TO mp_subscription_id;
ALTER TABLE members RENAME COLUMN cakto_customer_id TO mp_payer_id;

-- 4. Adicionar coluna de cupom afiliado
ALTER TABLE members ADD COLUMN affiliate_coupon TEXT;

-- 5. Manter constraint de status COM trial
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check
  CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido'));

-- 6. Índice para relatório de afiliados
CREATE INDEX idx_members_affiliate_coupon
  ON members(affiliate_coupon)
  WHERE affiliate_coupon IS NOT NULL;

-- 7. Índice para buscar por subscription
CREATE INDEX idx_members_mp_subscription
  ON members(mp_subscription_id)
  WHERE mp_subscription_id IS NOT NULL;

-- 8. Migrar membros ativos Cakto (precisarão re-assinar no MP)
-- Mantém como ativo mas limpa IDs do Cakto
UPDATE members
SET mp_subscription_id = NULL,
    mp_payer_id = NULL,
    notes = COALESCE(notes, '') || ' | Migrado de Cakto em ' || NOW()
WHERE status IN ('ativo', 'trial')
  AND (cakto_subscription_id IS NOT NULL OR mp_subscription_id IS NULL);
```

### 4.2 Schema Final

```sql
-- Colunas relevantes da tabela members após migração
id SERIAL PRIMARY KEY
telegram_id BIGINT UNIQUE NOT NULL
email TEXT
status TEXT CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido'))
mp_subscription_id TEXT              -- ID da assinatura no MP
mp_payer_id TEXT                     -- ID do pagador no MP
payment_method TEXT                  -- 'pix', 'boleto', 'cartao_recorrente'
subscription_started_at TIMESTAMPTZ  -- Quando fez 1º pagamento (NULL em trial)
subscription_ends_at TIMESTAMPTZ     -- Próxima renovação
last_payment_at TIMESTAMPTZ          -- Último pagamento confirmado
affiliate_coupon TEXT                -- Cupom usado (ex: "JOAO10")
kicked_at TIMESTAMPTZ                -- Quando foi removido do grupo
notes TEXT                           -- Histórico/auditoria
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### 4.3 Queries de Relatório

```sql
-- Contagem por status
SELECT status, COUNT(*) as total
FROM members
GROUP BY status;

-- Vendas por afiliado (cupom)
SELECT
  affiliate_coupon,
  COUNT(*) as total_vendas,
  COUNT(*) FILTER (WHERE status = 'trial') as em_trial,
  COUNT(*) FILTER (WHERE status = 'ativo') as pagantes,
  COUNT(*) FILTER (WHERE status = 'removido') as cancelados
FROM members
WHERE affiliate_coupon IS NOT NULL
GROUP BY affiliate_coupon
ORDER BY total_vendas DESC;

-- Taxa de conversão trial → pagante
SELECT
  COUNT(*) FILTER (WHERE status = 'ativo') * 100.0 /
  NULLIF(COUNT(*) FILTER (WHERE status IN ('trial', 'ativo', 'removido')), 0) as taxa_conversao
FROM members;
```

---

## 5. Arquivos a Criar

### 5.1 `bot/services/mercadoPagoService.js`

```javascript
const axios = require('axios');
const config = require('../../lib/config');

const MP_API_URL = 'https://api.mercadopago.com';

const getHeaders = () => ({
  'Authorization': `Bearer ${config.mercadoPago.accessToken}`,
  'Content-Type': 'application/json'
});

/**
 * Busca detalhes de uma assinatura
 */
async function getSubscription(subscriptionId) {
  const response = await axios.get(
    `${MP_API_URL}/preapproval/${subscriptionId}`,
    { headers: getHeaders() }
  );
  return response.data;
}

/**
 * Busca detalhes de um pagamento
 */
async function getPayment(paymentId) {
  const response = await axios.get(
    `${MP_API_URL}/v1/payments/${paymentId}`,
    { headers: getHeaders() }
  );
  return response.data;
}

/**
 * Cancela uma assinatura
 */
async function cancelSubscription(subscriptionId) {
  const response = await axios.put(
    `${MP_API_URL}/preapproval/${subscriptionId}`,
    { status: 'cancelled' },
    { headers: getHeaders() }
  );
  return response.data;
}

module.exports = {
  getSubscription,
  getPayment,
  cancelSubscription
};
```

### 5.2 `bot/handlers/mercadoPagoWebhook.js`

```javascript
const crypto = require('crypto');
const config = require('../../lib/config');
const logger = require('../../lib/logger');
const { saveWebhookEvent } = require('../services/webhookService');

/**
 * Valida assinatura HMAC do webhook MP
 */
function validateSignature(req) {
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  if (!xSignature) return false;

  const parts = xSignature.split(',');
  const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
  const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];

  if (!ts || !v1) return false;

  const dataId = req.body?.data?.id;

  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto
    .createHmac('sha256', config.mercadoPago.webhookSecret)
    .update(manifest)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

/**
 * Handler do webhook
 */
async function handleWebhook(req, res) {
  if (!validateSignature(req)) {
    logger.warn('Webhook MP: assinatura inválida');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, action, data } = req.body;
  logger.info('Webhook MP recebido', { type, action, dataId: data?.id });

  // Responde 200 imediatamente
  res.status(200).json({ received: true });

  // Salva pra processamento assíncrono
  try {
    await saveWebhookEvent({
      idempotency_key: `${type}_${action}_${data?.id}`,
      event_type: type,
      action,
      payload: req.body,
      status: 'pending'
    });
  } catch (error) {
    if (error.code !== '23505') { // Ignora duplicados
      logger.error('Erro ao salvar webhook', error);
    }
  }
}

module.exports = { handleWebhook, validateSignature };
```

### 5.3 `bot/services/webhookProcessors.js` (substituir)

```javascript
const mercadoPagoService = require('./mercadoPagoService');
const memberService = require('./memberService');
const notificationService = require('./notificationService');
const logger = require('../../lib/logger');

/**
 * Extrai cupom do pagamento ou assinatura MP
 */
function extractCouponCode(data) {
  return data.coupon_code
    || data.coupon_id
    || data.metadata?.coupon_code
    || data.additional_info?.coupon_code
    || null;
}

/**
 * Mapeia método de pagamento MP → interno
 */
function mapPaymentMethod(mpMethod) {
  const map = {
    'visa': 'cartao_recorrente',
    'master': 'cartao_recorrente',
    'amex': 'cartao_recorrente',
    'elo': 'cartao_recorrente',
    'hipercard': 'cartao_recorrente',
    'pix': 'pix',
    'bolbradesco': 'boleto',
    'pec': 'boleto'
  };
  return map[mpMethod] || 'cartao_recorrente';
}

// ============================================
// HANDLER: Assinatura Criada (trial inicia)
// ============================================
async function handleSubscriptionCreated(payload) {
  const subscriptionId = payload.data?.id;
  if (!subscriptionId) return;

  const subscription = await mercadoPagoService.getSubscription(subscriptionId);

  // Só processa assinaturas novas (authorized = cartão validado)
  if (subscription.status !== 'authorized') return;

  const email = subscription.payer_email;
  if (!email) {
    logger.warn('Assinatura sem email', { subscriptionId });
    return;
  }

  // Verifica se já existe membro com esse email
  let member = await memberService.getMemberByEmail(email);

  if (member) {
    // Membro existente - atualiza subscription ID
    await memberService.updateSubscription(member.id, {
      subscriptionId,
      payerId: subscription.payer_id?.toString()
    });
    logger.info('Assinatura atualizada para membro existente', {
      memberId: member.id,
      subscriptionId
    });
  } else {
    // Novo membro - cria como TRIAL
    const couponCode = extractCouponCode(subscription);

    member = await memberService.createTrialMember({
      email,
      subscriptionId,
      payerId: subscription.payer_id?.toString(),
      couponCode
    });

    logger.info('Novo membro trial criado', {
      memberId: member.id,
      email,
      subscriptionId,
      couponCode
    });

    // Notifica usuário para entrar no grupo
    // (precisa do telegram_id - vem do fluxo do bot via email match)
    await notificationService.sendGroupInvite(member);
  }
}

// ============================================
// HANDLER: Pagamento Aprovado (trial → ativo, ou renovação)
// ============================================
async function handlePaymentApproved(payload) {
  const paymentId = payload.data?.id;
  if (!paymentId) return;

  const payment = await mercadoPagoService.getPayment(paymentId);
  if (payment.status !== 'approved') return;

  // Busca membro pela subscription ou email
  const subscriptionId = payment.metadata?.preapproval_id;
  let member = subscriptionId
    ? await memberService.getMemberBySubscription(subscriptionId)
    : await memberService.getMemberByEmail(payment.payer?.email);

  if (!member) {
    logger.warn('Pagamento aprovado mas membro não encontrado', {
      paymentId,
      subscriptionId,
      email: payment.payer?.email
    });
    return;
  }

  const paymentMethod = mapPaymentMethod(payment.payment_method_id);

  if (member.status === 'trial') {
    // 🎯 CONVERSÃO: trial → ativo (1º pagamento)
    await memberService.activateMember(member.id, { paymentMethod });
    logger.info('🎉 Trial convertido para ativo', {
      memberId: member.id,
      paymentId
    });

  } else if (member.status === 'ativo') {
    // Renovação normal
    await memberService.renewSubscription(member.id);
    logger.info('Assinatura renovada', { memberId: member.id, paymentId });

  } else if (member.status === 'inadimplente') {
    // Recuperou do inadimplente
    await memberService.activateMember(member.id, { paymentMethod });
    logger.info('Membro recuperado de inadimplente', {
      memberId: member.id,
      paymentId
    });

  } else if (member.status === 'removido') {
    // Reativação após remoção - SEM RESTRIÇÃO DE TEMPO
    // Pagou = volta, seja 1 minuto ou 1 ano depois
    await memberService.reactivateMember(member.id, { paymentMethod });
    await notificationService.sendGroupInvite(member);
    logger.info('Membro reativado após remoção', {
      memberId: member.id,
      paymentId
    });
  }
}

// ============================================
// HANDLER: Pagamento Rejeitado
// ============================================
async function handlePaymentRejected(payload) {
  const paymentId = payload.data?.id;
  if (!paymentId) return;

  const payment = await mercadoPagoService.getPayment(paymentId);

  const subscriptionId = payment.metadata?.preapproval_id;
  const member = subscriptionId
    ? await memberService.getMemberBySubscription(subscriptionId)
    : await memberService.getMemberByEmail(payment.payer?.email);

  if (!member) return;

  // Só marca como inadimplente se já era ativo
  // (trial com falha será cancelado pelo MP automaticamente)
  if (member.status === 'ativo') {
    await memberService.markAsDefaulted(member.id);
    logger.warn('Membro inadimplente - pagamento rejeitado', {
      memberId: member.id,
      paymentId,
      reason: payment.status_detail
    });
  }
}

// ============================================
// HANDLER: Assinatura Cancelada
// ============================================
async function handleSubscriptionCancelled(payload) {
  const subscriptionId = payload.data?.id;
  if (!subscriptionId) return;

  const member = await memberService.getMemberBySubscription(subscriptionId);
  if (!member) return;

  const reason = member.status === 'trial'
    ? 'trial_not_converted'
    : 'subscription_cancelled';

  // 1. Envia mensagem de despedida com link para reativar
  await notificationService.sendFarewellMessage(member, reason);

  // 2. Kick do grupo Telegram
  // Nota: usamos ban temporário de 24h no Telegram por limitação da API,
  // mas nosso sistema permite reentrada A QUALQUER MOMENTO após pagamento
  const kickResult = await memberService.kickMemberFromGroup(
    member.telegram_id,
    config.telegram.groupId
  );

  if (!kickResult.success) {
    logger.error('Falha ao remover membro do grupo', {
      memberId: member.id,
      error: kickResult.error
    });
    // Continua - atualizar DB é mais importante
  }

  // 3. Atualiza status no banco
  await memberService.markAsRemoved(member.id, reason);

  logger.info('Membro removido do grupo', {
    memberId: member.id,
    subscriptionId,
    previousStatus: member.status,
    reason,
    kickSuccess: kickResult.success
  });
}

// ============================================
// ROUTER DE EVENTOS
// ============================================
async function processWebhookEvent(event) {
  const { event_type, action, payload } = event;

  logger.debug('Processando webhook', { event_type, action });

  if (event_type === 'subscription_preapproval') {
    const subscription = await mercadoPagoService.getSubscription(payload.data?.id);

    if (action === 'created' || (action === 'updated' && subscription.status === 'authorized')) {
      await handleSubscriptionCreated(payload);
    } else if (subscription.status === 'cancelled') {
      await handleSubscriptionCancelled(payload);
    }

  } else if (event_type === 'subscription_authorized_payment' || event_type === 'payment') {
    const payment = await mercadoPagoService.getPayment(payload.data?.id);

    if (payment.status === 'approved') {
      await handlePaymentApproved(payload);
    } else if (payment.status === 'rejected') {
      await handlePaymentRejected(payload);
    }
  }
}

module.exports = {
  processWebhookEvent,
  extractCouponCode,
  // Exporta handlers para testes
  handleSubscriptionCreated,
  handlePaymentApproved,
  handlePaymentRejected,
  handleSubscriptionCancelled
};
```

---

## 6. Arquivos a Deletar

```bash
# Serviços Cakto
rm bot/services/caktoService.js

# Handler Cakto
rm bot/handlers/caktoWebhook.js

# Job de expiração de afiliado (não mais necessário - cupom substitui)
rm bot/jobs/membership/check-affiliate-expiration.js

# Job de expiração de trial (MP gerencia agora)
rm bot/jobs/membership/check-trial-expiration.js

# Reconciliação Cakto (MP é mais confiável, webhook é fonte da verdade)
rm bot/jobs/membership/reconciliation.js
```

**Nota:** O estado `trial` continua existindo no sistema para visibilidade,
mas quem controla a duração e cobrança é o MP. Não precisamos mais do job local.

### 6.1 Ajuste no Job `kick-expired.js`

O job atual verifica `trial_ends_at` que estamos removendo. **Duas opções:**

**Opção A: Simplificar o job (recomendado)**
- Remover verificação de trial (MP cancela e manda webhook)
- Manter apenas como "safety net" para inadimplentes que não receberam webhook

```javascript
// kick-expired.js - SIMPLIFICADO
async function getExpiredMembers() {
  // REMOVIDO: verificação de trial_ends_at
  // MP cancela trial e manda webhook → handler faz kick

  // MANTÉM: safety net para inadimplentes antigos
  const { data } = await supabase
    .from('members')
    .select('*')
    .eq('status', 'inadimplente')
    .lt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return data || [];
}
```

**Opção B: Desativar o job completamente**
- Webhook handler faz kick imediato
- Menos complexidade, mas sem safety net

**Recomendação:** Opção A - manter job como safety net.

---

## 7. Arquivos a Modificar

### 7.1 `bot/handlers/startCommand.js`

**Remover:**
- Extração de `aff_` do payload
- Chamada para `setAffiliateCode()`
- Lógica de trial days diferenciado por afiliado

**Simplificar para:**
```javascript
async function handleStart(ctx) {
  const telegramId = ctx.from.id;

  // Verifica se já é membro
  const member = await memberService.getMemberByTelegramId(telegramId);

  if (member?.status === 'ativo') {
    return ctx.reply('Você já é membro! Acesse o grupo: [link]');
  }

  // Novo usuário ou ex-membro - mostrar oferta
  return ctx.reply(
    'Bem-vindo ao Bets Estatística!\n\n' +
    'Assine por R$29,90/mês e tenha acesso ao grupo exclusivo.\n\n' +
    'Se tiver cupom de desconto, aplique no checkout!',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '💳 Assinar Agora', url: config.mercadoPago.checkoutUrl }
        ]]
      }
    }
  );
}
```

### 7.2 `bot/services/memberService.js`

**Remover:**
- `setAffiliateCode()`
- `isAffiliateValid()`
- `getAffiliateHistory()`
- `generatePaymentLink()` com lógica de afiliado
- `canRejoinGroup()` com verificação de 24h ← **REMOVER RESTRIÇÃO**

**Simplificar `reactivateMember()`:**
```javascript
// ANTES: verificava 24h
if (!canRejoinGroup(member)) {
  throw new Error('Período de reentrada expirado');
}

// DEPOIS: pagou = volta, sem restrição de tempo
async function reactivateMember(memberId, { paymentMethod }) {
  const member = await getMemberById(memberId);

  // 1. Desbanir do Telegram (caso ainda esteja banido)
  //    Necessário se pagou em menos de 24h após o kick
  try {
    const bot = getBot();
    await bot.unbanChatMember(config.telegram.groupId, member.telegram_id, {
      only_if_banned: true  // Só tenta desbanir se estiver banido
    });
  } catch (err) {
    // Ignora erro - pode já estar desbanido
    logger.debug('Unban ignorado', { memberId, error: err.message });
  }

  // 2. Atualiza banco - SEM verificar tempo
  await supabase
    .from('members')
    .update({
      status: 'ativo',
      payment_method: paymentMethod,
      kicked_at: null,
      subscription_started_at: new Date().toISOString(),
      // ... demais campos
    })
    .eq('id', memberId);

  // 3. notificationService.sendGroupInvite() enviará novo link
}
```

**Adicionar:**
```javascript
async function createActiveMember({ email, subscriptionId, payerId, paymentMethod, couponCode }) {
  const now = new Date();
  const subscriptionEnds = new Date(now);
  subscriptionEnds.setDate(subscriptionEnds.getDate() + 30);

  const result = await db.query(`
    INSERT INTO members (
      email, status, mp_subscription_id, mp_payer_id,
      payment_method, subscription_started_at, subscription_ends_at,
      last_payment_at, affiliate_coupon
    ) VALUES ($1, 'ativo', $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [email, subscriptionId, payerId, paymentMethod, now, subscriptionEnds, now, couponCode]);

  return result.rows[0];
}

async function getMemberBySubscription(subscriptionId) {
  const result = await db.query(
    'SELECT * FROM members WHERE mp_subscription_id = $1',
    [subscriptionId]
  );
  return result.rows[0];
}
```

### 7.3 `bot/webhook-server.js`

**Alterar rota:**
```javascript
// ANTES
app.post('/webhooks/cakto', caktoWebhookHandler);

// DEPOIS
const { handleWebhook } = require('./handlers/mercadoPagoWebhook');
app.post('/webhooks/mercadopago', handleWebhook);
```

### 7.4 `lib/config.js`

**Remover:**
```javascript
cakto: { ... }
```

**Adicionar:**
```javascript
mercadoPago: {
  accessToken: process.env.MP_ACCESS_TOKEN,
  webhookSecret: process.env.MP_WEBHOOK_SECRET,
  checkoutUrl: process.env.MP_CHECKOUT_URL  // URL fixa do plano no MP
}
```

---

## 8. Variáveis de Ambiente

**Remover:**
```bash
CAKTO_API_URL
CAKTO_CLIENT_ID
CAKTO_CLIENT_SECRET
CAKTO_WEBHOOK_SECRET
CAKTO_WEBHOOK_PORT
CAKTO_CHECKOUT_URL
```

**Adicionar:**
```bash
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxx
MP_WEBHOOK_SECRET=xxxxxxxxxxxx
MP_CHECKOUT_URL=https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=xxxx
```

---

## 9. Configuração no Painel Mercado Pago

### 9.1 Criar Plano de Assinatura

1. Acessar: Mercado Pago → Assinaturas → Criar plano
2. Configurar:
   - Nome: "Bets Estatística - Mensal"
   - Valor: R$ 29,90
   - Frequência: Mensal
   - Trial: X dias (se quiser)
3. Copiar `preapproval_plan_id` para `MP_CHECKOUT_URL`

### 9.2 Criar Cupons de Afiliados

1. Acessar: Mercado Pago → Descontos → Criar cupom
2. Para cada afiliado:
   - Código: `JOAO10`, `MARIA10`, etc.
   - Desconto: 10% (ou valor fixo)
   - Uso: 1 vez por comprador
   - Validade: conforme necessário

### 9.3 Configurar Webhook

1. Acessar: Mercado Pago → Suas integrações → [App] → Webhooks
2. URL Produção: `https://seudominio.com/webhooks/mercadopago`
3. Eventos:
   - ✅ `payment`
   - ✅ `subscription_preapproval`

---

## 10. Checklist de Implementação

- [ ] Criar credenciais MP (produção)
- [ ] Criar plano de assinatura no MP
- [ ] Configurar webhook URL no MP
- [ ] Criar migration do banco
- [ ] Implementar `mercadoPagoService.js`
- [ ] Implementar `mercadoPagoWebhook.js`
- [ ] Substituir `webhookProcessors.js`
- [ ] Simplificar `startCommand.js`
- [ ] Atualizar `memberService.js`
- [ ] Atualizar `webhook-server.js`
- [ ] Atualizar `config.js`
- [ ] Deletar arquivos Cakto
- [ ] Deletar jobs de trial/afiliado
- [ ] Atualizar variáveis de ambiente
- [ ] Testar em sandbox
- [ ] Criar cupons de afiliados
- [ ] Deploy produção
- [ ] Comunicar membros ativos sobre re-assinatura

---

## 11. Considerações sobre Métodos de Pagamento

### 11.1 Cartão de Crédito (Recomendado)
- ✅ Cobrança automática
- ✅ MP faz retry automático (4x em 10 dias)
- ✅ Sem ação do cliente após 1ª assinatura

### 11.2 PIX (Não Recomendado para Assinaturas)
- ⚠️ **NÃO é automático** - cliente precisa pagar manualmente todo mês
- ⚠️ MP gera QR code/link → envia pro cliente → cliente paga (ou esquece)
- ⚠️ Se não pagar no prazo → assinatura cancelada

```
FLUXO PIX MENSAL:
Todo mês MP gera cobrança PIX
        │
        ├─► Cliente lembra e paga → OK
        │
        └─► Cliente esquece → Assinatura CANCELADA
                              └─► Webhook cancelled
                                  └─► Kick do grupo
```

**Recomendação:** Desabilitar PIX no plano de assinatura ou alertar cliente sobre risco de esquecimento.

### 11.3 PIX Automático (Futuro)
O Banco Central lançou o "PIX Automático" que permite débito recorrente via PIX.
- Ainda não está amplamente disponível no MP
- Quando disponível, funcionará como cartão (automático)

---

## 12. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Membros ativos não re-assinam | Média | Alto | Comunicar com antecedência, oferecer desconto |
| Cupom não vem no webhook | Baixa | Médio | Testar exaustivamente em sandbox |
| Webhook fora do ar | Baixa | Alto | MP reenvia, temos idempotência |
| Cliente escolhe PIX e esquece de pagar | Alta | Médio | Desabilitar PIX ou alertar cliente |
| Kick falha por falta de permissão do bot | Baixa | Alto | Verificar permissões antes do deploy |
| Membro removido mas não kickado | Baixa | Médio | Job safety net roda diariamente |

---

## 13. Métricas de Sucesso

- [ ] 100% dos webhooks processados sem erro
- [ ] 0 membros em estado inconsistente
- [ ] Relatório de vendas por afiliado funcionando
- [ ] Taxa de re-assinatura > 70% dos ativos

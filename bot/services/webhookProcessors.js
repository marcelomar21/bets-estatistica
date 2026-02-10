/**
 * Webhook Processors - Mercado Pago
 * Tech-Spec: Migração Cakto → Mercado Pago
 * Story 4.3: Multi-tenant webhook processing
 *
 * Processa eventos de webhook salvos na tabela webhook_events.
 * Chamado pelo job process-webhooks.js.
 *
 * Eventos processados:
 * - subscription_preapproval (created/cancelled): Criação/cancelamento de assinatura
 * - subscription_authorized_payment / payment: Pagamentos aprovados/rejeitados
 */
const mercadoPagoService = require('./mercadoPagoService');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { supabase } = require('../../lib/supabase');

// Lazy load memberService to avoid circular dependency
let _memberService = null;
function getMemberService() {
  if (!_memberService) {
    _memberService = require('./memberService');
  }
  return _memberService;
}

// Lazy load notificationService to avoid circular dependency
let _notificationService = null;
function getNotificationService() {
  if (!_notificationService) {
    _notificationService = require('./notificationService');
  }
  return _notificationService;
}

// Story 4.4: Lazy load sendPaymentConfirmation from memberEvents
let _sendPaymentConfirmation = null;
function getSendPaymentConfirmation() {
  if (!_sendPaymentConfirmation) {
    const { sendPaymentConfirmation } = require('../handlers/memberEvents');
    _sendPaymentConfirmation = sendPaymentConfirmation;
  }
  return _sendPaymentConfirmation;
}

// Lazy load telegram bot to send admin notifications
let _bot = null;
function getBot() {
  if (!_bot) {
    const { getBot: getTelegramBot } = require('../telegram');
    _bot = getTelegramBot();
  }
  return _bot;
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ============================================
// Story 4.3: GROUP RESOLUTION (AC2)
// ============================================

/**
 * Resolve group from subscription data via preapproval_plan_id → groups.mp_plan_id
 * @param {object} subscriptionData - Subscription data from MP API
 * @returns {Promise<{success: boolean, data: {groupId: string|null, group: object|null, fallback?: string}}>}
 */
async function resolveGroupFromSubscription(subscriptionData) {
  const planId = subscriptionData?.preapproval_plan_id;
  const externalReference = subscriptionData?.external_reference
    || subscriptionData?.metadata?.external_reference
    || subscriptionData?.metadata?.group_id
    || null;

  if (planId) {
    try {
      const { data: group, error } = await supabase
        .from('groups')
        .select('*')
        .eq('mp_plan_id', planId)
        .eq('status', 'active')
        .single();

      if (!error && group) {
        logger.info('[webhookProcessors] resolveGroupFromSubscription: resolved via mp_plan_id', {
          planId,
          groupId: group.id,
          groupName: group.name,
        });

        return { success: true, data: { groupId: group.id, group } };
      }

      logger.warn('[webhookProcessors] resolveGroupFromSubscription: plan not found or inactive, trying external_reference', {
        planId,
        error: error?.code,
      });
    } catch (err) {
      logger.error('[webhookProcessors] resolveGroupFromSubscription: unexpected plan lookup error', {
        planId,
        error: err.message,
      });
    }
  } else {
    logger.warn('[webhookProcessors] resolveGroupFromSubscription: no preapproval_plan_id, trying external_reference', {
      subscriptionId: subscriptionData?.id,
    });
  }

  const externalReferenceResult = await resolveGroupFromExternalReference(externalReference, {
    source: 'subscription',
    subscriptionId: subscriptionData?.id,
    planId,
  });
  if (externalReferenceResult.data.groupId) {
    return externalReferenceResult;
  }

  return { success: true, data: { groupId: null, group: null, fallback: 'single-tenant' } };
}

/**
 * Resolve group from payment data by finding subscription → preapproval_plan_id
 * @param {object} paymentData - Payment data from MP API
 * @returns {Promise<{success: boolean, data: {groupId: string|null, group: object|null, fallback?: string}}>}
 */
async function resolveGroupFromPayment(paymentData) {
  const paymentExternalReference = paymentData?.external_reference
    || paymentData?.metadata?.external_reference
    || paymentData?.metadata?.group_id
    || null;

  // Try to get subscription ID from payment
  const subscriptionId = paymentData?.point_of_interaction?.transaction_data?.subscription_id
    || paymentData?.metadata?.preapproval_id
    || paymentData?.preapproval_id;

  if (!subscriptionId) {
    logger.warn('[webhookProcessors] resolveGroupFromPayment: no subscription_id in payment, trying external_reference', {
      paymentId: paymentData?.id,
    });

    const externalReferenceResult = await resolveGroupFromExternalReference(paymentExternalReference, {
      source: 'payment',
      paymentId: paymentData?.id,
    });
    if (externalReferenceResult.data.groupId) {
      return externalReferenceResult;
    }

    return { success: true, data: { groupId: null, group: null, fallback: 'single-tenant' } };
  }

  // Fetch subscription to get preapproval_plan_id
  const subscriptionResult = await mercadoPagoService.getSubscription(subscriptionId);
  if (!subscriptionResult.success) {
    logger.warn('[webhookProcessors] resolveGroupFromPayment: failed to fetch subscription, trying external_reference', {
      subscriptionId,
      error: subscriptionResult.error,
    });

    const externalReferenceResult = await resolveGroupFromExternalReference(paymentExternalReference, {
      source: 'payment',
      paymentId: paymentData?.id,
      subscriptionId,
    });
    if (externalReferenceResult.data.groupId) {
      return externalReferenceResult;
    }

    return { success: true, data: { groupId: null, group: null, fallback: 'single-tenant' } };
  }

  return resolveGroupFromSubscription(subscriptionResult.data);
}

/**
 * Try to resolve group from external_reference fallback.
 * external_reference is expected to include group_id from MP onboarding.
 * @param {string|null|undefined} externalReference
 * @param {object} context - Logging context
 * @returns {Promise<{success: boolean, data: {groupId: string|null, group: object|null, fallback?: string}}>}
 */
async function resolveGroupFromExternalReference(externalReference, context = {}) {
  const candidate = extractGroupIdFromExternalReference(externalReference);
  if (!candidate) {
    logger.warn('[webhookProcessors] resolveGroupFromExternalReference: no valid group_id candidate', {
      ...context,
      hasExternalReference: !!externalReference,
    });
    return { success: true, data: { groupId: null, group: null, fallback: 'single-tenant' } };
  }

  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', candidate)
      .eq('status', 'active')
      .single();

    if (error || !group) {
      logger.warn('[webhookProcessors] resolveGroupFromExternalReference: group not found or inactive', {
        ...context,
        externalReference: externalReference?.toString?.().slice(0, 80),
        candidate,
        error: error?.code,
      });
      return { success: true, data: { groupId: null, group: null, fallback: 'single-tenant' } };
    }

    logger.info('[webhookProcessors] resolveGroupFromExternalReference: resolved', {
      ...context,
      candidate,
      groupId: group.id,
      groupName: group.name,
    });

    return { success: true, data: { groupId: group.id, group } };
  } catch (err) {
    logger.error('[webhookProcessors] resolveGroupFromExternalReference: unexpected error', {
      ...context,
      candidate,
      error: err.message,
    });
    return { success: true, data: { groupId: null, group: null, fallback: 'single-tenant' } };
  }
}

function extractGroupIdFromExternalReference(externalReference) {
  if (externalReference === null || externalReference === undefined) {
    return null;
  }

  const value = String(externalReference).trim();
  if (!value) {
    return null;
  }

  const uuidMatch = value.match(UUID_REGEX);
  return uuidMatch ? uuidMatch[0] : null;
}

/**
 * Update webhook_events row with resolved group_id
 * @param {string|number} eventId - webhook_events.id
 * @param {string|null} groupId - Resolved group UUID
 */
async function updateWebhookEventGroupId(eventId, groupId) {
  if (!eventId || !groupId) return;

  try {
    const { error } = await supabase
      .from('webhook_events')
      .update({ group_id: groupId })
      .eq('id', eventId);

    if (error) {
      logger.warn('[webhookProcessors] updateWebhookEventGroupId: update error', {
        eventId,
        groupId,
        error: error.message || error.code,
      });
      return;
    }

    logger.debug('[webhookProcessors] updateWebhookEventGroupId: updated', { eventId, groupId });
  } catch (err) {
    // Non-critical: don't fail webhook processing for audit tracking
    logger.warn('[webhookProcessors] updateWebhookEventGroupId: failed', {
      eventId,
      groupId,
      error: err.message,
    });
  }
}

// ============================================
// ADMIN NOTIFICATION (AC8 - multi-tenant)
// ============================================

/**
 * Send payment notification to admin group
 * Story 4.3: Supports multi-tenant admin group targeting
 * @param {object} params - Notification params
 * @param {string} params.email - Payer email
 * @param {number} params.amount - Payment amount
 * @param {string} params.action - Action type (new_member, conversion, renewal, recovery, reactivation)
 * @param {number} [params.memberId] - Member ID if available
 * @param {string} [params.groupId] - Group UUID for multi-tenant
 * @param {string} [params.groupName] - Group name for notification
 * @param {string} [params.adminGroupId] - Group-specific admin Telegram group ID
 */
async function notifyAdminPayment({ email, amount, action, memberId, groupId, groupName, adminGroupId }) {
  try {
    const bot = getBot();
    // AC8: Use group-specific admin group, fallback to config
    const targetAdminGroupId = adminGroupId || config.telegram.adminGroupId;

    if (!bot || !targetAdminGroupId) {
      logger.warn('[webhookProcessors] notifyAdminPayment: bot or adminGroupId not configured');
      return;
    }

    const actionEmojis = {
      new_member: '🆕',
      conversion: '🎉',
      renewal: '🔄',
      recovery: '💪',
      reactivation: '🔙'
    };

    const actionTexts = {
      new_member: 'Novo membro ativo',
      conversion: 'Trial convertido',
      renewal: 'Assinatura renovada',
      recovery: 'Recuperado de inadimplente',
      reactivation: 'Reativação'
    };

    const emoji = actionEmojis[action] || '💰';
    const actionText = actionTexts[action] || 'Pagamento aprovado';
    const amountFormatted = (amount || 50).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // AC8: Include group name in notification
    const groupLine = groupName ? `📋 Grupo: ${groupName}` : '';

    const message = `
${emoji} *${actionText}!*

📧 ${email}
💰 ${amountFormatted}
${groupLine}
${memberId ? `🆔 ID: ${memberId}` : ''}
    `.trim();

    await bot.sendMessage(targetAdminGroupId, message, { parse_mode: 'Markdown' });

    logger.info('[webhookProcessors] notifyAdminPayment: sent', { email, action, amount, groupId });
  } catch (err) {
    // Don't fail the webhook processing if notification fails
    logger.warn('[webhookProcessors] notifyAdminPayment: failed', { error: err.message });
  }
}

/**
 * Build notification context from resolved group
 * @param {object|null} group - Resolved group object
 * @returns {object} Notification context with adminGroupId, groupName, groupId
 */
function buildNotifyContext(group) {
  if (!group) return {};
  return {
    groupId: group.id,
    groupName: group.name,
    adminGroupId: group.telegram_admin_group_id || null,
  };
}

// ============================================
// HANDLER: Assinatura Criada (trial inicia)
// Story 4.3: Added groupId resolution and eventContext
// ============================================
async function handleSubscriptionCreated(payload, eventContext = {}) {
  const subscriptionId = payload.data?.id;
  if (!subscriptionId) {
    logger.warn('[webhookProcessors] handleSubscriptionCreated: missing subscription ID');
    return { success: false, error: { code: 'MISSING_SUBSCRIPTION_ID', message: 'Missing subscription ID' } };
  }

  // Buscar detalhes da assinatura no MP
  const subscriptionResult = await mercadoPagoService.getSubscription(subscriptionId);
  if (!subscriptionResult.success) {
    logger.error('[webhookProcessors] handleSubscriptionCreated: failed to fetch subscription', {
      subscriptionId,
      error: subscriptionResult.error
    });
    return { success: false, error: subscriptionResult.error };
  }

  const subscription = subscriptionResult.data;

  // Story 4.3: Resolve group from subscription
  const groupResult = await resolveGroupFromSubscription(subscription);
  const groupId = groupResult.data.groupId;
  const group = groupResult.data.group;

  // Story 4.3: Update webhook_events with resolved group_id (AC5)
  await updateWebhookEventGroupId(eventContext.eventId, groupId);

  // Só processa assinaturas autorizadas (cartão validado)
  if (subscription.status !== 'authorized') {
    logger.info('[webhookProcessors] handleSubscriptionCreated: ignoring non-authorized subscription', {
      subscriptionId,
      status: subscription.status
    });
    return { success: true, data: { skipped: true, reason: 'not_authorized' } };
  }

  const email = subscription.payer_email;
  const payerId = subscription.payer_id?.toString();

  // Extrair cupom de afiliado
  const couponCode = mercadoPagoService.extractCouponCode(subscription);

  const memberService = getMemberService();

  // Se não tem email, tentar vincular por payer_id (membro já criado via payment R$0)
  if (!email) {
    logger.info('[webhookProcessors] handleSubscriptionCreated: no email, trying to link by payer_id', {
      subscriptionId,
      payerId
    });

    if (payerId) {
      const payerResult = await memberService.getMemberByPayerId(payerId, groupId);
      if (payerResult.success) {
        // Membro encontrado por payer_id - vincular subscription
        const member = payerResult.data;
        const updateResult = await memberService.updateSubscriptionData(member.id, {
          subscriptionId,
          payerId,
          couponCode
        });

        if (updateResult.success) {
          logger.info('[webhookProcessors] handleSubscriptionCreated: linked subscription to member by payer_id', {
            memberId: member.id,
            subscriptionId,
            payerId,
            groupId
          });
          return { success: true, data: { memberId: member.id, action: 'linked_by_payer_id' } };
        }
      }
    }

    // Não conseguiu vincular - marcar como skipped para não ficar falhando
    logger.warn('[webhookProcessors] handleSubscriptionCreated: could not link subscription (no email, payer_id not found)', {
      subscriptionId,
      payerId
    });
    return { success: true, data: { skipped: true, reason: 'no_email_no_payer_match' } };
  }

  // Story 4.3: Verificar se já existe membro com esse email (filtrar por groupId)
  const existingResult = await memberService.getMemberByEmail(email, groupId);

  if (existingResult.success) {
    // Membro existente - atualizar subscription ID
    const member = existingResult.data;

    const updateResult = await memberService.updateSubscriptionData(member.id, {
      subscriptionId,
      payerId: subscription.payer_id?.toString(),
      couponCode
    });

    if (!updateResult.success) {
      logger.error('[webhookProcessors] handleSubscriptionCreated: failed to update existing member', {
        memberId: member.id,
        error: updateResult.error
      });
      return { success: false, error: updateResult.error };
    }

    logger.info('[webhookProcessors] handleSubscriptionCreated: updated existing member', {
      memberId: member.id,
      subscriptionId,
      groupId
    });

    return { success: true, data: { memberId: member.id, action: 'updated' } };
  }

  // Story 4.3: Novo membro - criar como TRIAL com groupId
  const createResult = await memberService.createTrialMemberMP({
    email,
    subscriptionId,
    payerId: subscription.payer_id?.toString(),
    couponCode,
    groupId
  });

  if (!createResult.success) {
    logger.error('[webhookProcessors] handleSubscriptionCreated: failed to create trial member', {
      email,
      error: createResult.error
    });
    return { success: false, error: createResult.error };
  }

  const newMember = createResult.data;

  logger.info('[webhookProcessors] handleSubscriptionCreated: new trial member created', {
    memberId: newMember.id,
    email,
    subscriptionId,
    couponCode,
    groupId
  });

  return { success: true, data: { memberId: newMember.id, action: 'created' } };
}

// ============================================
// HANDLER: Pagamento Aprovado (trial → ativo, ou renovação)
// Story 4.3: Added groupId resolution and multi-tenant member lookup
// ============================================
async function handlePaymentApproved(payload, eventContext = {}, paymentData = null) {
  const paymentId = payload.data?.id;
  if (!paymentId) {
    logger.warn('[webhookProcessors] handlePaymentApproved: missing payment ID');
    return { success: false, error: { code: 'MISSING_PAYMENT_ID', message: 'Missing payment ID' } };
  }

  // Usar dados já obtidos ou buscar via API
  let payment = paymentData;
  if (!payment) {
    const paymentResult = await mercadoPagoService.getPayment(paymentId);
    if (!paymentResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to fetch payment', {
        paymentId,
        error: paymentResult.error
      });
      return { success: false, error: paymentResult.error };
    }
    payment = paymentResult.data;
  }

  // Verificar se pagamento foi aprovado
  if (payment.status !== 'approved') {
    logger.info('[webhookProcessors] handlePaymentApproved: ignoring non-approved payment', {
      paymentId,
      status: payment.status
    });
    return { success: true, data: { skipped: true, reason: 'not_approved' } };
  }

  // Story 4.3: Resolve group from payment (AC2)
  const groupResult = await resolveGroupFromPayment(payment);
  const groupId = groupResult.data.groupId;
  const group = groupResult.data.group;
  const notifyCtx = buildNotifyContext(group);

  // Story 4.3: Update webhook_events with resolved group_id (AC5)
  await updateWebhookEventGroupId(eventContext.eventId, groupId);

  const memberService = getMemberService();

  // Story 4.3: Buscar membro pela subscription ou email (com group_id filter - AC3)
  const subscriptionId = payment.point_of_interaction?.transaction_data?.subscription_id ||
                         payment.metadata?.preapproval_id;
  let member = null;

  if (subscriptionId) {
    const subResult = await memberService.getMemberBySubscription(subscriptionId, groupId);
    if (subResult.success) {
      member = subResult.data;
    }
  }

  if (!member && payment.payer?.email) {
    const emailResult = await memberService.getMemberByEmail(payment.payer.email, groupId);
    if (emailResult.success) {
      member = emailResult.data;
    }
  }

  // AC3 fallback: if not found in tenant, search globally by email and validate tenant ownership
  if (!member && payment.payer?.email && groupId) {
    const globalEmailResult = await memberService.getMemberByEmail(payment.payer.email, null);
    if (globalEmailResult.success) {
      const globalMember = globalEmailResult.data;
      const belongsToResolvedGroup = !globalMember.group_id || globalMember.group_id === groupId;

      if (belongsToResolvedGroup) {
        member = globalMember;
        logger.info('[webhookProcessors] handlePaymentApproved: using global email fallback with tenant validation', {
          paymentId,
          memberId: globalMember.id,
          memberGroupId: globalMember.group_id || null,
          resolvedGroupId: groupId,
        });
      } else {
        logger.warn('[webhookProcessors] handlePaymentApproved: global email fallback rejected due to group mismatch', {
          paymentId,
          email: payment.payer.email,
          memberId: globalMember.id,
          memberGroupId: globalMember.group_id,
          resolvedGroupId: groupId,
        });
      }
    }
  }

  if (!member) {
    // Membro não existe - criar como ativo diretamente
    const email = payment.payer?.email;
    if (!email) {
      logger.warn('[webhookProcessors] handlePaymentApproved: member not found and no email', {
        paymentId,
        subscriptionId
      });
      return { success: false, error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found and no email to create' } };
    }

    logger.info('[webhookProcessors] handlePaymentApproved: creating new member from payment', {
      paymentId,
      email,
      subscriptionId,
      groupId
    });

    // Story 4.3: Criar membro com groupId
    const createResult = await memberService.createTrialMemberMP({
      email,
      subscriptionId: subscriptionId,
      payerId: payment.payer?.id?.toString(),
      couponCode: null,
      groupId
    });

    if (!createResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to create member', {
        email,
        error: createResult.error
      });
      return { success: false, error: createResult.error };
    }

    // Agora ativa o membro recém-criado
    const paymentMethod = mercadoPagoService.mapPaymentMethod(payment.payment_method_id);
    const activateResult = await memberService.activateMember(createResult.data.id, {
      subscriptionId: subscriptionId,
      customerId: payment.payer?.id?.toString(),
      paymentMethod
    });

    if (!activateResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to activate new member', {
        memberId: createResult.data.id,
        error: activateResult.error
      });
      return { success: false, error: activateResult.error };
    }

    logger.info('[webhookProcessors] 🎉 New active member created from payment', {
      memberId: createResult.data.id,
      email,
      paymentId,
      groupId
    });

    // Story 4.4: Send DM confirmation for new member (AC1)
    if (activateResult.data.telegram_id) {
      try {
        const sendPaymentConfirmation = getSendPaymentConfirmation();
        await sendPaymentConfirmation(
          activateResult.data.telegram_id,
          createResult.data.id,
          activateResult.data.subscription_ends_at,
          group?.name
        );
        logger.info('[webhook:payment] DM confirmação enviada', { memberId: createResult.data.id, telegramId: activateResult.data.telegram_id });
      } catch (dmErr) {
        logger.warn('[webhook:payment] Falha ao enviar DM de confirmação', {
          memberId: createResult.data.id,
          telegramId: activateResult.data.telegram_id,
          error: dmErr.message
        });
      }
    }

    // AC8: Notify admin group (multi-tenant)
    await notifyAdminPayment({
      email,
      amount: payment.transaction_amount,
      action: 'new_member',
      memberId: createResult.data.id,
      ...notifyCtx
    });

    return { success: true, data: { memberId: createResult.data.id, action: 'created_active' } };
  }

  const paymentMethod = mercadoPagoService.mapPaymentMethod(payment.payment_method_id);

  // Processar de acordo com status atual do membro
  if (member.status === 'trial') {
    // 🎯 CONVERSÃO: trial → ativo (1º pagamento)
    const activateResult = await memberService.activateMember(member.id, {
      subscriptionId: subscriptionId || member.mp_subscription_id,
      customerId: payment.payer?.id?.toString(),
      paymentMethod
    });

    if (!activateResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to activate member', {
        memberId: member.id,
        error: activateResult.error
      });
      return { success: false, error: activateResult.error };
    }

    logger.info('[webhookProcessors] 🎉 Trial converted to active', {
      memberId: member.id,
      paymentId,
      groupId
    });

    // Story 4.4: Send DM confirmation (AC1, AC2)
    try {
      const sendPaymentConfirmation = getSendPaymentConfirmation();
      await sendPaymentConfirmation(
        member.telegram_id,
        member.id,
        activateResult.data.subscription_ends_at,
        group?.name
      );
      logger.info('[webhook:payment] DM confirmação enviada', { memberId: member.id, telegramId: member.telegram_id });
    } catch (dmErr) {
      logger.warn('[webhook:payment] Falha ao enviar DM de confirmação', {
        memberId: member.id,
        telegramId: member.telegram_id,
        error: dmErr.message
      });
    }

    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'conversion',
      memberId: member.id,
      ...notifyCtx
    });

    return { success: true, data: { memberId: member.id, action: 'activated' } };

  } else if (member.status === 'ativo') {
    // Renovação normal
    const renewResult = await memberService.renewMemberSubscription(member.id);

    if (!renewResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to renew subscription', {
        memberId: member.id,
        error: renewResult.error
      });
      return { success: false, error: renewResult.error };
    }

    logger.info('[webhookProcessors] Subscription renewed', {
      memberId: member.id,
      paymentId,
      groupId
    });

    // Story 4.4: Send DM confirmation for renewal (AC5)
    try {
      const sendPaymentConfirmation = getSendPaymentConfirmation();
      await sendPaymentConfirmation(
        member.telegram_id,
        member.id,
        renewResult.data.subscription_ends_at,
        group?.name
      );
      logger.info('[webhook:payment] DM confirmação enviada', { memberId: member.id, telegramId: member.telegram_id });
    } catch (dmErr) {
      logger.warn('[webhook:payment] Falha ao enviar DM de confirmação', {
        memberId: member.id,
        telegramId: member.telegram_id,
        error: dmErr.message
      });
    }

    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'renewal',
      memberId: member.id,
      ...notifyCtx
    });

    return { success: true, data: { memberId: member.id, action: 'renewed' } };

  } else if (member.status === 'inadimplente') {
    // Recuperou do inadimplente
    const activateResult = await memberService.activateMember(member.id, {
      subscriptionId: subscriptionId || member.mp_subscription_id,
      customerId: payment.payer?.id?.toString(),
      paymentMethod
    });

    if (!activateResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to recover from defaulted', {
        memberId: member.id,
        error: activateResult.error
      });
      return { success: false, error: activateResult.error };
    }

    logger.info('[webhookProcessors] Member recovered from defaulted', {
      memberId: member.id,
      paymentId,
      groupId
    });

    // Story 4.4: Send DM confirmation for recovery (AC6)
    try {
      const sendPaymentConfirmation = getSendPaymentConfirmation();
      await sendPaymentConfirmation(
        member.telegram_id,
        member.id,
        activateResult.data.subscription_ends_at,
        group?.name
      );
      logger.info('[webhook:payment] DM confirmação enviada', { memberId: member.id, telegramId: member.telegram_id });
    } catch (dmErr) {
      logger.warn('[webhook:payment] Falha ao enviar DM de confirmação', {
        memberId: member.id,
        telegramId: member.telegram_id,
        error: dmErr.message
      });
    }

    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'recovery',
      memberId: member.id,
      ...notifyCtx
    });

    return { success: true, data: { memberId: member.id, action: 'recovered' } };

  } else if (member.status === 'removido') {
    // Reativação após remoção - SEM RESTRIÇÃO DE TEMPO
    const reactivateResult = await memberService.reactivateRemovedMember(member.id, {
      subscriptionId: subscriptionId || member.mp_subscription_id,
      paymentMethod
    });

    if (!reactivateResult.success) {
      logger.error('[webhookProcessors] handlePaymentApproved: failed to reactivate member', {
        memberId: member.id,
        error: reactivateResult.error
      });
      return { success: false, error: reactivateResult.error };
    }

    // Story 4.4: Check group membership and handle re-add (AC3)
    if (member.telegram_id) {
      // Keep legacy fallback only when no tenant was resolved (single-tenant mode).
      const groupTelegramId = group?.telegram_group_id || (!groupId ? config.telegram.publicGroupId : null);

      if (!groupTelegramId) {
        logger.warn('[webhook:payment] Missing telegram group for reactivation flow', {
          memberId: member.id,
          groupId: groupId || null
        });
      } else {
        try {
          const bot = getBot();
          let isInGroup = false;

          try {
            const chatMember = await bot.getChatMember(groupTelegramId, member.telegram_id);
            isInGroup = ['member', 'administrator', 'creator'].includes(chatMember.status);
          } catch (checkErr) {
            logger.warn('[webhook:payment] Could not check group membership', {
              telegramId: member.telegram_id, error: checkErr.message
            });
            isInGroup = false; // Assume not in group
          }

          if (isInGroup) {
            // AC4: Member still in group — just send DM confirmation
            try {
              const sendPaymentConfirmation = getSendPaymentConfirmation();
              await sendPaymentConfirmation(
                member.telegram_id,
                member.id,
                reactivateResult.data.subscription_ends_at,
                group?.name
              );
              logger.info('[webhook:payment] DM confirmação enviada', { memberId: member.id, telegramId: member.telegram_id });
            } catch (dmErr) {
              logger.warn('[webhook:payment] Falha ao enviar DM de confirmação', {
                memberId: member.id,
                telegramId: member.telegram_id,
                error: dmErr.message
              });
            }
          } else {
            // AC3: Member NOT in group — unban + send reactivation notification with invite link
            try {
              await bot.unbanChatMember(groupTelegramId, member.telegram_id, { only_if_banned: true });
              logger.info('[webhook:payment] User unbanned for reactivation', { memberId: member.id, telegramId: member.telegram_id });
            } catch (unbanErr) {
              logger.warn('[webhook:payment] Failed to unban user (may not be banned)', {
                memberId: member.id, error: unbanErr.message
              });
            }

            const notificationService = getNotificationService();
            try {
              await notificationService.sendReactivationNotification(
                member.telegram_id,
                member.id,
                groupTelegramId
              );
              logger.info('[webhook:payment] Reactivation notification enviada', { memberId: member.id, telegramId: member.telegram_id });
            } catch (notifErr) {
              logger.warn('[webhook:payment] Reactivation notification failed', {
                memberId: member.id, error: notifErr.message
              });
            }
          }
        } catch (readdErr) {
          // Re-add failing should NOT revert member activation
          logger.warn('[webhook:payment] Re-add process failed', {
            memberId: member.id, error: readdErr.message
          });
        }
      }
    }

    logger.info('[webhookProcessors] Member reactivated after removal', {
      memberId: member.id,
      paymentId,
      groupId
    });

    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'reactivation',
      memberId: member.id,
      ...notifyCtx
    });

    return { success: true, data: { memberId: member.id, action: 'reactivated' } };
  }

  logger.warn('[webhookProcessors] handlePaymentApproved: unexpected member status', {
    memberId: member.id,
    status: member.status
  });

  return { success: false, error: { code: 'UNEXPECTED_STATUS', message: `Unexpected member status: ${member.status}` } };
}

// ============================================
// HANDLER: Pagamento Rejeitado
// Story 4.3: Added groupId for multi-tenant member lookup
// ============================================
async function handlePaymentRejected(payload, eventContext = {}, paymentData = null) {
  const paymentId = payload.data?.id;
  if (!paymentId) {
    logger.warn('[webhookProcessors] handlePaymentRejected: missing payment ID');
    return { success: false, error: { code: 'MISSING_PAYMENT_ID', message: 'Missing payment ID' } };
  }

  // Usar dados já obtidos ou buscar via API
  let payment = paymentData;
  if (!payment) {
    const paymentResult = await mercadoPagoService.getPayment(paymentId);
    if (!paymentResult.success) {
      logger.error('[webhookProcessors] handlePaymentRejected: failed to fetch payment', {
        paymentId,
        error: paymentResult.error
      });
      return { success: false, error: paymentResult.error };
    }
    payment = paymentResult.data;
  }

  // Story 4.3: Resolve group from payment (AC2)
  const groupResult = await resolveGroupFromPayment(payment);
  const groupId = groupResult.data.groupId;

  // Story 4.3: Update webhook_events with resolved group_id (AC5)
  await updateWebhookEventGroupId(eventContext.eventId, groupId);

  const memberService = getMemberService();
  const { sendPaymentRejectedNotification } = require('./notificationService');

  // Buscar membro com group_id filter (AC3)
  const subscriptionId = payment.point_of_interaction?.transaction_data?.subscription_id ||
                         payment.metadata?.preapproval_id ||
                         payment.preapproval_id;
  let member = null;

  if (subscriptionId) {
    const subResult = await memberService.getMemberBySubscription(subscriptionId, groupId);
    if (subResult.success) {
      member = subResult.data;
    }
  }

  if (!member && payment.payer?.email) {
    const emailResult = await memberService.getMemberByEmail(payment.payer.email, groupId);
    if (emailResult.success) {
      member = emailResult.data;
    }
  }

  if (!member) {
    logger.info('[webhookProcessors] handlePaymentRejected: member not found, ignoring', {
      paymentId,
      subscriptionId
    });
    return { success: true, data: { skipped: true, reason: 'member_not_found' } };
  }

  const rejectionReason = payment.status_detail || payment.rejection_code || 'unknown';

  // Só marca como inadimplente se já era ativo
  if (member.status === 'ativo') {
    const defaultResult = await memberService.markMemberAsDefaulted(member.id);

    if (!defaultResult.success) {
      logger.error('[webhookProcessors] handlePaymentRejected: failed to mark as defaulted', {
        memberId: member.id,
        error: defaultResult.error
      });
      return { success: false, error: defaultResult.error };
    }

    logger.warn('[webhookProcessors] Member marked as defaulted - payment rejected', {
      memberId: member.id,
      paymentId,
      reason: rejectionReason,
      groupId
    });

    const notifyResult = await sendPaymentRejectedNotification(member, rejectionReason);
    if (!notifyResult.success && notifyResult.error?.code !== 'NO_TELEGRAM_ID') {
      logger.warn('[webhookProcessors] handlePaymentRejected: failed to send notification', {
        memberId: member.id,
        error: notifyResult.error
      });
    }

    return { success: true, data: { memberId: member.id, action: 'marked_defaulted', notified: notifyResult.success } };
  }

  logger.info('[webhookProcessors] handlePaymentRejected: member not active, ignoring', {
    memberId: member.id,
    status: member.status
  });

  return { success: true, data: { skipped: true, reason: 'member_not_active' } };
}

// ============================================
// HANDLER: Assinatura Cancelada
// Story 4.3: Multi-tenant kick/farewell (AC4)
// ============================================
async function handleSubscriptionCancelled(payload, eventContext = {}) {
  const subscriptionId = payload.data?.id;
  if (!subscriptionId) {
    logger.warn('[webhookProcessors] handleSubscriptionCancelled: missing subscription ID');
    return { success: false, error: { code: 'MISSING_SUBSCRIPTION_ID', message: 'Missing subscription ID' } };
  }

  // Story 4.3: Fetch subscription and resolve group (AC2)
  const subscriptionResult = await mercadoPagoService.getSubscription(subscriptionId);
  let groupId = null;
  let group = null;

  if (subscriptionResult.success) {
    const groupResult = await resolveGroupFromSubscription(subscriptionResult.data);
    groupId = groupResult.data.groupId;
    group = groupResult.data.group;
  }

  // Story 4.3: Update webhook_events with resolved group_id (AC5)
  await updateWebhookEventGroupId(eventContext.eventId, groupId);

  const memberService = getMemberService();

  // Story 4.3: Buscar membro pela subscription com group_id filter
  const memberResult = await memberService.getMemberBySubscription(subscriptionId, groupId);
  if (!memberResult.success) {
    logger.info('[webhookProcessors] handleSubscriptionCancelled: member not found, ignoring', {
      subscriptionId
    });
    return { success: true, data: { skipped: true, reason: 'member_not_found' } };
  }

  const member = memberResult.data;

  // Já está removido? Ignorar
  if (member.status === 'removido') {
    logger.info('[webhookProcessors] handleSubscriptionCancelled: member already removed', {
      memberId: member.id
    });
    return { success: true, data: { skipped: true, reason: 'already_removed' } };
  }

  const reason = member.status === 'trial' ? 'trial_not_converted' : 'subscription_cancelled';

  const notificationService = getNotificationService();

  // 1. Enviar mensagem de despedida com link para reativar
  // AC4: Use group.checkout_url instead of process.env.MP_CHECKOUT_URL
  if (member.telegram_id) {
    const checkoutUrl = group?.checkout_url || process.env.MP_CHECKOUT_URL || config.membership?.checkoutUrl;
    if (checkoutUrl) {
      const farewellMessage = notificationService.formatFarewellMessage(member, reason, checkoutUrl);
      await notificationService.sendPrivateMessage(member.telegram_id, farewellMessage);
    }
  }

  // 2. Kick do grupo Telegram
  // AC4: Use group.telegram_group_id instead of config.telegram.publicGroupId
  if (member.telegram_id) {
    const kickGroupId = group?.telegram_group_id || config.telegram.publicGroupId;
    if (kickGroupId) {
      const kickResult = await memberService.kickMemberFromGroup(member.telegram_id, kickGroupId);
      if (!kickResult.success) {
        logger.error('[webhookProcessors] handleSubscriptionCancelled: failed to kick member', {
          memberId: member.id,
          error: kickResult.error,
          groupId
        });
        // Continua - atualizar DB é mais importante
      }
    }
  }

  // 3. Atualizar status no banco
  const removeResult = await memberService.markMemberAsRemoved(member.id, reason);
  if (!removeResult.success) {
    logger.error('[webhookProcessors] handleSubscriptionCancelled: failed to mark as removed', {
      memberId: member.id,
      error: removeResult.error
    });
    return { success: false, error: removeResult.error };
  }

  logger.info('[webhookProcessors] Member removed due to subscription cancelled', {
    memberId: member.id,
    subscriptionId,
    previousStatus: member.status,
    reason,
    groupId
  });

  return { success: true, data: { memberId: member.id, action: 'removed' } };
}

// ============================================
// ROUTER DE EVENTOS
// Story 4.3: Pass eventContext to handlers
// ============================================
async function processWebhookEvent({ event_type, payload, eventId }) {
  const action = payload?.action;

  logger.info('[webhookProcessors] processWebhookEvent: received', { eventType: event_type, action, eventId });

  const eventContext = { eventId };

  try {
    // subscription_preapproval events
    if (event_type === 'subscription_preapproval') {
      const subscriptionId = payload?.data?.id;
      if (!subscriptionId) {
        return { success: false, error: { code: 'MISSING_SUBSCRIPTION_ID', message: 'Missing subscription ID' } };
      }

      const subscriptionResult = await mercadoPagoService.getSubscription(subscriptionId);
      const isExpiredOrCancelledAction = action === 'cancelled' || action === 'expired';

      if (action === 'created' ||
          (subscriptionResult.success && subscriptionResult.data.status === 'authorized')) {
        return await handleSubscriptionCreated(payload, eventContext);
      }

      if (isExpiredOrCancelledAction ||
          (subscriptionResult.success &&
            (subscriptionResult.data.status === 'cancelled' || subscriptionResult.data.status === 'expired'))) {
        return await handleSubscriptionCancelled(payload, eventContext);
      }

      logger.info('[webhookProcessors] Ignoring subscription_preapproval event', {
        action,
        status: subscriptionResult.data?.status
      });
      return { success: true, data: { skipped: true, reason: 'unhandled_action' } };
    }

    // Payment events
    if (event_type === 'subscription_authorized_payment' || event_type === 'payment') {
      const paymentId = payload?.data?.id;
      if (!paymentId) {
        return { success: false, error: { code: 'MISSING_PAYMENT_ID', message: 'Missing payment ID' } };
      }

      let paymentResult;
      let payment;

      if (event_type === 'subscription_authorized_payment') {
        paymentResult = await mercadoPagoService.getAuthorizedPayment(paymentId);

        if (paymentResult.success) {
          const authorizedPayment = paymentResult.data;
          payment = {
            ...authorizedPayment,
            status: authorizedPayment.payment?.status || (authorizedPayment.status === 'processed' ? 'approved' : authorizedPayment.status),
            preapproval_id: authorizedPayment.preapproval_id
          };
        } else if (paymentResult.error?.code === 'AUTHORIZED_PAYMENT_NOT_FOUND') {
          logger.debug('[webhookProcessors] authorized_payment not found, trying as regular payment', { paymentId });
          paymentResult = await mercadoPagoService.getPayment(paymentId);
          if (paymentResult.success) {
            payment = paymentResult.data;
          }
        }
      } else {
        paymentResult = await mercadoPagoService.getPayment(paymentId);
        if (paymentResult.success) {
          payment = paymentResult.data;
        }
      }

      if (!paymentResult.success) {
        return { success: false, error: paymentResult.error };
      }

      if (payment.status === 'approved') {
        return await handlePaymentApproved(payload, eventContext, payment);
      }

      if (payment.status === 'rejected') {
        return await handlePaymentRejected(payload, eventContext, payment);
      }

      logger.info('[webhookProcessors] Ignoring payment event', {
        paymentId,
        status: payment.status
      });
      return { success: true, data: { skipped: true, reason: 'unhandled_status' } };
    }

    // Evento não tratado
    logger.info('[webhookProcessors] Unhandled event type', { event_type, action });
    return { success: true, data: { skipped: true, reason: 'unhandled_event_type' } };

  } catch (err) {
    logger.error('[webhookProcessors] Error processing event', {
      event_type,
      action,
      error: err.message
    });
    return { success: false, error: { code: 'HANDLER_ERROR', message: err.message } };
  }
}

module.exports = {
  processWebhookEvent,
  // Export handlers for testing
  handleSubscriptionCreated,
  handlePaymentApproved,
  handlePaymentRejected,
  handleSubscriptionCancelled,
  // Story 4.3: Export group resolution for testing
  resolveGroupFromSubscription,
  resolveGroupFromPayment,
  notifyAdminPayment,
};

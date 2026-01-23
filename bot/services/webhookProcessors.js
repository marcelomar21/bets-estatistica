/**
 * Webhook Processors - Mercado Pago
 * Tech-Spec: Migração Cakto → Mercado Pago
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

// Lazy load telegram bot to send admin notifications
let _bot = null;
function getBot() {
  if (!_bot) {
    const { getBot: getTelegramBot } = require('../telegram');
    _bot = getTelegramBot();
  }
  return _bot;
}

/**
 * Send payment notification to admin group
 * @param {object} params - Notification params
 * @param {string} params.email - Payer email
 * @param {number} params.amount - Payment amount
 * @param {string} params.action - Action type (new_member, conversion, renewal, recovery, reactivation)
 * @param {number} [params.memberId] - Member ID if available
 */
async function notifyAdminPayment({ email, amount, action, memberId }) {
  try {
    const bot = getBot();
    const adminGroupId = config.telegram.adminGroupId;

    if (!bot || !adminGroupId) {
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

    const message = `
${emoji} *${actionText}!*

📧 ${email}
💰 ${amountFormatted}
${memberId ? `🆔 ID: ${memberId}` : ''}
    `.trim();

    await bot.sendMessage(adminGroupId, message, { parse_mode: 'Markdown' });

    logger.info('[webhookProcessors] notifyAdminPayment: sent', { email, action, amount });
  } catch (err) {
    // Don't fail the webhook processing if notification fails
    logger.warn('[webhookProcessors] notifyAdminPayment: failed', { error: err.message });
  }
}

// ============================================
// HANDLER: Assinatura Criada (trial inicia)
// ============================================
async function handleSubscriptionCreated(payload) {
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
      const payerResult = await memberService.getMemberByPayerId(payerId);
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
            payerId
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

  // Verificar se já existe membro com esse email
  const existingResult = await memberService.getMemberByEmail(email);

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
      subscriptionId
    });

    return { success: true, data: { memberId: member.id, action: 'updated' } };
  }

  // Novo membro - criar como TRIAL
  const createResult = await memberService.createTrialMemberMP({
    email,
    subscriptionId,
    payerId: subscription.payer_id?.toString(),
    couponCode
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
    couponCode
  });

  // Nota: Para enviar convite do grupo, precisamos do telegram_id
  // O membro receberá o convite quando fizer /start no bot e vincular o email

  return { success: true, data: { memberId: newMember.id, action: 'created' } };
}

// ============================================
// HANDLER: Pagamento Aprovado (trial → ativo, ou renovação)
// ============================================
async function handlePaymentApproved(payload, paymentData = null) {
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

  const memberService = getMemberService();

  // Buscar membro pela subscription ou email
  // subscription_id está em point_of_interaction para pagamentos de assinatura MP
  const subscriptionId = payment.point_of_interaction?.transaction_data?.subscription_id ||
                         payment.metadata?.preapproval_id;
  let member = null;

  if (subscriptionId) {
    const subResult = await memberService.getMemberBySubscription(subscriptionId);
    if (subResult.success) {
      member = subResult.data;
    }
  }

  if (!member && payment.payer?.email) {
    const emailResult = await memberService.getMemberByEmail(payment.payer.email);
    if (emailResult.success) {
      member = emailResult.data;
    }
  }

  if (!member) {
    // Membro não existe - criar como ativo diretamente (fluxo MP sem trial ou email ausente em test)
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
      subscriptionId
    });

    // Criar membro como trial primeiro (telegram_id pode ser null)
    // Será ativado quando fizer /start no bot ou já fica ativo se pagamento confirmado
    const createResult = await memberService.createTrialMemberMP({
      email,
      subscriptionId: subscriptionId,
      payerId: payment.payer?.id?.toString(),
      couponCode: null
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
      paymentId
    });

    // Notify admin group
    await notifyAdminPayment({
      email,
      amount: payment.transaction_amount,
      action: 'new_member',
      memberId: createResult.data.id
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
      paymentId
    });

    // Notify admin group
    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'conversion',
      memberId: member.id
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
      paymentId
    });

    // Notify admin group
    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'renewal',
      memberId: member.id
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
      paymentId
    });

    // Notify admin group
    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'recovery',
      memberId: member.id
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

    // Enviar convite do grupo se tiver telegram_id
    if (member.telegram_id) {
      const notificationService = getNotificationService();
      try {
        await notificationService.sendReactivationNotification(member.telegram_id, member.id);
      } catch (err) {
        logger.warn('[webhookProcessors] handlePaymentApproved: reactivation notification failed', {
          memberId: member.id,
          error: err.message
        });
      }
    }

    logger.info('[webhookProcessors] Member reactivated after removal', {
      memberId: member.id,
      paymentId
    });

    // Notify admin group
    await notifyAdminPayment({
      email: member.email,
      amount: payment.transaction_amount,
      action: 'reactivation',
      memberId: member.id
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
// ============================================
async function handlePaymentRejected(payload, paymentData = null) {
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
  const memberService = getMemberService();
  const { sendPaymentRejectedNotification } = require('./notificationService');

  // Buscar membro
  // subscription_id pode estar em diferentes lugares dependendo do tipo de payment
  const subscriptionId = payment.point_of_interaction?.transaction_data?.subscription_id ||
                         payment.metadata?.preapproval_id ||
                         payment.preapproval_id; // authorized_payment tem preapproval_id direto
  let member = null;

  if (subscriptionId) {
    const subResult = await memberService.getMemberBySubscription(subscriptionId);
    if (subResult.success) {
      member = subResult.data;
    }
  }

  if (!member && payment.payer?.email) {
    const emailResult = await memberService.getMemberByEmail(payment.payer.email);
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
  // (trial com falha será cancelado pelo MP automaticamente)
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
      reason: rejectionReason
    });

    // Enviar notificação ao membro
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
// ============================================
async function handleSubscriptionCancelled(payload) {
  const subscriptionId = payload.data?.id;
  if (!subscriptionId) {
    logger.warn('[webhookProcessors] handleSubscriptionCancelled: missing subscription ID');
    return { success: false, error: { code: 'MISSING_SUBSCRIPTION_ID', message: 'Missing subscription ID' } };
  }

  const memberService = getMemberService();

  // Buscar membro pela subscription
  const memberResult = await memberService.getMemberBySubscription(subscriptionId);
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
  if (member.telegram_id) {
    const checkoutUrl = process.env.MP_CHECKOUT_URL || config.membership?.checkoutUrl;
    if (checkoutUrl) {
      const farewellMessage = notificationService.formatFarewellMessage(member, reason, checkoutUrl);
      await notificationService.sendPrivateMessage(member.telegram_id, farewellMessage);
    }
  }

  // 2. Kick do grupo Telegram
  if (member.telegram_id) {
    const groupId = config.telegram.publicGroupId;
    if (groupId) {
      const kickResult = await memberService.kickMemberFromGroup(member.telegram_id, groupId);
      if (!kickResult.success) {
        logger.error('[webhookProcessors] handleSubscriptionCancelled: failed to kick member', {
          memberId: member.id,
          error: kickResult.error
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
    reason
  });

  return { success: true, data: { memberId: member.id, action: 'removed' } };
}

// ============================================
// ROUTER DE EVENTOS
// ============================================
async function processWebhookEvent({ event_type, payload }) {
  const action = payload?.action;

  logger.info('[webhookProcessors] processWebhookEvent: received', { eventType: event_type, action });

  try {
    // subscription_preapproval events
    if (event_type === 'subscription_preapproval') {
      // Buscar status atual da assinatura para determinar ação
      const subscriptionId = payload?.data?.id;
      if (!subscriptionId) {
        return { success: false, error: { code: 'MISSING_SUBSCRIPTION_ID', message: 'Missing subscription ID' } };
      }

      const subscriptionResult = await mercadoPagoService.getSubscription(subscriptionId);

      if (action === 'created' ||
          (subscriptionResult.success && subscriptionResult.data.status === 'authorized')) {
        return await handleSubscriptionCreated(payload);
      }

      if (subscriptionResult.success && subscriptionResult.data.status === 'cancelled') {
        return await handleSubscriptionCancelled(payload);
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

      // Para subscription_authorized_payment, tentar authorized_payments primeiro, fallback para payments
      // Para payment, usar payments diretamente
      let paymentResult;
      let payment;

      if (event_type === 'subscription_authorized_payment') {
        // Tentar endpoint de authorized_payments primeiro
        paymentResult = await mercadoPagoService.getAuthorizedPayment(paymentId);

        if (paymentResult.success) {
          // authorized_payment tem estrutura diferente - o status real está em payment.status
          const authorizedPayment = paymentResult.data;
          payment = {
            ...authorizedPayment,
            // Usar o status do payment interno se disponível, senão mapear status do authorized_payment
            status: authorizedPayment.payment?.status || (authorizedPayment.status === 'processed' ? 'approved' : authorizedPayment.status),
            preapproval_id: authorizedPayment.preapproval_id
          };
        } else if (paymentResult.error?.code === 'AUTHORIZED_PAYMENT_NOT_FOUND') {
          // Fallback: tentar como payment normal
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
        return await handlePaymentApproved(payload, payment);
      }

      if (payment.status === 'rejected') {
        return await handlePaymentRejected(payload, payment);
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
  handleSubscriptionCancelled
};

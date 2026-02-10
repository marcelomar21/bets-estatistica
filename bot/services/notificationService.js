/**
 * Notification Service - Shared notification functions for membership
 * Story 16.5: Implementar Notificacoes de Cobranca
 *
 * Handles:
 * - Checking if notification was already sent today
 * - Registering notifications in member_notifications table
 * - Sending private messages via Telegram
 * - Formatting reminder messages
 *
 * Design Decisions:
 * -----------------
 * 1. NO RETRY LOGIC (M4): This service does not implement retry logic because:
 *    - Jobs are daily and idempotent (hasNotificationToday prevents duplicates)
 *    - Failed sends will naturally retry on next daily run
 *    - Simple sequential processing is sufficient for low-volume (<100/day)
 *    - If higher volume needed, implement exponential backoff with max 3 retries
 *
 * 2. ASYMMETRIC ERROR HANDLING (L3):
 *    - getSuccessRate failure: Silent (optional enhancement, message still valuable without it)
 *    - getCheckoutLink failure: Blocking (checkout URL is essential for CTA)
 *    This asymmetry is intentional - we want members to receive reminders even if
 *    metrics are unavailable, but not without a way to subscribe.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { getBot } = require('../telegram');
const { config } = require('../../lib/config');

/**
 * Check if a notification of a given type was already sent to a member today
 * @param {string} memberId - Internal member ID (UUID)
 * @param {string} type - Notification type (trial_reminder, renewal_reminder)
 * @returns {Promise<{success: boolean, data?: {hasNotification: boolean}, error?: object}>}
 */
async function hasNotificationToday(memberId, type) {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    const { data, error } = await supabase
      .from('member_notifications')
      .select('id')
      .eq('member_id', memberId)
      .eq('type', type)
      .gte('sent_at', startOfDay.toISOString())
      .lte('sent_at', endOfDay.toISOString())
      .limit(1);

    if (error) {
      logger.error('[notificationService] hasNotificationToday: database error', {
        memberId,
        type,
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data: { hasNotification: data && data.length > 0 } };
  } catch (err) {
    logger.error('[notificationService] hasNotificationToday: unexpected error', {
      memberId,
      type,
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Register a notification in the member_notifications table
 * @param {string} memberId - Internal member ID (UUID)
 * @param {string} type - Notification type (trial_reminder, renewal_reminder)
 * @param {string} channel - Notification channel (telegram, email)
 * @param {string} messageId - Telegram message ID (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function registerNotification(memberId, type, channel, messageId = null) {
  try {
    const { data, error } = await supabase
      .from('member_notifications')
      .insert({
        member_id: memberId,
        type: type,
        channel: channel,
        message_id: messageId?.toString() || null,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('[notificationService] registerNotification: database error', {
        memberId,
        type,
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[notificationService] registerNotification: success', {
      notificationId: data.id,
      memberId,
      type,
      channel,
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[notificationService] registerNotification: unexpected error', {
      memberId,
      type,
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Send a private message to a Telegram user
 * Handles 403 errors (user blocked bot) gracefully
 * @param {number|string} telegramId - Telegram user ID
 * @param {string} message - Message text (supports Markdown)
 * @param {string} parseMode - Parse mode (default: 'Markdown')
 * @returns {Promise<{success: boolean, data?: {messageId: number}, error?: object}>}
 */
async function sendPrivateMessage(telegramId, message, parseMode = 'Markdown') {
  const bot = getBot();

  try {
    const sentMessage = await bot.sendMessage(telegramId, message, {
      parse_mode: parseMode,
    });

    logger.debug('[notificationService] sendPrivateMessage: success', {
      telegramId,
      messageId: sentMessage.message_id,
    });

    return { success: true, data: { messageId: sentMessage.message_id } };
  } catch (err) {
    // Erro 403: usuario bloqueou o bot ou nunca iniciou conversa
    if (err.response?.statusCode === 403) {
      logger.warn('[notificationService] User blocked bot or never started chat', {
        telegramId,
        error: err.response?.body?.description || err.message,
      });
      return {
        success: false,
        error: { code: 'USER_BLOCKED_BOT', message: 'User has not started chat with bot or blocked it' },
      };
    }

    // Outros erros
    logger.error('[notificationService] Failed to send message', {
      telegramId,
      error: err.message,
    });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Get the checkout link for Cakto
 * @returns {{success: boolean, data?: {checkoutUrl: string}, error?: object}}
 */
function getCheckoutLink() {
  const checkoutUrl = config.membership?.checkoutUrl;

  if (!checkoutUrl) {
    logger.warn('[notificationService] getCheckoutLink: CAKTO_CHECKOUT_URL not configured');
    return {
      success: false,
      error: { code: 'CONFIG_MISSING', message: 'CAKTO_CHECKOUT_URL not configured' },
    };
  }

  return { success: true, data: { checkoutUrl } };
}

/**
 * Get payment link for a member with affiliate tracking when applicable
 * Story 18.3: Link de Pagamento Dinamico com Tracking
 *
 * Uses generatePaymentLink from memberService to generate URLs with affiliate tracking.
 * Falls back to generic checkout URL if member is null/undefined.
 *
 * @param {object|null} member - Member object with affiliate_code and affiliate_clicked_at
 * @returns {{success: boolean, data?: {url: string, hasAffiliate: boolean, affiliateCode: string|null}, error?: object}}
 */
function getPaymentLinkForMember(member) {
  // If no member provided, fall back to generic checkout link
  if (!member) {
    const checkoutResult = getCheckoutLink();
    if (!checkoutResult.success) {
      return checkoutResult;
    }
    logger.debug('[membership:payment-link] getPaymentLinkForMember: no member, using generic link');
    return {
      success: true,
      data: { url: checkoutResult.data.checkoutUrl, hasAffiliate: false, affiliateCode: null }
    };
  }

  // Use generatePaymentLink from memberService for affiliate tracking
  const { generatePaymentLink } = require('./memberService');
  const result = generatePaymentLink(member);

  if (result.success) {
    logger.debug('[membership:payment-link] getPaymentLinkForMember: link generated', {
      memberId: member.id,
      hasAffiliate: result.data.hasAffiliate,
      affiliateCode: result.data.affiliateCode
    });
  }

  return result;
}

/**
 * Get operator username from config
 * @returns {string} - Operator username without @
 */
function getOperatorUsername() {
  return config.membership?.operatorUsername || 'operador';
}

/**
 * Get subscription price text from config
 * @returns {string} - Price text (e.g., "R$50/mes")
 */
function getSubscriptionPrice() {
  return config.membership?.subscriptionPrice || 'R$50/mes';
}

/**
 * Format trial reminder message based on days remaining
 * @param {object} member - Member object
 * @param {number} daysRemaining - Days until trial ends (1, 2, or 3)
 * @param {string} checkoutUrl - Cakto checkout URL
 * @param {number|null} successRate - Historical success rate percentage
 * @returns {string} - Formatted message for Telegram (Markdown)
 */
function formatTrialReminder(member, daysRemaining, checkoutUrl, successRate = null) {
  const operatorUsername = getOperatorUsername();
  const price = getSubscriptionPrice();
  const rateText = successRate ? `*${successRate.toFixed(1)}%*` : '_calculando_';

  if (daysRemaining === 1) {
    // Ultimo dia
    return `*Ultimo dia* do seu trial!

Amanha voce perdera acesso ao grupo.

Para continuar recebendo nossas apostas:
[ASSINAR POR ${price.toUpperCase()}](${checkoutUrl})

Duvidas? @${operatorUsername}`;
  }

  if (daysRemaining === 2) {
    // 2 dias restantes
    return `Faltam apenas *2 dias* do seu trial!

Nao perca o acesso as nossas apostas.

Continue recebendo analises diarias por ${price}:
[ASSINAR AGORA](${checkoutUrl})

Duvidas? @${operatorUsername}`;
  }

  // 3 dias restantes (default)
  return `Seu trial termina em *${daysRemaining} dias*!

Voce esta aproveitando as apostas?

Receba 3 apostas diarias com analise estatistica
Taxa de acerto historica: ${rateText}

Continue por ${price}:
[ASSINAR AGORA](${checkoutUrl})

Duvidas? Fale com @${operatorUsername}`;
}

/**
 * Format farewell message for removed members
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * @param {object} member - Member object
 * @param {string} reason - Removal reason: 'trial_expired' or 'payment_failed'
 * @param {string} checkoutUrl - Cakto checkout URL for reactivation
 * @returns {string} - Formatted message for Telegram (Markdown)
 */
function formatFarewellMessage(member, reason, checkoutUrl) {
  const price = getSubscriptionPrice();

  if (reason === 'trial_expired') {
    return `Seu trial terminou

Sentiremos sua falta!

Para voltar a receber nossas apostas:
[ASSINAR POR ${price.toUpperCase()}](${checkoutUrl})

Voce tem 24h para reativar e voltar ao grupo.`;
  }

  // payment_failed (default for subscription_canceled, subscription_renewal_refused)
  return `Sua assinatura nao foi renovada

Voce foi removido do grupo por falta de pagamento.

Para reativar seu acesso:
[PAGAR AGORA](${checkoutUrl})

Regularize em 24h para voltar automaticamente.`;
}

/**
 * Format renewal reminder message based on days until renewal
 * @param {object} member - Member object
 * @param {number} daysUntilRenewal - Days until subscription ends (1, 3, or 5)
 * @param {string} checkoutUrl - Cakto checkout URL
 * @returns {string} - Formatted message for Telegram (Markdown)
 */
function formatRenewalReminder(member, daysUntilRenewal, checkoutUrl) {
  const operatorUsername = getOperatorUsername();

  if (daysUntilRenewal === 1) {
    // Ultimo dia
    return `*Amanha* sua assinatura expira!

Pague agora para nao perder acesso ao grupo:
[PAGAR AGORA](${checkoutUrl})

Duvidas? @${operatorUsername}`;
  }

  if (daysUntilRenewal === 3) {
    // 3 dias antes
    return `Sua assinatura renova em *3 dias*

Efetue o pagamento para nao perder acesso:
[PAGAR AGORA](${checkoutUrl})

Duvidas? @${operatorUsername}`;
  }

  // 5 dias antes (default)
  return `Sua assinatura renova em *${daysUntilRenewal} dias*

Para nao perder acesso, efetue o pagamento:
[PAGAR AGORA](${checkoutUrl})

Pagamentos via PIX/Boleto precisam ser feitos manualmente.

Duvidas? @${operatorUsername}`;
}

/**
 * Send reactivation notification to a previously removed member
 * Story 16.10: Reativar Membro Removido Após Pagamento
 *
 * Generates a unique invite link and sends a welcome-back message.
 *
 * @param {number|string} telegramId - Telegram user ID
 * @param {number} memberId - Internal member ID (for updating invite data)
 * @param {number|string|null} groupTelegramId - Target Telegram group ID for invite generation
 * @returns {Promise<{success: boolean, data?: {messageId: number, inviteLink: string}, error?: object}>}
 */
async function sendReactivationNotification(telegramId, memberId, groupTelegramId = null) {
  // Issue #6 Fix: Input validation
  if (!telegramId) {
    logger.warn('[notificationService] sendReactivationNotification: invalid telegramId', { telegramId });
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'telegramId is required' }
    };
  }

  if (!memberId) {
    logger.warn('[notificationService] sendReactivationNotification: invalid memberId', { memberId });
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'memberId is required' }
    };
  }

  const bot = getBot();
  const resolvedGroupId = groupTelegramId || config.telegram.publicGroupId;

  if (!resolvedGroupId) {
    logger.error('[notificationService] sendReactivationNotification: TELEGRAM_PUBLIC_GROUP_ID not configured');
    return {
      success: false,
      error: { code: 'CONFIG_MISSING', message: 'TELEGRAM_PUBLIC_GROUP_ID not configured' }
    };
  }

  // Generate unique invite link
  let inviteLink;
  try {
    const invite = await bot.createChatInviteLink(resolvedGroupId, {
      member_limit: 1, // Only 1 use
      expire_date: Math.floor(Date.now() / 1000) + 86400 // Expires in 24h
    });
    inviteLink = invite.invite_link;

    logger.info('[notificationService] sendReactivationNotification: invite link generated', {
      memberId,
      telegramId,
      inviteLink: inviteLink.substring(0, 30) + '...'
    });
  } catch (err) {
    logger.error('[notificationService] sendReactivationNotification: failed to generate invite link', {
      memberId,
      telegramId,
      error: err.message
    });
    return {
      success: false,
      error: { code: 'INVITE_GENERATION_FAILED', message: err.message }
    };
  }

  // Update member's invite data
  // Issue #5 Fix: Fail if DB update fails to maintain consistency
  try {
    const { error } = await supabase
      .from('members')
      .update({
        invite_link: inviteLink,
        invite_generated_at: new Date().toISOString()
      })
      .eq('id', memberId);

    if (error) {
      logger.error('[notificationService] sendReactivationNotification: failed to update invite data', {
        memberId,
        error: error.message
      });
      return {
        success: false,
        error: { code: 'DB_UPDATE_FAILED', message: error.message }
      };
    }
  } catch (err) {
    logger.error('[notificationService] sendReactivationNotification: error updating invite data', {
      memberId,
      error: err.message
    });
    return {
      success: false,
      error: { code: 'DB_UPDATE_FAILED', message: err.message }
    };
  }

  // Format reactivation message (AC3)
  const message = `🎉 *Bem-vindo de volta!*

Seu pagamento foi confirmado e seu acesso foi restaurado.

👉 [Entrar no Grupo](${inviteLink})

_Link válido por 24h (uso único)_`;

  // Send message
  const sendResult = await sendPrivateMessage(telegramId, message);

  if (!sendResult.success) {
    logger.warn('[notificationService] sendReactivationNotification: failed to send message', {
      memberId,
      telegramId,
      error: sendResult.error
    });
    return {
      success: false,
      error: sendResult.error,
      data: { inviteLink } // Return invite link even if message failed
    };
  }

  // Register notification
  await registerNotification(memberId, 'reactivation', 'telegram', sendResult.data.messageId);

  logger.info('[notificationService] sendReactivationNotification: success', {
    memberId,
    telegramId,
    messageId: sendResult.data.messageId
  });

  return {
    success: true,
    data: {
      messageId: sendResult.data.messageId,
      inviteLink
    }
  };
}

/**
 * Format payment rejected notification message
 * @param {object} member - Member object
 * @param {string} rejectionReason - Reason code from MP (e.g., 'cc_rejected_high_risk')
 * @returns {string} Formatted message
 */
function formatPaymentRejectedNotification(member, rejectionReason) {
  const operatorUsername = getOperatorUsername();

  // Map rejection reasons to user-friendly messages
  const rejectionMessages = {
    'cc_rejected_high_risk': 'alto risco detectado pelo banco',
    'cc_rejected_insufficient_amount': 'saldo insuficiente',
    'cc_rejected_bad_filled_card_number': 'número do cartão incorreto',
    'cc_rejected_bad_filled_date': 'data de validade incorreta',
    'cc_rejected_bad_filled_security_code': 'código de segurança incorreto',
    'cc_rejected_blacklist': 'cartão não autorizado',
    'cc_rejected_call_for_authorize': 'necessário autorizar com o banco',
    'cc_rejected_card_disabled': 'cartão desativado',
    'cc_rejected_duplicated_payment': 'pagamento duplicado',
    'cc_rejected_max_attempts': 'limite de tentativas excedido',
    'cc_rejected_other_reason': 'recusado pelo banco'
  };

  const reasonText = rejectionMessages[rejectionReason] || 'recusado pelo banco';

  return `⚠️ *Pagamento Recusado*

Seu pagamento da assinatura foi recusado: _${reasonText}_

*Como resolver:*
1. Acesse sua conta do Mercado Pago
2. Vá em [Assinaturas](https://www.mercadopago.com.br/subscriptions)
3. Atualize o meio de pagamento

Se você não tem conta no Mercado Pago, entre em contato para cancelarmos a assinatura atual e você assinar novamente.

Dúvidas? @${operatorUsername}`;
}

/**
 * Send payment rejected notification to member
 * @param {object} member - Member object with telegram_id
 * @param {string} rejectionReason - Reason code from MP
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendPaymentRejectedNotification(member, rejectionReason) {
  const { id: memberId, telegram_id: telegramId, email } = member;

  if (!telegramId) {
    logger.warn('[notificationService] sendPaymentRejectedNotification: no telegram_id', { memberId, email });
    return {
      success: false,
      error: { code: 'NO_TELEGRAM_ID', message: 'Member does not have telegram_id' }
    };
  }

  // Check if already notified today
  const hasResult = await hasNotificationToday(memberId, 'payment_rejected');
  if (hasResult.success && hasResult.data.hasNotification) {
    logger.debug('[notificationService] sendPaymentRejectedNotification: already notified today', { memberId });
    return {
      success: true,
      data: { skipped: true, reason: 'already_notified_today' }
    };
  }

  const message = formatPaymentRejectedNotification(member, rejectionReason);
  const sendResult = await sendPrivateMessage(telegramId, message);

  if (!sendResult.success) {
    logger.warn('[notificationService] sendPaymentRejectedNotification: failed', {
      memberId,
      telegramId,
      error: sendResult.error
    });
    return sendResult;
  }

  // Register notification
  await registerNotification(memberId, 'payment_rejected', 'telegram', sendResult.data.messageId);

  logger.info('[notificationService] sendPaymentRejectedNotification: success', {
    memberId,
    telegramId,
    rejectionReason,
    messageId: sendResult.data.messageId
  });

  return {
    success: true,
    data: { messageId: sendResult.data.messageId }
  };
}

/**
 * Format kick warning message for inadimplente members
 * Shows days remaining before being kicked from group
 * @param {object} member - Member object
 * @param {number} daysRemaining - Days remaining before kick (1 or 2)
 * @param {string} checkoutUrl - Checkout URL for payment
 * @returns {string} Formatted message
 */
function formatKickWarning(member, daysRemaining, checkoutUrl) {
  const operatorUsername = getOperatorUsername();

  if (daysRemaining <= 1) {
    return `🚨 *ÚLTIMO AVISO*

Seu pagamento está pendente e você será *removido amanhã*.

Regularize agora para manter seu acesso:
[PAGAR AGORA](${checkoutUrl})

Ou atualize o meio de pagamento em:
[Minhas Assinaturas](https://www.mercadopago.com.br/subscriptions)

Dúvidas? @${operatorUsername}`;
  }

  return `⚠️ *Pagamento Pendente*

Seu pagamento não foi processado.

Você será removido do grupo em *${daysRemaining} dias* se não regularizar.

[PAGAR AGORA](${checkoutUrl})

Ou atualize o meio de pagamento em:
[Minhas Assinaturas](https://www.mercadopago.com.br/subscriptions)

Dúvidas? @${operatorUsername}`;
}

/**
 * Send kick warning notification to inadimplente member
 * Sends daily reminder during grace period
 * @param {object} member - Member object with telegram_id
 * @param {number} daysRemaining - Days remaining before kick
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendKickWarningNotification(member, daysRemaining) {
  const { id: memberId, telegram_id: telegramId, email } = member;

  if (!telegramId) {
    logger.warn('[notificationService] sendKickWarningNotification: no telegram_id', { memberId, email });
    return {
      success: false,
      error: { code: 'NO_TELEGRAM_ID', message: 'Member does not have telegram_id' }
    };
  }

  // Check if already notified today
  const hasResult = await hasNotificationToday(memberId, 'kick_warning');
  if (hasResult.success && hasResult.data.hasNotification) {
    logger.debug('[notificationService] sendKickWarningNotification: already notified today', { memberId });
    return {
      success: true,
      data: { skipped: true, reason: 'already_notified_today' }
    };
  }

  // Get checkout URL
  const checkoutResult = getCheckoutLink();
  if (!checkoutResult.success) {
    logger.warn('[notificationService] sendKickWarningNotification: no checkout URL', { memberId });
    return checkoutResult;
  }

  const message = formatKickWarning(member, daysRemaining, checkoutResult.data.checkoutUrl);
  const sendResult = await sendPrivateMessage(telegramId, message);

  if (!sendResult.success) {
    logger.warn('[notificationService] sendKickWarningNotification: failed', {
      memberId,
      telegramId,
      error: sendResult.error
    });
    return sendResult;
  }

  // Register notification
  await registerNotification(memberId, 'kick_warning', 'telegram', sendResult.data.messageId);

  logger.info('[notificationService] sendKickWarningNotification: success', {
    memberId,
    telegramId,
    daysRemaining,
    messageId: sendResult.data.messageId
  });

  return {
    success: true,
    data: { messageId: sendResult.data.messageId, daysRemaining }
  };
}

module.exports = {
  hasNotificationToday,
  registerNotification,
  sendPrivateMessage,
  getCheckoutLink,
  // Story 18.3: Payment link with affiliate tracking
  getPaymentLinkForMember,
  getOperatorUsername,
  getSubscriptionPrice,
  formatTrialReminder,
  formatRenewalReminder,
  formatFarewellMessage,
  // Story 16.10: Reactivation notification
  sendReactivationNotification,
  // Payment rejected notification
  formatPaymentRejectedNotification,
  sendPaymentRejectedNotification,
  // Kick warning notification
  formatKickWarning,
  sendKickWarningNotification,
};

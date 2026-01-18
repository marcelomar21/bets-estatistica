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
    return `Seu trial de 7 dias terminou

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

module.exports = {
  hasNotificationToday,
  registerNotification,
  sendPrivateMessage,
  getCheckoutLink,
  getOperatorUsername,
  getSubscriptionPrice,
  formatTrialReminder,
  formatRenewalReminder,
  formatFarewellMessage,
};

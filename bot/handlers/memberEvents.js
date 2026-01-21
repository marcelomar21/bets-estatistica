/**
 * Member Events Handler - Detect and process new members joining the group
 * Story 16.4: Implementar Detecção de Entrada e Sistema de Trial
 */
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { getBot } = require('../telegram');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByTelegramId,
  createTrialMember,
  canRejoinGroup,
  reactivateMember,
  getTrialDays
} = require('../services/memberService');
const { getSuccessRate } = require('../services/metricsService');
const { registerNotification } = require('../services/notificationService');

/**
 * Handle new_chat_members event from Telegram
 * AC1: Detecção de Novo Membro no Grupo Público
 * @param {object} msg - Telegram message with new_chat_members array
 * @returns {Promise<{processed: number, skipped: number}>}
 */
async function handleNewChatMembers(msg) {
  const newMembers = msg.new_chat_members || [];
  let processed = 0;
  let skipped = 0;

  for (const user of newMembers) {
    // Filter out bots (1.2)
    if (user.is_bot) {
      logger.debug('[membership:member-events] Ignoring bot', { botId: user.id, username: user.username });
      skipped++;
      continue;
    }

    // Process each new member (1.3)
    const result = await processNewMember(user);
    if (result.processed) {
      processed++;
    } else {
      skipped++;
    }
  }

  logger.info('[membership:member-events] Batch processing complete', { processed, skipped, total: newMembers.length });
  return { processed, skipped };
}

/**
 * Process a new member with duplicate detection logic
 * AC2: Prevenção de Duplicatas
 * Story 16.9: Updated to support Gate Entry system
 * @param {object} user - Telegram user object
 * @returns {Promise<{processed: boolean, action?: string}>}
 */
async function processNewMember(user) {
  const { id: telegramId, username, first_name: firstName } = user;

  logger.info('[membership:member-events] Processing new member', { telegramId, username, firstName });

  // Check if member already exists (1.4)
  const existingResult = await getMemberByTelegramId(telegramId);

  if (existingResult.success) {
    const member = existingResult.data;

    // Handle based on current status
    if (member.status === 'trial' || member.status === 'ativo') {
      // Story 16.10: Check if this is a reactivated member entering for the first time
      // Reactivated members have: status='ativo', joined_group_at=null, notes contain 'Reativado após pagamento'
      // Using specific pattern to avoid false positives from manual notes
      const isReactivatedEntry = member.status === 'ativo'
        && !member.joined_group_at
        && member.notes?.includes('Reativado após pagamento');

      // Story 16.9: Update joined_group_at
      await confirmMemberJoinedGroup(member.id, telegramId, username);

      if (isReactivatedEntry) {
        // AC5 (Story 16.10): Register reactivation_join event and notification
        await registerMemberEvent(member.id, 'join', {
          telegram_id: telegramId,
          telegram_username: username,
          source: 'telegram_webhook',
          action: 'reactivation_join'
        });

        // Register notification for tracking
        await registerReactivationJoinNotification(member.id);

        logger.info('[membership:member-events] Reactivated member joined group', {
          memberId: member.id,
          telegramId,
          username
        });
        return { processed: true, action: 'reactivation_join' };
      }

      logger.debug('[membership:member-events] Member already exists, skipping', {
        memberId: member.id,
        status: member.status,
        telegramId
      });
      return { processed: false, action: 'already_exists' };
    }

    if (member.status === 'removido') {
      // Check if can rejoin (< 24h since kick)
      const rejoinResult = await canRejoinGroup(member.id);

      if (rejoinResult.success && rejoinResult.data.canRejoin) {
        // Reactivate as trial (1.6)
        const reactivateResult = await reactivateMember(member.id);
        if (reactivateResult.success) {
          // Confirm group entry
          await confirmMemberJoinedGroup(member.id, telegramId, username);

          // AC3: Register rejoin event in member_events table
          await registerMemberEvent(member.id, 'join', {
            telegram_id: telegramId,
            telegram_username: username,
            source: 'telegram_webhook',
            action: 'reactivated',
            hours_since_kick: rejoinResult.data.hoursSinceKick
          });

          // Note: Welcome message already sent via /start command in Gate Entry flow
          logger.info('[membership:member-events] Member reactivated', {
            memberId: member.id,
            telegramId,
            hoursSinceKick: rejoinResult.data.hoursSinceKick?.toFixed(2)
          });
          return { processed: true, action: 'reactivated' };
        }
        logger.error('[membership:member-events] Failed to reactivate member', {
          memberId: member.id,
          error: reactivateResult.error
        });
        return { processed: false, action: 'reactivation_failed' };
      } else {
        // Kicked > 24h ago, require payment (1.7)
        logger.warn('[membership:member-events] Removed member entered without payment', {
          memberId: member.id,
          hoursSinceKick: rejoinResult.data?.hoursSinceKick?.toFixed(2)
        });
        // Send payment required message
        await sendPaymentRequiredMessage(telegramId, member.id);
        return { processed: true, action: 'payment_required' };
      }
    } else if (member.status === 'inadimplente') {
      // Inadimplente shouldn't have invite link, log warning
      logger.warn('[membership:member-events] Inadimplente member entered group', {
        memberId: member.id,
        telegramId
      });
      return { processed: false, action: 'inadimplente_entry' };
    }

    // Default: already exists
    logger.debug('[membership:member-events] Member already exists, skipping', {
      memberId: member.id,
      status: member.status,
      telegramId
    });
    return { processed: false, action: 'already_exists' };
  }

  // Member not found - check if error was something other than NOT_FOUND
  if (existingResult.error && existingResult.error.code !== 'MEMBER_NOT_FOUND') {
    logger.error('[membership:member-events] Error checking member', {
      telegramId,
      error: existingResult.error
    });
    return { processed: false, action: 'error' };
  }

  // New member - create trial (1.5)
  // Read trial days from system_config (set via /trial command)
  const trialDaysResult = await getTrialDays();
  const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;
  const createResult = await createTrialMember({ telegramId, telegramUsername: username }, trialDays);

  if (createResult.success) {
    const memberId = createResult.data.id;

    // Mark as joined since they're already in the group
    await confirmMemberJoinedGroup(memberId, telegramId, username);

    // AC3: Register join event in member_events table
    await registerMemberEvent(memberId, 'join', {
      telegram_id: telegramId,
      telegram_username: username,
      source: 'telegram_webhook',
      action: 'created'
    });

    // AC5: Send welcome message
    await sendWelcomeMessage(telegramId, firstName, memberId);

    logger.info('[membership:member-events] New trial member created', {
      memberId,
      telegramId,
      username,
      trialDays
    });
    return { processed: true, action: 'created' };
  }

  // Handle creation errors
  if (createResult.error?.code === 'MEMBER_ALREADY_EXISTS') {
    // Race condition - member was created between check and insert
    logger.warn('[membership:member-events] Race condition on member creation', { telegramId });
    return { processed: false, action: 'race_condition' };
  }

  logger.error('[membership:member-events] Failed to create member', {
    telegramId,
    error: createResult.error
  });
  return { processed: false, action: 'creation_failed' };
}

/**
 * Send welcome message to new trial member
 * AC5: Mensagem de Boas-vindas
 * @param {number} telegramId - Telegram user ID
 * @param {string} firstName - User's first name
 * @param {number} memberId - Internal member ID for notification tracking
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendWelcomeMessage(telegramId, firstName, memberId) {
  const bot = getBot();

  // Get success rate for message (4.2)
  const metricsResult = await getSuccessRate();
  let successRateText = 'N/A';
  if (metricsResult.success && metricsResult.data.rate30Days !== null) {
    successRateText = metricsResult.data.rate30Days.toFixed(1);
  }

  // Read trial days from system_config (set via /trial command)
  const trialDaysResult = await getTrialDays();
  const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;
  const operatorUsername = config.membership?.operatorUsername || 'operador';

  // Format message (4.3)
  const message = `
Bem-vindo ao *GuruBet*, ${firstName || 'apostador'}! 🎯

Você tem *${trialDays} dias grátis* para experimentar nossas apostas.

📊 *O que você recebe:*
• 3 apostas diárias com análise estatística
• Horários: 10h, 15h e 22h
• Taxa de acerto histórica: *${successRateText}%*

💰 Após o trial, continue por apenas *R$50/mês*.

❓ Dúvidas? Fale com @${operatorUsername}

Boas apostas! 🍀
  `.trim();

  try {
    // Send message to user's private chat (4.4)
    const sentMessage = await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });

    // Register notification in member_notifications (4.5)
    if (memberId) {
      const { error: notifError } = await supabase.from('member_notifications').insert({
        member_id: memberId,
        type: 'welcome',
        channel: 'telegram',
        message_id: sentMessage.message_id.toString()
      });

      if (notifError) {
        logger.warn('[membership:member-events] Failed to record notification', {
          memberId,
          error: notifError.message
        });
      }
    }

    logger.info('[membership:member-events] Welcome message sent', {
      telegramId,
      messageId: sentMessage.message_id
    });

    return { success: true, data: { messageId: sentMessage.message_id } };
  } catch (err) {
    // Handle user hasn't started chat with bot (4.6)
    if (err.response?.statusCode === 403 || err.response?.body?.error_code === 403) {
      logger.warn('[membership:member-events] User has not started chat with bot', { telegramId });
      return {
        success: false,
        error: { code: 'USER_BLOCKED_BOT', message: 'User has not started chat with bot' }
      };
    }

    logger.error('[membership:member-events] Failed to send welcome message', {
      telegramId,
      error: err.message,
      statusCode: err.response?.statusCode
    });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Confirm member has joined the group (Story 16.9: Gate Entry)
 * Updates joined_group_at timestamp and clears invite link
 * @param {number} memberId - Internal member ID
 * @param {number} telegramId - Telegram user ID
 * @param {string} username - Telegram username
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function confirmMemberJoinedGroup(memberId, telegramId, username) {
  try {
    const { error } = await supabase
      .from('members')
      .update({
        joined_group_at: new Date().toISOString(),
        telegram_username: username || null // Update username in case it changed
      })
      .eq('id', memberId);

    if (error) {
      logger.warn('[membership:member-events] Failed to confirm group join', {
        memberId,
        telegramId,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[membership:member-events] Group join confirmed', {
      memberId,
      telegramId
    });
    return { success: true };
  } catch (err) {
    logger.error('[membership:member-events] Error confirming group join', {
      memberId,
      telegramId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Register member event in member_events table (AC3)
 * @param {number} memberId - Internal member ID
 * @param {string} eventType - Event type (join, leave, etc.)
 * @param {object} payload - Event payload data
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function registerMemberEvent(memberId, eventType, payload) {
  try {
    const { error } = await supabase.from('member_events').insert({
      member_id: memberId,
      event_type: eventType,
      payload
    });

    if (error) {
      logger.warn('[membership:member-events] Failed to register event', {
        memberId,
        eventType,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[membership:member-events] Event registered', { memberId, eventType });
    return { success: true };
  } catch (err) {
    logger.error('[membership:member-events] Error registering event', {
      memberId,
      eventType,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Register reactivation join notification
 * Story 16.10: AC5 - Track when reactivated member enters group
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function registerReactivationJoinNotification(memberId) {
  try {
    return await registerNotification(memberId, 'reactivation_join', 'system');
  } catch (err) {
    logger.warn('[membership:member-events] Failed to register reactivation_join notification', {
      memberId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Send payment required message to returning removed member
 * @param {number} telegramId - Telegram user ID
 * @param {number} memberId - Internal member ID for notification tracking
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function sendPaymentRequiredMessage(telegramId, memberId = null) {
  const bot = getBot();
  const checkoutUrl = config.membership?.checkoutUrl;
  const operatorUsername = config.membership?.operatorUsername || 'operador';

  // Issue #3: Handle missing checkout URL gracefully
  let message;
  if (checkoutUrl) {
    message = `
Olá! Notamos que você voltou ao grupo. 👋

Seu período de trial já terminou há mais de 24 horas.

Para continuar recebendo nossas apostas:
[ASSINAR POR R$50/MÊS](${checkoutUrl})

❓ Dúvidas? Fale com @${operatorUsername}
    `.trim();
  } else {
    // Fallback message when checkout URL is not configured
    message = `
Olá! Notamos que você voltou ao grupo. 👋

Seu período de trial já terminou há mais de 24 horas.

Para continuar recebendo nossas apostas, entre em contato com @${operatorUsername} para assinar por *R$50/mês*.
    `.trim();
    logger.warn('[membership:member-events] Checkout URL not configured, using fallback message');
  }

  try {
    const sentMessage = await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });

    // Issue #2: Record notification in member_notifications for consistency
    if (memberId) {
      const { error: notifError } = await supabase.from('member_notifications').insert({
        member_id: memberId,
        type: 'payment_required',
        channel: 'telegram',
        message_id: sentMessage.message_id.toString()
      });

      if (notifError) {
        logger.warn('[membership:member-events] Failed to record payment notification', {
          memberId,
          error: notifError.message
        });
      }
    }

    logger.info('[membership:member-events] Payment required message sent', { telegramId, memberId });
    return { success: true, data: { messageId: sentMessage.message_id } };
  } catch (err) {
    if (err.response?.statusCode === 403 || err.response?.body?.error_code === 403) {
      logger.warn('[membership:member-events] User has not started chat with bot (payment msg)', { telegramId });
      return { success: false, error: { code: 'USER_BLOCKED_BOT', message: 'User has not started chat' } };
    }
    logger.error('[membership:member-events] Failed to send payment message', {
      telegramId,
      error: err.message
    });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Send payment confirmation message to member after successful payment
 * PRD Journey 5: "Pagamento confirmado! Você agora é membro ativo até DD/MM/AAAA."
 * @param {number} telegramId - Telegram user ID
 * @param {number} memberId - Internal member ID for notification tracking
 * @param {string} subscriptionEndsAt - ISO date string of subscription end date
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendPaymentConfirmation(telegramId, memberId, subscriptionEndsAt) {
  const bot = getBot();
  const operatorUsername = config.membership?.operatorUsername || 'operador';

  // Format date in Brazilian format (DD/MM/AAAA)
  const endDate = new Date(subscriptionEndsAt);
  const formattedDate = endDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const message = `
✅ *Pagamento confirmado!*

Você agora é membro ativo do *GuruBet* até *${formattedDate}*.

📊 Continue recebendo:
• 3 apostas diárias com análise estatística
• Horários: 10h, 15h e 22h

❓ Dúvidas? Fale com @${operatorUsername}

Boas apostas! 🍀
  `.trim();

  try {
    const sentMessage = await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });

    // Record notification in member_notifications
    if (memberId) {
      const { error: notifError } = await supabase.from('member_notifications').insert({
        member_id: memberId,
        type: 'payment_received',
        channel: 'telegram',
        message_id: sentMessage.message_id.toString()
      });

      if (notifError) {
        logger.warn('[membership:member-events] Failed to record payment confirmation notification', {
          memberId,
          error: notifError.message
        });
      }
    }

    logger.info('[membership:member-events] Payment confirmation sent', {
      telegramId,
      memberId,
      subscriptionEndsAt: formattedDate
    });

    return { success: true, data: { messageId: sentMessage.message_id } };
  } catch (err) {
    if (err.response?.statusCode === 403 || err.response?.body?.error_code === 403) {
      logger.warn('[membership:member-events] User has not started chat with bot (payment confirmation)', { telegramId });
      return { success: false, error: { code: 'USER_BLOCKED_BOT', message: 'User has not started chat' } };
    }
    logger.error('[membership:member-events] Failed to send payment confirmation', {
      telegramId,
      error: err.message
    });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

module.exports = {
  handleNewChatMembers,
  processNewMember,
  sendWelcomeMessage,
  sendPaymentRequiredMessage,
  sendPaymentConfirmation,
  registerMemberEvent,
  confirmMemberJoinedGroup,
  // Story 16.10: Exported for unit testing
  registerReactivationJoinNotification
};

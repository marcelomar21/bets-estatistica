/**
 * Start Command Handler - Gate Entry System for Group Access
 * Story 16.9: Implementar Portão de Entrada com Bot
 *
 * Flow:
 * 1. User clicks public link (t.me/Bot?start=join)
 * 2. Bot receives /start with payload
 * 3. Bot registers member as trial + sends welcome with invite link
 * 4. User clicks invite → enters private group
 * 5. All private notifications now work
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
  getTrialDaysRemaining
} = require('../services/memberService');
const { getSuccessRate } = require('../services/metricsService');

/**
 * Check if user is actually in the Telegram group via API
 * @param {object} bot - Telegram bot instance
 * @param {string} groupId - Group chat ID
 * @param {number} telegramId - User's Telegram ID
 * @returns {Promise<{inGroup: boolean, status: string|null}>}
 */
async function isUserInGroup(bot, groupId, telegramId) {
  try {
    const chatMember = await bot.getChatMember(groupId, telegramId);
    const status = chatMember.status;

    // These statuses mean user is in the group
    const inGroupStatuses = ['member', 'administrator', 'creator', 'restricted'];
    const inGroup = inGroupStatuses.includes(status);

    logger.debug('[membership:start-command] Checked user presence in group', {
      telegramId,
      groupId,
      status,
      inGroup
    });

    return { inGroup, status };
  } catch (err) {
    // Error 400 "Bad Request: user not found" means user is not in group
    if (err.message?.includes('user not found') || err.message?.includes('PARTICIPANT_ID_INVALID')) {
      logger.debug('[membership:start-command] User not found in group', { telegramId, groupId });
      return { inGroup: false, status: null };
    }

    logger.warn('[membership:start-command] Error checking user presence', {
      telegramId,
      groupId,
      error: err.message
    });

    // On error, fall back to database record (don't block the user)
    return { inGroup: null, status: 'error' };
  }
}

/**
 * Handle /start command with optional payload
 * @param {object} msg - Telegram message object
 * @returns {Promise<{success: boolean, action?: string, error?: object}>}
 */
async function handleStartCommand(msg) {
  const bot = getBot();
  const telegramId = msg.from.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;
  const chatId = msg.chat.id;

  // Extract payload from /start command (e.g., /start join → payload = "join")
  const text = msg.text || '';
  const payload = text.replace('/start', '').trim();

  logger.info('[membership:start-command] Received /start', {
    telegramId,
    username,
    firstName,
    payload,
    chatId
  });

  // Only respond to private chats
  if (msg.chat.type !== 'private') {
    logger.debug('[membership:start-command] Ignoring non-private chat', { chatType: msg.chat.type });
    return { success: false, action: 'ignored_non_private' };
  }

  // Check if member exists
  const existingResult = await getMemberByTelegramId(telegramId);

  if (existingResult.success) {
    const member = existingResult.data;
    return await handleExistingMember(bot, chatId, telegramId, firstName, member, payload);
  }

  // Member not found - check if error was something other than NOT_FOUND
  if (existingResult.error && existingResult.error.code !== 'MEMBER_NOT_FOUND') {
    logger.error('[membership:start-command] Error checking member', {
      telegramId,
      error: existingResult.error
    });
    await bot.sendMessage(chatId, '❌ Erro ao verificar seu cadastro. Tente novamente.');
    return { success: false, action: 'error', error: existingResult.error };
  }

  // New member - create trial and send welcome with invite
  return await handleNewMember(bot, chatId, telegramId, username, firstName);
}

/**
 * Handle existing member based on their status
 */
async function handleExistingMember(bot, chatId, telegramId, firstName, member, _payload) {
  const { status } = member;

  logger.info('[membership:start-command] Existing member', {
    memberId: member.id,
    telegramId,
    status
  });

  switch (status) {
    case 'trial':
    case 'ativo':
      // Member already in good standing - check if needs invite link
      return await handleActiveOrTrialMember(bot, chatId, firstName, member);

    case 'inadimplente':
      // Defaulted - send payment link
      return await sendPaymentRequired(bot, chatId, firstName, member);

    case 'removido':
      // Check if can rejoin (< 24h since kick)
      return await handleRemovedMember(bot, chatId, telegramId, firstName, member);

    default:
      logger.warn('[membership:start-command] Unknown status', { status, memberId: member.id });
      await bot.sendMessage(chatId, '❌ Status desconhecido. Entre em contato com o suporte.');
      return { success: false, action: 'unknown_status' };
  }
}

/**
 * Handle trial or active member - show status and offer invite if needed
 */
async function handleActiveOrTrialMember(bot, chatId, firstName, member) {
  const isTrialMember = member.status === 'trial';
  const groupId = config.telegram.publicGroupId;

  // Check if member has joined the group according to DB
  const hasJoinedGroupInDb = !!member.joined_group_at;

  // If DB says they joined, verify they're ACTUALLY still in the group via Telegram API
  if (hasJoinedGroupInDb) {
    const presenceCheck = await isUserInGroup(bot, groupId, member.telegram_id);

    // If API check failed (error), fall back to trusting DB record
    // If API says user is NOT in group, generate new invite
    if (presenceCheck.inGroup === false) {
      logger.info('[membership:start-command] User left group but DB shows joined, generating new invite', {
        memberId: member.id,
        telegramId: member.telegram_id,
        telegramStatus: presenceCheck.status
      });

      // Clear joined_group_at since they're not actually in the group
      await clearJoinedGroupAt(member.id);

      // Generate new invite link
      const inviteResult = await generateAndSendInvite(bot, chatId, firstName, member);
      return inviteResult;
    }

    // User is confirmed in group - show status message
    let statusMessage;

    if (isTrialMember) {
      const daysResult = await getTrialDaysRemaining(member.id);
      const daysRemaining = daysResult.success ? daysResult.data.daysRemaining : '?';

      statusMessage = `
Olá, ${firstName}! 👋

✅ Você já está no grupo!

📊 *Seu status:* Trial
⏳ *Dias restantes:* ${daysRemaining}

Continue aproveitando nossas apostas! 🎯
      `.trim();
    } else {
      const subscriptionEnds = member.subscription_ends_at
        ? new Date(member.subscription_ends_at).toLocaleDateString('pt-BR')
        : 'N/A';

      statusMessage = `
Olá, ${firstName}! 👋

✅ Você já está no grupo!

📊 *Seu status:* Assinante ativo
📅 *Válido até:* ${subscriptionEnds}

Obrigado por fazer parte do GuruBet! 🎯
      `.trim();
    }

    await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    return { success: true, action: 'already_in_group' };
  }

  // Not in group yet - generate invite link
  const inviteResult = await generateAndSendInvite(bot, chatId, firstName, member);
  return inviteResult;
}

/**
 * Handle removed member - check if can rejoin
 */
async function handleRemovedMember(bot, chatId, telegramId, firstName, member) {
  const rejoinResult = await canRejoinGroup(member.id);

  if (rejoinResult.success && rejoinResult.data.canRejoin) {
    // Can rejoin - reactivate as trial
    const reactivateResult = await reactivateMember(member.id);

    if (reactivateResult.success) {
      // Register event
      await registerMemberEvent(member.id, 'reactivate', {
        telegram_id: telegramId,
        source: 'start_command',
        hours_since_kick: rejoinResult.data.hoursSinceKick
      });

      // Generate invite
      const inviteResult = await generateAndSendInvite(bot, chatId, firstName, reactivateResult.data);

      logger.info('[membership:start-command] Member reactivated', {
        memberId: member.id,
        telegramId,
        hoursSinceKick: rejoinResult.data.hoursSinceKick?.toFixed(2)
      });

      return { success: true, action: 'reactivated', ...inviteResult };
    }

    logger.error('[membership:start-command] Failed to reactivate', {
      memberId: member.id,
      error: reactivateResult.error
    });
    await bot.sendMessage(chatId, '❌ Erro ao reativar sua conta. Tente novamente.');
    return { success: false, action: 'reactivation_failed' };
  }

  // Cannot rejoin - need to pay
  return await sendPaymentRequired(bot, chatId, firstName, member);
}

/**
 * Handle new member - create trial and send welcome
 */
async function handleNewMember(bot, chatId, telegramId, username, firstName) {
  const trialDays = config.membership?.trialDays || 7;

  // Create trial member
  const createResult = await createTrialMember(
    { telegramId, telegramUsername: username },
    trialDays
  );

  if (!createResult.success) {
    if (createResult.error?.code === 'MEMBER_ALREADY_EXISTS') {
      // Race condition - member was created between check and insert
      logger.warn('[membership:start-command] Race condition on member creation', { telegramId });
      await bot.sendMessage(chatId, '⏳ Processando... envie /start novamente.');
      return { success: false, action: 'race_condition' };
    }

    logger.error('[membership:start-command] Failed to create member', {
      telegramId,
      error: createResult.error
    });
    await bot.sendMessage(chatId, '❌ Erro ao criar sua conta. Tente novamente.');
    return { success: false, action: 'creation_failed' };
  }

  const member = createResult.data;

  // Register event
  await registerMemberEvent(member.id, 'trial_start', {
    telegram_id: telegramId,
    telegram_username: username,
    source: 'start_command'
  });

  // Generate invite and send welcome
  const inviteResult = await generateAndSendInvite(bot, chatId, firstName, member);

  logger.info('[membership:start-command] New trial member created', {
    memberId: member.id,
    telegramId,
    username,
    trialDays
  });

  return { success: true, action: 'created', ...inviteResult };
}

/**
 * Generate invite link and send welcome message
 */
async function generateAndSendInvite(bot, chatId, firstName, member) {
  const groupId = config.telegram.publicGroupId;
  const trialDays = config.membership?.trialDays || 7;
  const operatorUsername = config.membership?.operatorUsername || 'operador';

  // Generate unique invite link
  let inviteLink;
  try {
    const invite = await bot.createChatInviteLink(groupId, {
      member_limit: 1, // Only 1 use
      expire_date: Math.floor(Date.now() / 1000) + 86400, // Expires in 24h
      creates_join_request: false
    });
    inviteLink = invite.invite_link;

    // Save invite link to member record
    await updateMemberInviteData(member.id, inviteLink);

    logger.info('[membership:start-command] Invite link generated', {
      memberId: member.id,
      inviteLink: inviteLink.substring(0, 30) + '...'
    });
  } catch (err) {
    logger.error('[membership:start-command] Failed to generate invite link', {
      memberId: member.id,
      error: err.message
    });

    // Fallback message without invite link
    const fallbackMessage = `
Bem-vindo ao *GuruBet*, ${firstName || 'apostador'}! 🎯

⚠️ Não foi possível gerar seu link de convite automaticamente.

Por favor, entre em contato com @${operatorUsername} para receber acesso ao grupo.
    `.trim();

    await bot.sendMessage(chatId, fallbackMessage, { parse_mode: 'Markdown' });
    return { success: false, action: 'invite_generation_failed' };
  }

  // Get success rate for welcome message
  const metricsResult = await getSuccessRate();
  let successRateText = 'N/A';
  if (metricsResult.success && metricsResult.data.rate30Days !== null) {
    successRateText = metricsResult.data.rate30Days.toFixed(1);
  }

  // Determine days remaining
  const isTrialMember = member.status === 'trial';
  const daysText = isTrialMember ? `${trialDays} dias grátis` : 'acesso ativo';

  // Build welcome message
  const welcomeMessage = `
Bem-vindo ao *GuruBet*, ${firstName || 'apostador'}! 🎯

Você tem *${daysText}* para experimentar nossas apostas.

📊 *O que você recebe:*
• 3 apostas diárias com análise estatística
• Horários: 10h, 15h e 22h
• Taxa de acerto histórica: *${successRateText}%*

💰 Após o trial, continue por apenas *R$50/mês*.

👇 *Clique no botão abaixo para entrar no grupo:*
  `.trim();

  // Send with inline button
  await bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀 ENTRAR NO GRUPO', url: inviteLink }
      ]]
    }
  });

  // Record welcome notification
  await recordNotification(member.id, 'welcome', chatId.toString());

  return { success: true, inviteLink };
}

/**
 * Send payment required message
 */
async function sendPaymentRequired(bot, chatId, firstName, member) {
  const checkoutUrl = config.membership?.checkoutUrl;
  const operatorUsername = config.membership?.operatorUsername || 'operador';
  const subscriptionPrice = config.membership?.subscriptionPrice || 'R$50/mês';

  let message;
  let replyMarkup = null;

  if (checkoutUrl) {
    message = `
Olá, ${firstName}! 👋

Seu período de acesso terminou.

Para continuar recebendo nossas apostas com análise estatística, assine por apenas *${subscriptionPrice}*.

👇 *Clique no botão abaixo para assinar:*
    `.trim();

    replyMarkup = {
      inline_keyboard: [[
        { text: '💳 ASSINAR AGORA', url: checkoutUrl }
      ]]
    };
  } else {
    message = `
Olá, ${firstName}! 👋

Seu período de acesso terminou.

Para continuar recebendo nossas apostas, entre em contato com @${operatorUsername} para assinar por *${subscriptionPrice}*.
    `.trim();
  }

  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: replyMarkup
  });

  // Record notification
  await recordNotification(member.id, 'payment_required', chatId.toString());

  logger.info('[membership:start-command] Payment required message sent', {
    memberId: member.id,
    hasCheckoutUrl: !!checkoutUrl
  });

  return { success: true, action: 'payment_required' };
}

/**
 * Update member with invite link data
 */
async function updateMemberInviteData(memberId, inviteLink) {
  try {
    const { error } = await supabase
      .from('members')
      .update({
        invite_link: inviteLink,
        invite_generated_at: new Date().toISOString()
      })
      .eq('id', memberId);

    if (error) {
      logger.warn('[membership:start-command] Failed to update invite data', {
        memberId,
        error: error.message
      });
    }
  } catch (err) {
    logger.warn('[membership:start-command] Error updating invite data', {
      memberId,
      error: err.message
    });
  }
}

/**
 * Clear joined_group_at when user has left the group
 * This allows them to receive a new invite link
 */
async function clearJoinedGroupAt(memberId) {
  try {
    const { error } = await supabase
      .from('members')
      .update({
        joined_group_at: null,
        invite_link: null
      })
      .eq('id', memberId);

    if (error) {
      logger.warn('[membership:start-command] Failed to clear joined_group_at', {
        memberId,
        error: error.message
      });
    } else {
      logger.info('[membership:start-command] Cleared joined_group_at for re-invite', {
        memberId
      });
    }
  } catch (err) {
    logger.warn('[membership:start-command] Error clearing joined_group_at', {
      memberId,
      error: err.message
    });
  }
}

/**
 * Register member event in member_events table
 */
async function registerMemberEvent(memberId, eventType, payload) {
  try {
    const { error } = await supabase.from('member_events').insert({
      member_id: memberId,
      event_type: eventType,
      payload
    });

    if (error) {
      logger.warn('[membership:start-command] Failed to register event', {
        memberId,
        eventType,
        error: error.message
      });
    }
  } catch (err) {
    logger.error('[membership:start-command] Error registering event', {
      memberId,
      eventType,
      error: err.message
    });
  }
}

/**
 * Record notification in member_notifications table
 */
async function recordNotification(memberId, type, messageId) {
  try {
    const { error } = await supabase.from('member_notifications').insert({
      member_id: memberId,
      type,
      channel: 'telegram',
      message_id: messageId
    });

    if (error) {
      logger.warn('[membership:start-command] Failed to record notification', {
        memberId,
        type,
        error: error.message
      });
    }
  } catch (err) {
    logger.warn('[membership:start-command] Error recording notification', {
      memberId,
      type,
      error: err.message
    });
  }
}

/**
 * Handle /status command in private chat
 */
async function handleStatusCommand(msg) {
  const bot = getBot();
  const telegramId = msg.from.id;
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  // Only respond to private chats
  if (msg.chat.type !== 'private') {
    return { success: false, action: 'ignored_non_private' };
  }

  const memberResult = await getMemberByTelegramId(telegramId);

  if (!memberResult.success) {
    await bot.sendMessage(chatId, `
Olá, ${firstName}! 👋

Você ainda não está cadastrado.

Envie /start para começar seu trial gratuito!
    `.trim());
    return { success: true, action: 'not_registered' };
  }

  const member = memberResult.data;
  let statusEmoji, statusText, extraInfo;

  switch (member.status) {
    case 'trial': {
      const daysResult = await getTrialDaysRemaining(member.id);
      const daysRemaining = daysResult.success ? daysResult.data.daysRemaining : '?';
      statusEmoji = '🎁';
      statusText = 'Trial';
      extraInfo = `⏳ Dias restantes: ${daysRemaining}`;
      break;
    }
    case 'ativo': {
      const subscriptionEnds = member.subscription_ends_at
        ? new Date(member.subscription_ends_at).toLocaleDateString('pt-BR')
        : 'N/A';
      statusEmoji = '✅';
      statusText = 'Assinante ativo';
      extraInfo = `📅 Válido até: ${subscriptionEnds}`;
      break;
    }
    case 'inadimplente':
      statusEmoji = '⚠️';
      statusText = 'Pagamento pendente';
      extraInfo = '💳 Regularize sua assinatura para continuar';
      break;
    case 'removido':
      statusEmoji = '❌';
      statusText = 'Removido';
      extraInfo = '📩 Envie /start para verificar reativação';
      break;
    default:
      statusEmoji = '❓';
      statusText = 'Desconhecido';
      extraInfo = '';
  }

  const statusMessage = `
${statusEmoji} *Seu Status no GuruBet*

📊 Status: *${statusText}*
${extraInfo}

👤 Telegram ID: \`${telegramId}\`
📆 Membro desde: ${new Date(member.created_at).toLocaleDateString('pt-BR')}
  `.trim();

  await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
  return { success: true, action: 'status_shown' };
}

module.exports = {
  handleStartCommand,
  handleStatusCommand
};

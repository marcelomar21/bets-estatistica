/**
 * Start Command Handler - Gate Entry System for Group Access
 * Story 16.9: Implementar Portão de Entrada com Bot
 * Tech-Spec: Migração MP - Simplified (removed affiliate deep link tracking)
 *
 * Flow:
 * 1. User clicks public link (t.me/Bot?start=join)
 * 2. Bot receives /start with payload
 * 3. Bot registers member as trial + sends welcome with invite link
 * 4. User clicks invite → enters private group
 * 5. All private notifications now work
 *
 * Note: With MP, affiliate tracking happens via coupons at MP checkout,
 * not via Telegram deep links. The /start command is simplified.
 */
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { getBot } = require('../telegram');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByTelegramId,
  getMemberByEmail,
  canRejoinGroup,
  reactivateMember,
  getTrialDaysRemaining,
  linkTelegramId,
  getTrialDays
} = require('../services/memberService');
const { getSuccessRateForDays } = require('../services/metricsService');

/**
 * In-memory conversation state for email verification flow
 * Key: telegramId, Value: { state: 'waiting_email', timestamp: Date }
 * States expire after 5 minutes
 */
const conversationState = new Map();
const CONVERSATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Set conversation state for a user
 */
function setConversationState(telegramId, state) {
  conversationState.set(telegramId.toString(), {
    state,
    timestamp: Date.now()
  });
}

/**
 * Get conversation state for a user (returns null if expired or not set)
 */
function getConversationState(telegramId) {
  const entry = conversationState.get(telegramId.toString());
  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > CONVERSATION_TIMEOUT_MS) {
    conversationState.delete(telegramId.toString());
    return null;
  }

  return entry.state;
}

/**
 * Clear conversation state for a user
 */
function clearConversationState(telegramId) {
  conversationState.delete(telegramId.toString());
}

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
      // Unban user from group before sending invite (they were banned when kicked)
      const groupId = config.telegram.publicGroupId;
      try {
        await bot.unbanChatMember(groupId, telegramId, { only_if_banned: true });
        logger.info('[membership:start-command] User unbanned for reactivation', {
          memberId: member.id,
          telegramId,
          groupId
        });
      } catch (unbanErr) {
        logger.warn('[membership:start-command] Failed to unban user (may not be banned)', {
          memberId: member.id,
          telegramId,
          error: unbanErr.message
        });
        // Continue anyway - user might not be banned
      }

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
 * Handle new member - ask for email to verify MP payment or create trial
 * Note: With MP, payment can happen before user starts the bot. We need to ask
 * for email to link the telegram_id with an existing member.
 */
async function handleNewMember(bot, chatId, telegramId, username, firstName) {
  // Ask for email to check if they already paid via MP
  const askEmailMessage = `
Olá, ${firstName || 'apostador'}! 👋

Para continuar, preciso verificar seu cadastro.

📧 *Por favor, digite o email que você usou no pagamento:*

_(Se você ainda não é assinante, digite qualquer email para começar seu trial gratuito)_
  `.trim();

  await bot.sendMessage(chatId, askEmailMessage, { parse_mode: 'Markdown' });

  // Set conversation state to wait for email
  setConversationState(telegramId, 'waiting_email');

  logger.info('[membership:start-command] Waiting for email from new user', {
    telegramId,
    username
  });

  return { success: true, action: 'waiting_email' };
}

/**
 * Handle email input from user (called when user sends a text message while in waiting_email state)
 * @param {object} msg - Telegram message object
 * @returns {Promise<{success: boolean, action?: string, error?: object}>}
 */
async function handleEmailInput(msg) {
  const bot = getBot();
  const telegramId = msg.from.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim().toLowerCase();

  // Clear conversation state
  clearConversationState(telegramId);

  // Validate email format (basic validation)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(text)) {
    await bot.sendMessage(chatId, `
❌ Email inválido. Por favor, envie um email válido.

Envie /start para tentar novamente.
    `.trim());
    return { success: false, action: 'invalid_email' };
  }

  const email = text;

  logger.info('[membership:start-command] Email received, checking member', {
    telegramId,
    email
  });

  // Check if member exists with this email
  const emailResult = await getMemberByEmail(email);

  if (emailResult.success) {
    const member = emailResult.data;

    // Check if member already has a telegram_id linked
    if (member.telegram_id && member.telegram_id !== telegramId.toString()) {
      // Different telegram is linked to this email
      logger.warn('[membership:start-command] Email already linked to different Telegram', {
        email,
        linkedTelegramId: member.telegram_id,
        attemptingTelegramId: telegramId
      });

      await bot.sendMessage(chatId, `
❌ Este email já está vinculado a outra conta do Telegram.

Se você acha que isso é um erro, entre em contato com o suporte.
      `.trim());
      return { success: false, action: 'email_already_linked' };
    }

    // Email exists and either has no telegram_id or same telegram_id
    // Link telegram_id to member
    const linkResult = await linkTelegramId(member.id, telegramId, username);

    if (!linkResult.success) {
      logger.error('[membership:start-command] Failed to link Telegram', {
        memberId: member.id,
        telegramId,
        error: linkResult.error
      });
      await bot.sendMessage(chatId, '❌ Erro ao vincular sua conta. Tente novamente.');
      return { success: false, action: 'link_failed', error: linkResult.error };
    }

    // Register event
    await registerMemberEvent(member.id, 'telegram_linked', {
      telegram_id: telegramId,
      telegram_username: username,
      email,
      source: 'email_verification'
    });

    logger.info('[membership:start-command] Telegram linked to existing member', {
      memberId: member.id,
      telegramId,
      email,
      status: member.status
    });

    // Send welcome message with invite based on member status
    if (member.status === 'ativo' || member.status === 'trial') {
      // Send "linked" message FIRST
      await bot.sendMessage(chatId, `
✅ *Conta vinculada com sucesso!*

Seu email ${email} foi vinculado a este Telegram.
      `.trim(), { parse_mode: 'Markdown' });

      // Then send invite
      const inviteResult = await generateAndSendInvite(bot, chatId, firstName, linkResult.data);

      return { success: true, action: 'linked_and_invited', ...inviteResult };
    }

    // Member is not in active/trial status - handle accordingly
    return await handleExistingMember(bot, chatId, telegramId, firstName, linkResult.data, null);
  }

  // Email not found - user hasn't paid yet, send payment link
  logger.info('[membership:start-command] Email not found, sending payment link', {
    telegramId,
    email
  });

  const checkoutUrl = config.membership?.checkoutUrl;
  const subscriptionPrice = config.membership?.subscriptionPrice || 'R$50/mês';

  // Get trial days from system_config (database)
  const trialDaysResult = await getTrialDays();
  const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;

  let paymentMessage;
  let replyMarkup = null;

  if (checkoutUrl) {
    paymentMessage = `
❌ Não encontramos uma assinatura com o email *${email}*.

Para ter acesso ao grupo do GuruBet, você precisa assinar primeiro.

💰 *Valor:* ${subscriptionPrice}
🎁 *Inclui ${trialDays} dias grátis para testar!*

👇 *Clique no botão abaixo para assinar:*
    `.trim();

    replyMarkup = {
      inline_keyboard: [[
        { text: '💳 ASSINAR AGORA', url: checkoutUrl }
      ]]
    };
  } else {
    const operatorUsername = config.membership?.operatorUsername || 'operador';
    paymentMessage = `
❌ Não encontramos uma assinatura com o email *${email}*.

Para ter acesso ao grupo, entre em contato com @${operatorUsername} para assinar.
    `.trim();
  }

  await bot.sendMessage(chatId, paymentMessage, {
    parse_mode: 'Markdown',
    reply_markup: replyMarkup
  });

  // Add instruction for after payment
  await bot.sendMessage(chatId, `
📌 *Após o pagamento:*
Envie /start novamente e informe o mesmo email que usou no checkout.
  `.trim(), { parse_mode: 'Markdown' });

  return { success: true, action: 'payment_link_sent' };
}

/**
 * Generate invite link and send welcome message
 */
async function generateAndSendInvite(bot, chatId, firstName, member) {
  const groupId = config.telegram.publicGroupId;
  // Get trial days from system_config (database)
  const trialDaysResult = await getTrialDays();
  const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;
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

  // Get success rate for welcome message (fallback to 71.29% if not available)
  const metricsResult = await getSuccessRateForDays(30);
  let successRateText = '71.29';
  if (metricsResult.success && metricsResult.data.rate !== null) {
    successRateText = metricsResult.data.rate.toFixed(1);
  }

  // Determine days remaining
  const isTrialMember = member.status === 'trial';
  const daysText = isTrialMember ? `${trialDays} dias grátis` : 'acesso ativo';

  // Build welcome message
  const welcomeMessage = `
Bem-vindo ao *GuruBet*, ${firstName || 'apostador'}! 🎯

Você tem *${daysText}* para experimentar nossas apostas.

📊 *O que você recebe:*
• 3 sugestões de apostas diárias
• Análise estatística completa
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

/**
 * Check if a message should be handled as email input
 * @param {object} msg - Telegram message object
 * @returns {boolean}
 */
function shouldHandleAsEmailInput(msg) {
  // Only private chats
  if (msg.chat.type !== 'private') return false;

  // Only text messages
  if (!msg.text) return false;

  // Ignore commands
  if (msg.text.startsWith('/')) return false;

  // Check if user is in waiting_email state
  const state = getConversationState(msg.from.id);
  return state === 'waiting_email';
}

module.exports = {
  handleStartCommand,
  handleStatusCommand,
  handleEmailInput,
  shouldHandleAsEmailInput,
  getConversationState
};

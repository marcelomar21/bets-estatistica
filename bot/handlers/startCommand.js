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
const { getBot, getDefaultBotCtx } = require('../telegram');
const { supabase } = require('../../lib/supabase');
const { getConfig } = require('../lib/configHelper');
const {
  getMemberByTelegramId,
  getMemberByEmail,
  canRejoinGroup,
  reactivateMember,
  getTrialDaysRemaining,
  linkTelegramId,
  createTrialMember
} = require('../services/memberService');
const { formatFullDateBR } = require('../../lib/utils');
const { getSuccessRateForDays } = require('../services/metricsService');
const { acceptTerms, hasAcceptedVersion } = require('../services/termsService');
const { insertAdminNotification } = require('../services/notificationHelper');
const { formatBRL } = require('../lib/formatPrice');

/**
 * Default welcome message template with placeholders.
 * Used when groups.welcome_message_template is NULL.
 */
const DEFAULT_WELCOME_TEMPLATE = [
  '🎉 Bem-vindo ao *{grupo}*, {nome}!',
  '',
  'Seu trial de *{dias_trial} dias* começa agora!',
  '📅 *Válido até:* {data_expiracao}',
  '',
  '📊 *O que você recebe:*',
  '• 3 sugestões de apostas diárias',
  '• Análise estatística completa',
  '• Taxa de acerto histórica: *{taxa_acerto}%*',
  '',
  '💰 {linha_preco}',
  '',
  '👇 *Clique no botão abaixo para entrar no grupo:*',
].join('\n');

/**
 * Render a welcome message template by replacing placeholders with actual values.
 * @param {string} template - Template with {placeholder} tokens
 * @param {object} vars - Values to substitute
 * @returns {string}
 */
function renderWelcomeTemplate(template, vars) {
  const priceLine = vars.preco
    ? `Para continuar após o trial, assine por apenas *${vars.preco}*.`
    : 'Para continuar após o trial, consulte o operador.';

  return template
    .replace(/\{nome\}/g, vars.nome || 'apostador')
    .replace(/\{grupo\}/g, vars.grupo || '')
    .replace(/\{dias_trial\}/g, String(vars.dias_trial || 7))
    .replace(/\{data_expiracao\}/g, vars.data_expiracao || '—')
    .replace(/\{taxa_acerto\}/g, vars.taxa_acerto || '0')
    .replace(/\{preco\}/g, vars.preco || '')
    .replace(/\{linha_preco\}/g, priceLine);
}

/**
 * Get the group display name from botCtx, with fallback.
 */
function getGroupName(botCtx) {
  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  return effectiveBotCtx?.groupConfig?.name || 'o grupo';
}

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
async function handleStartCommand(msg, botCtx = null) {
  const bot = botCtx?.bot || getBot();
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

  // Check if member exists — filter by group to avoid cross-group matches
  const effectiveGroupId = (botCtx || getDefaultBotCtx())?.groupId || undefined;
  const existingResult = await getMemberByTelegramId(telegramId, effectiveGroupId);

  if (existingResult.success) {
    const member = existingResult.data;
    return await handleExistingMember(bot, chatId, telegramId, firstName, member, payload, botCtx);
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

  // Story 2-2: Branch by TRIAL_MODE (Pattern P3)
  const trialMode = await getConfig('TRIAL_MODE', 'mercadopago');

  if (trialMode === 'internal') {
    // Story 3-2: Check terms acceptance before creating trial
    const termsVersion = await getConfig('TERMS_VERSION', '1.0');
    const effectiveBotCtx = botCtx || getDefaultBotCtx();
    // Use group UUID (not Telegram chat ID) for terms_acceptance table
    const termsGroupId = effectiveBotCtx?.groupId;

    const acceptedResult = await hasAcceptedVersion(telegramId, termsGroupId, termsVersion);

    if (acceptedResult.success && acceptedResult.data.accepted) {
      // Already accepted current version — proceed to trial
      return await handleInternalTrialStart(bot, chatId, telegramId, username, firstName, botCtx);
    }

    // Show terms for acceptance
    const termsUrl = await getConfig('TERMS_URL', 'https://docs.google.com/document/d/terms');
    return await showTermsForAcceptance(bot, chatId, termsVersion, termsUrl);
  }

  // Mercadopago flow: ask for email to verify payment
  return await handleNewMember(bot, chatId, telegramId, username, firstName);
}

/**
 * Handle existing member based on their status
 */
async function handleExistingMember(bot, chatId, telegramId, firstName, member, _payload, botCtx = null) {
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
      return await handleActiveOrTrialMember(bot, chatId, firstName, member, botCtx);

    case 'inadimplente':
      // Defaulted - send payment link
      return await sendPaymentRequired(bot, chatId, firstName, member, botCtx);

    case 'removido':
      // Check if can rejoin (< 24h since kick)
      return await handleRemovedMember(bot, chatId, telegramId, firstName, member, botCtx);

    default:
      logger.warn('[membership:start-command] Unknown status', { status, memberId: member.id });
      await bot.sendMessage(chatId, '❌ Status desconhecido. Entre em contato com o suporte.');
      return { success: false, action: 'unknown_status' };
  }
}

/**
 * Handle trial or active member - show status and offer invite if needed
 */
async function handleActiveOrTrialMember(bot, chatId, firstName, member, botCtx = null) {
  const isTrialMember = member.status === 'trial';
  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  const groupId = effectiveBotCtx?.publicGroupId;

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
      const inviteResult = await generateAndSendInvite(bot, chatId, firstName, member, botCtx);
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
        ? formatFullDateBR(member.subscription_ends_at) || 'N/A'
        : 'N/A';

      statusMessage = `
Olá, ${firstName}! 👋

✅ Você já está no grupo!

📊 *Seu status:* Assinante ativo
📅 *Válido até:* ${subscriptionEnds}

Obrigado por fazer parte de ${getGroupName(botCtx)}! 🎯
      `.trim();
    }

    await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    return { success: true, action: 'already_in_group' };
  }

  // Not in group yet - generate invite link
  const inviteResult = await generateAndSendInvite(bot, chatId, firstName, member, botCtx);
  return inviteResult;
}

/**
 * Handle removed member - check if can rejoin
 */
async function handleRemovedMember(bot, chatId, telegramId, firstName, member, botCtx = null) {
  const rejoinResult = await canRejoinGroup(member.id);

  if (rejoinResult.success && rejoinResult.data.canRejoin) {
    // Can rejoin - reactivate as trial
    const reactivateResult = await reactivateMember(member.id);

    if (reactivateResult.success) {
      // Unban user from group before sending invite (they were banned when kicked)
      const effectiveBotCtx = botCtx || getDefaultBotCtx();
      const groupId = effectiveBotCtx?.publicGroupId;
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
      const inviteResult = await generateAndSendInvite(bot, chatId, firstName, reactivateResult.data, botCtx);

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
  return await sendPaymentRequired(bot, chatId, firstName, member, botCtx);
}

/**
 * Handle internal trial start - create trial member directly without email (Story 2-2)
 * When TRIAL_MODE='internal', new users get immediate trial access.
 */
async function handleInternalTrialStart(bot, chatId, telegramId, username, firstName, botCtx = null) {
  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  // Use group UUID (not Telegram chat ID) for members table
  const groupId = effectiveBotCtx?.groupId;

  // Get trial duration from group config (per-group setting)
  const groupConfig = effectiveBotCtx?.groupConfig;
  const trialDays = groupConfig?.trialDays || 7;

  // Create trial member (no email required)
  const createResult = await createTrialMember({
    telegramId,
    telegramUsername: username,
    email: null,
    groupId
  }, trialDays);

  if (!createResult.success) {
    logger.error('[membership:start-command] Failed to create internal trial member', {
      telegramId,
      error: createResult.error
    });
    await bot.sendMessage(chatId, '❌ Erro ao criar seu trial. Tente novamente.');
    return { success: false, action: 'trial_creation_failed', error: createResult.error };
  }

  const member = createResult.data;

  logger.info('[membership:start-command] Internal trial member created', {
    memberId: member.id,
    telegramId,
    trialDays
  });

  // Register event
  await registerMemberEvent(member.id, 'trial_started', {
    telegram_id: telegramId,
    telegram_username: username,
    source: 'internal_trial',
    trial_days: trialDays
  });

  // Notify admin panel about new trial (fire-and-forget)
  const groupName = getGroupName(effectiveBotCtx);
  insertAdminNotification({
    type: 'new_trial',
    severity: 'info',
    title: 'Novo Membro Trial',
    message: `Novo membro trial "${username || telegramId}" no grupo "${groupName}"`,
    groupId,
    metadata: { member_id: member.id, telegram_username: username, source: 'internal_trial' },
  }).catch(() => {});

  // Generate invite link and send welcome
  return await generateAndSendInvite(bot, chatId, firstName, member, botCtx);
}

/**
 * Show terms of adhesion for user acceptance (Story 3-2)
 * Sends a message with the terms summary and an inline "accept" button.
 */
async function showTermsForAcceptance(bot, chatId, termsVersion, termsUrl) {
  const message = `📋 *Termo de Adesão*\n\nAntes de entrar no grupo, é necessário aceitar nosso termo de adesão.\n\n📄 [Leia o termo completo](${termsUrl})\n\nAo clicar em "Li e aceito", você confirma que leu e concorda com os termos.`;

  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Li e aceito os termos', callback_data: 'terms_accept' }]
      ]
    }
  });

  logger.info('[membership:start-command] Terms shown for acceptance', { chatId, termsVersion });

  return { success: true, action: 'terms_shown', termsVersion };
}

/**
 * Handle callback when user clicks "Li e aceito" button (Story 3-2)
 * Registers terms acceptance and proceeds with trial creation.
 */
async function handleTermsAcceptCallback(bot, callbackQuery, botCtx = null) {
  const telegramId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const username = callbackQuery.from.username;
  const firstName = callbackQuery.from.first_name;

  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  // Use group UUID (not Telegram chat ID) for terms_acceptance table
  const termsGroupId = effectiveBotCtx?.groupId;

  // Read terms config
  const termsVersion = await getConfig('TERMS_VERSION', '1.0');
  const termsUrl = await getConfig('TERMS_URL', 'https://docs.google.com/document/d/terms');

  // Register acceptance
  const acceptResult = await acceptTerms(telegramId, termsGroupId, termsVersion, termsUrl);

  if (!acceptResult.success) {
    logger.error('[membership:start-command] Failed to register terms acceptance', {
      telegramId,
      error: acceptResult.error
    });
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Erro ao registrar aceite. Tente novamente.' });
    return { success: false, action: 'terms_accept_failed', error: acceptResult.error };
  }

  // Answer callback to remove loading state
  await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Termos aceitos!' });

  // Edit original message to confirm acceptance
  await bot.editMessageText('✅ Termos aceitos! Preparando seu acesso...', {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id
  });

  logger.info('[membership:start-command] Terms accepted via callback', {
    telegramId,
    termsVersion,
    acceptanceId: acceptResult.data.id
  });

  // Register event
  await registerMemberEvent(null, 'terms_accepted', {
    telegram_id: telegramId,
    terms_version: termsVersion,
    acceptance_id: acceptResult.data.id
  });

  // Proceed with trial creation (same as Story 2-2)
  return await handleInternalTrialStart(bot, chatId, telegramId, username, firstName, botCtx);
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
async function handleEmailInput(msg, botCtx = null) {
  const bot = botCtx?.bot || getBot();
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

  // Check if member exists with this email — filter by group
  const emailGroupId = (botCtx || getDefaultBotCtx())?.groupId || undefined;
  const emailResult = await getMemberByEmail(email, emailGroupId);

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
      const inviteResult = await generateAndSendInvite(bot, chatId, firstName, linkResult.data, botCtx);

      return { success: true, action: 'linked_and_invited', ...inviteResult };
    }

    // Member is not in active/trial status - handle accordingly
    return await handleExistingMember(bot, chatId, telegramId, firstName, linkResult.data, null, botCtx);
  }

  // Email not found - user hasn't paid yet, send payment link
  logger.info('[membership:start-command] Email not found, sending payment link', {
    telegramId,
    email
  });

  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  const groupConfig = effectiveBotCtx?.groupConfig || null;
  const checkoutUrl = groupConfig?.checkoutUrl || null;
  const subscriptionPrice = groupConfig?.subscriptionPrice ?? null;

  // F2/F9: Use per-group trial days instead of global system_config
  const trialDays = groupConfig?.trialDays || 7;

  let paymentMessage;
  let replyMarkup = null;

  if (checkoutUrl) {
    const priceLineEmail = subscriptionPrice ? `\n💰 *Valor:* ${formatBRL(subscriptionPrice)}` : '';
    // F10: Removed "dias grátis" messaging since MP plans no longer include free_trial
    paymentMessage = `
❌ Não encontramos uma assinatura com o email *${email}*.

Para ter acesso ao grupo, você precisa assinar primeiro.
${priceLineEmail}

👇 *Clique no botão abaixo para assinar:*
    `.trim();

    replyMarkup = {
      inline_keyboard: [[
        { text: '💳 ASSINAR AGORA', url: checkoutUrl }
      ]]
    };
  } else {
    const operatorUsername = groupConfig?.operatorUsername || 'operador';
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
async function generateAndSendInvite(bot, chatId, firstName, member, botCtx = null) {
  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  const groupId = effectiveBotCtx?.publicGroupId;
  // Get trial days from group config (per-group setting)
  const groupConfig = effectiveBotCtx?.groupConfig || null;
  const trialDays = groupConfig?.trialDays || 7;
  const operatorUsername = groupConfig?.operatorUsername || 'operador';
  const subscriptionPrice = groupConfig?.subscriptionPrice ?? null;

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
Bem-vindo ao *${getGroupName(botCtx)}*, ${firstName || 'apostador'}! 🎯

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

  // Story 2-2: Check TRIAL_MODE for customized welcome message
  const trialMode = await getConfig('TRIAL_MODE', 'mercadopago');
  const checkoutUrl = groupConfig?.checkoutUrl || null;

  let welcomeMessage;
  let inlineKeyboard;

  if (trialMode === 'internal' && isTrialMember) {
    // Internal trial: show expiration date and checkout link
    const trialEndsAt = member.trial_ends_at
      ? formatFullDateBR(member.trial_ends_at) || '—'
      : '—';

    const template = groupConfig?.welcomeMessageTemplate || DEFAULT_WELCOME_TEMPLATE;

    welcomeMessage = renderWelcomeTemplate(template, {
      nome: firstName || 'apostador',
      grupo: getGroupName(botCtx),
      dias_trial: trialDays,
      data_expiracao: trialEndsAt,
      taxa_acerto: successRateText,
      preco: formatBRL(subscriptionPrice) || '',
    });

    inlineKeyboard = [
      [{ text: '🚀 ENTRAR NO GRUPO', url: inviteLink }]
    ];
    if (checkoutUrl) {
      inlineKeyboard.push([{ text: '💳 ASSINAR AGORA', url: checkoutUrl }]);
    }
  } else {
    // Mercadopago flow: original welcome message
    const priceLineMp = subscriptionPrice
      ? `\n💰 Após o trial, continue por apenas *${formatBRL(subscriptionPrice)}*.`
      : '\n💰 Após o trial, consulte o operador para assinar.';

    welcomeMessage = `
Bem-vindo ao *${getGroupName(botCtx)}*, ${firstName || 'apostador'}! 🎯

Você tem *${daysText}* para experimentar nossas apostas.

📊 *O que você recebe:*
• 3 sugestões de apostas diárias
• Análise estatística completa
• Taxa de acerto histórica: *${successRateText}%*
${priceLineMp}

👇 *Clique no botão abaixo para entrar no grupo:*
    `.trim();

    inlineKeyboard = [
      [{ text: '🚀 ENTRAR NO GRUPO', url: inviteLink }]
    ];
  }

  // Send with inline button(s)
  // F5: Try/catch for template rendering — if custom template breaks Telegram Markdown,
  // fallback to default template to avoid breaking onboarding for all new members
  try {
    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
  } catch (sendErr) {
    logger.warn('[membership:start-command] Welcome message failed, retrying with default template', {
      memberId: member.id,
      error: sendErr.message,
    });
    // Retry with default template (guaranteed to be valid Markdown)
    const fallbackMessage = renderWelcomeTemplate(DEFAULT_WELCOME_TEMPLATE, {
      nome: firstName || 'apostador',
      grupo: getGroupName(botCtx),
      dias_trial: trialDays,
      data_expiracao: member.trial_ends_at ? formatFullDateBR(member.trial_ends_at) || '—' : '—',
      taxa_acerto: successRateText,
      preco: formatBRL(subscriptionPrice) || '',
    });
    await bot.sendMessage(chatId, fallbackMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
  }

  // Record welcome notification
  await recordNotification(member.id, 'welcome', chatId.toString());

  return { success: true, inviteLink };
}

/**
 * Send payment required message
 */
async function sendPaymentRequired(bot, chatId, firstName, member, botCtx = null) {
  const groupConfig = botCtx?.groupConfig || null;
  const checkoutUrl = groupConfig?.checkoutUrl || null;
  const operatorUsername = groupConfig?.operatorUsername || 'operador';
  const subscriptionPrice = groupConfig?.subscriptionPrice ?? null;

  let message;
  let replyMarkup = null;

  if (checkoutUrl) {
    const priceLinePayment = subscriptionPrice
      ? `assine por apenas *${formatBRL(subscriptionPrice)}*`
      : 'assine para continuar';
    message = `
Olá, ${firstName}! 👋

Seu período de acesso terminou.

Para continuar recebendo nossas apostas com análise estatística, ${priceLinePayment}.

👇 *Clique no botão abaixo para assinar:*
    `.trim();

    replyMarkup = {
      inline_keyboard: [[
        { text: '💳 ASSINAR AGORA', url: checkoutUrl }
      ]]
    };
  } else {
    const priceInfoContact = subscriptionPrice
      ? ` por *${formatBRL(subscriptionPrice)}*`
      : '';
    message = `
Olá, ${firstName}! 👋

Seu período de acesso terminou.

Para continuar recebendo nossas apostas, entre em contato com @${operatorUsername} para assinar${priceInfoContact}.
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
async function handleStatusCommand(msg, botCtx = null) {
  const bot = botCtx?.bot || getBot();
  const telegramId = msg.from.id;
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  // Only respond to private chats
  if (msg.chat.type !== 'private') {
    return { success: false, action: 'ignored_non_private' };
  }

  const statusGroupId = (botCtx || getDefaultBotCtx())?.groupId || undefined;
  const memberResult = await getMemberByTelegramId(telegramId, statusGroupId);

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
        ? formatFullDateBR(member.subscription_ends_at) || 'N/A'
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
${statusEmoji} *Seu Status em ${getGroupName(botCtx)}*

📊 Status: *${statusText}*
${extraInfo}

👤 Telegram ID: \`${telegramId}\`
📆 Membro desde: ${formatFullDateBR(member.created_at) || 'N/A'}
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
  getConversationState,
  handleTermsAcceptCallback,
  // F17: Exported for testing
  _internal: {
    renderWelcomeTemplate,
    DEFAULT_WELCOME_TEMPLATE,
  },
};

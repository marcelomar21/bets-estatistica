/**
 * Job: Post bets to public Telegram group
 *
 * Stories covered:
 * - 3.1: Criar job postagem pública
 * - 3.2: Formatar mensagem aposta
 * - 3.3: Incluir deep link na mensagem
 * - 3.4: Validar requisitos antes de postar
 * - 14.3: Integrar warns no job de postagem
 *
 * Run: node bot/jobs/postBets.js [morning|afternoon|night]
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { supabase } = require('../../lib/supabase');
const { sendToPublic, sendToAdmin, getBot, getDefaultBotCtx } = require('../telegram');
const { sendMessage: channelSendMessage } = require('../../lib/channelAdapter');
const { getFilaStatus, markBetAsPosted, registrarPostagem, getAvailableBets, updateGeneratedCopy } = require('../services/betService');
const { generateBetCopy } = require('../services/copyService');
const { sanitizeTelegramMarkdown, enforceOddLabel } = require('../lib/telegramMarkdown');
const { formatDateTimeBR } = require('../../lib/utils');
const { sendPostWarn } = require('./jobWarn');

// Store pending confirmations (in-memory)
const pendingConfirmations = new Map();

// Confirmation timeout in ms (15 minutes)
const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;

function getLogGroupId() {
  return config.membership.groupId || 'single-tenant';
}

async function loadPostingTimesForGroup(groupId) {
  if (!groupId) {
    return undefined;
  }

  try {
    const { data, error } = await supabase
      .from('groups')
      .select('posting_schedule')
      .eq('id', groupId)
      .single();

    if (error) {
      logger.warn('[postBets] Failed to load posting_schedule for nextPost calculation', {
        groupId,
        error: error.message,
      });
      return undefined;
    }

    const times = data?.posting_schedule?.times;
    if (Array.isArray(times) && times.length > 0) {
      return times;
    }
  } catch (err) {
    logger.warn('[postBets] Exception loading posting_schedule for nextPost calculation', {
      groupId,
      error: err.message,
    });
  }

  return undefined;
}

/**
 * Check if there's already a pending confirmation
 * Prevents multiple /postar from creating duplicate posts
 * @returns {boolean}
 */
function hasPendingConfirmation() {
  return pendingConfirmations.size > 0;
}

/**
 * Get info about pending confirmation for user feedback
 * @returns {object|null}
 */
function getPendingConfirmationInfo() {
  if (pendingConfirmations.size === 0) return null;
  const [confirmationId, data] = pendingConfirmations.entries().next().value;
  return { confirmationId, messageId: data.messageId };
}

/**
 * Cancel all pending confirmations (emergency stop)
 * Clears timeouts and resolves promises as cancelled
 * @returns {number} Number of confirmations cancelled
 */
function cancelAllPendingConfirmations() {
  const count = pendingConfirmations.size;
  for (const [confirmationId, data] of pendingConfirmations.entries()) {
    clearTimeout(data.timeoutId);
    data.resolve({ confirmed: false, autoPosted: false, cancelled: true });
    logger.info('Cancelled pending confirmation', { confirmationId, groupId: getLogGroupId() });
  }
  pendingConfirmations.clear();
  return count;
}

// Message templates for variety (Story 3.6)
const MESSAGE_TEMPLATES = [
  {
    header: '🎯 *APOSTA DO DIA*',
    footer: '🍀 Boa sorte!',
  },
  {
    header: '⚽ *DICA QUENTE*',
    footer: '💪 Bora lucrar!',
  },
  {
    header: '🔥 *OPORTUNIDADE*',
    footer: '📈 Vamos juntos!',
  },
  {
    header: '💰 *APOSTA SEGURA*',
    footer: '🎯 Confiança total!',
  },
  {
    header: '🏆 *SELEÇÃO DO DIA*',
    footer: '✨ Sucesso garantido!',
  },
];

/**
 * Get random template (backward compatibility)
 */
function getRandomTemplate() {
  const index = Math.floor(Math.random() * MESSAGE_TEMPLATES.length);
  return MESSAGE_TEMPLATES[index];
}

/**
 * Get template by index, supporting custom headers/footers from toneConfig
 * @param {object|null} toneConfig - Tone configuration with optional headers/footers arrays
 * @param {number} betIndex - Index for cycling through templates
 * @returns {object} - { header, footer }
 */
function getTemplate(toneConfig, betIndex) {
  if (toneConfig?.headers?.length > 0 && toneConfig?.footers?.length > 0) {
    return {
      header: toneConfig.headers[betIndex % toneConfig.headers.length],
      footer: toneConfig.footers[betIndex % toneConfig.footers.length],
    };
  }
  return MESSAGE_TEMPLATES[betIndex % MESSAGE_TEMPLATES.length];
}

/**
 * Get period from command line or current time
 */
function getPeriod() {
  const arg = process.argv[2];
  if (arg && ['morning', 'afternoon', 'night'].includes(arg)) {
    return arg;
  }

  // Use BRT timezone
  const now = new Date();
  const brtString = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const hour = parseInt(brtString, 10);

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

/**
 * Format bet message for Telegram - extrai dados do reasoning em bullets
 * @param {object} bet - Bet object
 * @param {object} template - Message template
 * @returns {Promise<string>}
 */
async function formatBetMessage(bet, template, toneConfig = null, betIndex = 0) {
  const kickoffStr = formatDateTimeBR(bet.kickoffTime) || 'N/A';

  // Build message parts
  const parts = [
    template.header,
    '',
    `⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*`,
    `🗓 ${kickoffStr}`,
    '',
    `📊 ${bet.betMarket}`,
    `💰 ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds?.toFixed(2) || 'N/A'}`,
  ];

  // Extrair dados do reasoning em bullets via LLM (or full message mode with examplePost)
  if (bet.reasoning || toneConfig?.examplePost || toneConfig?.examplePosts?.length > 0) {
    try {
      const copyResult = await generateBetCopy(bet, toneConfig);
      if (copyResult.success && copyResult.data?.copy) {
        if (copyResult.data.fullMessage) {
          // Full message mode: enforce oddLabel + sanitize before returning
          let fullMsg = copyResult.data.copy;
          fullMsg = enforceOddLabel(fullMsg, toneConfig?.oddLabel);
          return sanitizeTelegramMarkdown(fullMsg);
        }
        parts.push('');
        parts.push(copyResult.data.copy);
        logger.debug('Using extracted data bullets', { betId: bet.id, groupId: getLogGroupId() });
      } else if (bet.reasoning) {
        // Fallback: usar reasoning direto (sem truncamento)
        parts.push('');
        parts.push(sanitizeTelegramMarkdown(`_${bet.reasoning}_`));
      }
    } catch (err) {
      logger.warn('Failed to extract data bullets', { betId: bet.id, groupId: getLogGroupId(), error: err.message });
      if (bet.reasoning) {
        parts.push('');
        parts.push(sanitizeTelegramMarkdown(`_${bet.reasoning}_`));
      }
    }
  }

  // Add deep link with cycling CTA
  if (bet.deepLink) {
    let ctaText = 'Apostar Agora';
    if (toneConfig?.ctaTexts?.length > 0) {
      ctaText = toneConfig.ctaTexts[betIndex % toneConfig.ctaTexts.length];
    } else if (toneConfig?.ctaText) {
      ctaText = toneConfig.ctaText;
    }
    parts.push('');
    parts.push(`🔗 [${ctaText}](${bet.deepLink})`);
  }

  parts.push('');
  parts.push(template.footer);

  let finalMessage = parts.join('\n');
  finalMessage = enforceOddLabel(finalMessage, toneConfig?.oddLabel);
  return sanitizeTelegramMarkdown(finalMessage);
}

/**
 * Format bet preview (simpler version without LLM copy)
 * @param {object} bet - Bet object
 * @param {string} type - 'repost' or 'new'
 * @returns {string}
 */
function formatBetPreview(bet, type, toneConfig = null) {
  const kickoffStr = formatDateTimeBR(bet.kickoffTime) || 'N/A';

  const typeLabel = type === 'repost' ? '🔄' : '🆕';
  const oddLabel = toneConfig?.oddLabel || 'Odd';

  return [
    `${typeLabel} *${bet.homeTeamName} x ${bet.awayTeamName}*`,
    `   🗓 ${kickoffStr}`,
    `   📊 ${bet.betMarket}`,
    `   💰 ${oddLabel}: ${bet.odds?.toFixed(2) || 'N/A'}`,
    `   🔗 ${bet.deepLink ? '✅' : '❌ SEM LINK'}`,
  ].join('\n');
}

/**
 * Get or generate the message for a bet.
 * Hierarchy: persisted generated_copy > generate via LLM and persist.
 *
 * @param {object} bet - Bet object (must include generatedCopy field)
 * @param {object|null} toneConfig - Tone configuration
 * @param {number} betIndex - Index for template cycling
 * @param {string} groupId - Group ID for persisting copy to assignment (GURU-46)
 * @returns {Promise<string>}
 */
async function getOrGenerateMessage(bet, toneConfig, betIndex, groupId) {
  // Only persist/reuse in full-message mode (LLM generates entire post).
  // Template mode uses position-dependent headers/footers that must cycle per betIndex.
  const isFullMessageMode = !!(toneConfig?.examplePost || toneConfig?.examplePosts?.length > 0);

  // 1. Use persisted copy if available (full-message mode only)
  if (isFullMessageMode && bet.generatedCopy) {
    logger.debug('[postBets] Using persisted generated_copy', { betId: bet.id });
    return bet.generatedCopy;
  }

  // 2. Generate via formatBetMessage (which already applies oddLabel + sanitize — Task 6)
  const template = getTemplate(toneConfig, betIndex);
  const message = await formatBetMessage(bet, template, toneConfig, betIndex);

  // 3. Persist only full-message mode (fire-and-forget, catch to avoid unhandled rejection)
  // GURU-46: persist to bet_group_assignments via groupId
  if (isFullMessageMode) {
    updateGeneratedCopy(bet.id, message, groupId).catch(err => {
      logger.warn('[postBets] Failed to persist generated_copy', { betId: bet.id, error: err.message });
    });
  }

  return message;
}

/**
 * Generate preview message for confirmation
 * @param {array} ativas - Active bets to repost
 * @param {array} novas - New bets to post
 * @returns {string}
 */
function generatePreviewMessage(ativas, novas) {
  const parts = ['📋 *PREVIEW DA POSTAGEM*\n'];

  const allBets = [
    ...ativas.map(b => ({ ...b, type: 'repost' })),
    ...novas.map(b => ({ ...b, type: 'new' })),
  ];

  if (allBets.length > 0) {
    for (const bet of allBets) {
      parts.push(formatBetPreview(bet, bet.type));
      parts.push('');
    }
  } else {
    parts.push('_Nenhuma aposta para postar._');
  }

  parts.push(`⏱ *Auto-postagem em 15 minutos se não houver resposta*`);

  return parts.join('\n');
}

/**
 * Request confirmation from admin before posting
 * @param {array} ativas - Active bets
 * @param {array} novas - New bets
 * @param {string} period - Period name
 * @returns {Promise<{confirmed: boolean, autoPosted: boolean}>}
 */
async function requestConfirmation(ativas, novas, period, botCtx = null) {
  const confirmationId = `postbets_${Date.now()}`;
  const preview = generatePreviewMessage(ativas, novas);

  const bot = getBot();
  const effectiveBotCtx = botCtx || getDefaultBotCtx();
  const adminGroupId = effectiveBotCtx?.adminGroupId;

  // Send confirmation request to admin group
  const sendResult = await bot.sendMessage(
    adminGroupId,
    preview,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirmar', callback_data: `postbets_confirm:${confirmationId}` },
            { text: '❌ Cancelar', callback_data: `postbets_cancel:${confirmationId}` },
          ],
        ],
      },
    }
  );

  if (!sendResult || !sendResult.message_id) {
    logger.error('Failed to send confirmation request', { groupId: getLogGroupId() });
    // If we can't ask for confirmation, proceed with posting
    return { confirmed: true, autoPosted: true };
  }

  const messageId = sendResult.message_id;

  // Create a promise that resolves when user responds or timeout
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      // Auto-post after timeout
      pendingConfirmations.delete(confirmationId);
      logger.info('Post confirmation auto-approved (timeout)', { confirmationId, groupId: getLogGroupId() });

      // Update message to show it was auto-posted
      bot.editMessageText(
        `${preview}\n\n✅ *Auto-postado* (sem resposta em 15min)`,
        {
          chat_id: adminGroupId,
          message_id: messageId,
          parse_mode: 'Markdown',
        }
      ).catch(() => {}); // Ignore edit errors

      resolve({ confirmed: true, autoPosted: true });
    }, CONFIRMATION_TIMEOUT_MS);

    // Store confirmation data
    pendingConfirmations.set(confirmationId, {
      resolve,
      timeoutId,
      messageId,
      period,
      adminGroupId,
    });
  });
}

/**
 * Handle confirmation callback from admin
 * @param {string} action - 'confirm' or 'cancel'
 * @param {string} confirmationId - Confirmation ID
 * @param {object} callbackQuery - Telegram callback query
 * @returns {Promise<boolean>} - true if handled
 */
async function handlePostConfirmation(action, confirmationId, callbackQuery) {
  const pending = pendingConfirmations.get(confirmationId);

  if (!pending) {
    logger.warn('Post confirmation not found or expired', { confirmationId, groupId: getLogGroupId() });
    return false;
  }

  // Clear timeout
  clearTimeout(pending.timeoutId);
  pendingConfirmations.delete(confirmationId);

  const bot = getBot();
  const user = callbackQuery.from;
  const adminGroupId = pending.adminGroupId || callbackQuery.message?.chat?.id;

  if (action === 'confirm') {
    logger.info('Post confirmed by admin', { confirmationId, userId: user.id, username: user.username, groupId: getLogGroupId() });

    // Update message
    await bot.editMessageText(
      `✅ *Postagem confirmada* por @${user.username || user.first_name}`,
      {
        chat_id: adminGroupId,
        message_id: pending.messageId,
        parse_mode: 'Markdown',
      }
    ).catch(() => {});

    pending.resolve({ confirmed: true, autoPosted: false });
  } else {
    logger.info('Post cancelled by admin', { confirmationId, userId: user.id, username: user.username, groupId: getLogGroupId() });

    // Update message
    await bot.editMessageText(
      `❌ *Postagem cancelada* por @${user.username || user.first_name}`,
      {
        chat_id: adminGroupId,
        message_id: pending.messageId,
        parse_mode: 'Markdown',
      }
    ).catch(() => {});

    pending.resolve({ confirmed: false, autoPosted: false });
  }

  // Answer callback to remove loading state
  await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  return true;
}

/**
 * Validate bet before posting (Story 3.4, Story 13.5: AC6)
 * Story 13.5: Apostas com promovida_manual=true ignoram filtro de odds mínimas
 * @param {object} bet - Bet object
 * @returns {object} - { valid: boolean, reason?: string }
 */
function validateBetForPosting(bet) {
  // Must have deep link
  if (!bet.deepLink) {
    return { valid: false, reason: 'No deep link' };
  }

  // Must have valid odds (AC6: skip check if promovida_manual=true)
  if (!bet.promovidaManual && (!bet.odds || bet.odds < config.betting.minOdds)) {
    return { valid: false, reason: `Odds below minimum (${bet.odds} < ${config.betting.minOdds})` };
  }

  // Kickoff must be in the future
  if (new Date(bet.kickoffTime) <= new Date()) {
    return { valid: false, reason: 'Match already started' };
  }

  return { valid: true };
}

/**
 * Send a message to all channels configured for the group.
 * Sends in parallel and returns per-channel results.
 * A message is considered "sent" if at least one channel succeeds.
 *
 * @param {string} groupId - Group UUID
 * @param {string} message - Message text (Telegram Markdown format)
 * @param {object} botCtx - Bot context with channels and whatsappGroupJid
 * @returns {Promise<{success: boolean, results: object, messageId?: number|string}>}
 */
async function postToAllChannels(groupId, message, botCtx) {
  const channels = botCtx?.channels || ['telegram'];
  const promises = [];
  const channelNames = [];

  if (channels.includes('telegram')) {
    channelNames.push('telegram');
    promises.push(sendToPublic(message, botCtx));
  }

  if (channels.includes('whatsapp') && botCtx?.whatsappGroupJid) {
    channelNames.push('whatsapp');
    promises.push(
      channelSendMessage(groupId, message, {
        channel: 'whatsapp',
        groupJid: botCtx.whatsappGroupJid,
      })
    );
  }

  const settled = await Promise.allSettled(promises);
  const results = {};

  for (let i = 0; i < channelNames.length; i++) {
    const name = channelNames[i];
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results[name] = outcome.value;
    } else {
      results[name] = { success: false, error: { code: 'CHANNEL_ERROR', message: outcome.reason?.message || 'Unknown error' } };
    }
  }

  // At least one channel succeeded = overall success
  const anySuccess = Object.values(results).some((r) => r.success);
  // Use Telegram messageId for backwards compatibility (used by markBetAsPosted)
  const telegramMessageId = results.telegram?.success ? results.telegram.data?.messageId : null;

  return {
    success: anySuccess,
    results,
    data: { messageId: telegramMessageId },
    error: anySuccess ? null : { code: 'ALL_CHANNELS_FAILED', message: 'Posting failed on all channels' },
  };
}

/**
 * Main job - Usa getFilaStatus() como fonte única de verdade
 * Garante que /postar posta EXATAMENTE o que /fila mostra
 * @param {boolean} skipConfirmation - Skip confirmation (for manual /postar command)
 */
async function runPostBets(skipConfirmation = false, options = {}) {
  const { botCtx = null, currentPostTime = null, allowedBetIds = null, previewId = null } = options;
  const period = getPeriod();
  const now = new Date().toISOString();
  const groupId = botCtx?.groupId || config.membership.groupId;

  // Load toneConfig + enabled_modules: ALWAYS from DB to ensure latest settings are used
  let toneConfig = null;
  if (groupId) {
    const { data: groupData, error: toneError } = await supabase
      .from('groups')
      .select('copy_tone_config, enabled_modules')
      .eq('id', groupId)
      .single();
    if (toneError) {
      logger.warn('[postBets] Failed to load toneConfig from DB', { groupId, error: toneError.message });
    } else {
      // Check if posting module is enabled for this group
      // Default to all modules if null/undefined (backward compat for groups created before migration)
      const modules = groupData?.enabled_modules || ['analytics', 'distribution', 'posting', 'members', 'tone'];
      if (!modules.includes('posting')) {
        logger.info('[postBets] Posting module disabled for group, skipping', { groupId, enabled_modules: modules });
        return { reposted: 0, posted: 0, skipped: 0, sendFailed: 0, totalSent: 0, cancelled: false };
      }
      if (groupData?.copy_tone_config) {
        toneConfig = groupData.copy_tone_config;
        logger.debug('[postBets] Loaded toneConfig from DB', { groupId });
      }
    }
  }

  // Load preview messages if previewId is provided (preview-first posting)
  let previewMessages = null;
  if (previewId) {
    const { data: previewData, error: previewError } = await supabase
      .from('post_previews')
      .select('bets, status')
      .eq('preview_id', previewId)
      .single();
    if (!previewError && previewData?.bets && previewData.status === 'draft') {
      previewMessages = new Map();
      for (const item of previewData.bets) {
        // Coerce betId to number to match bet.id from DB (JSONB may store as string or number)
        const key = typeof item.betId === 'string' ? Number(item.betId) : item.betId;
        previewMessages.set(key, item.preview);
      }
      logger.info('[postBets] Loaded preview messages', {
        groupId, previewId, count: previewMessages.size,
      });
    } else {
      logger.warn('[postBets] Preview not found or expired, falling back to LLM', {
        groupId, previewId, error: previewError?.message,
      });
    }
  }

  logger.info('[postBets] Starting post bets job', { period, timestamp: now, skipConfirmation, groupId: groupId || 'single-tenant', currentPostTime, allowedBetIds: allowedBetIds ? allowedBetIds.length : 'all', previewId, hasToneConfig: !!toneConfig });

  // Step 1: Usar getFilaStatus() - MESMA lógica do /fila
  // Story 5.1/5.5: passar groupId e horários dinâmicos quando disponíveis
  const postTimes = await loadPostingTimesForGroup(groupId);
  const isManualPost = !!allowedBetIds;
  const filaResult = await getFilaStatus(groupId, postTimes, { skipMaxDaysFilter: isManualPost });

  if (!filaResult.success) {
    logger.error('[postBets] Failed to get fila status', { groupId, error: filaResult.error?.message });

    // Warn failure (Story 14.3 AC5)
    await sendToAdmin(`⚠️ *ERRO NA POSTAGEM*\n\nFalha ao buscar fila de apostas.\nErro: ${filaResult.error?.message || 'Desconhecido'}\n\nVerifique o banco de dados.`, botCtx);

    throw new Error(`Failed to get fila status: ${filaResult.error?.message || 'Unknown'}`);
  }

  let { ativas, novas } = filaResult.data;

  // Filter by post_at when running from scheduled cron (currentPostTime is set)
  // Manual post-now (currentPostTime is null) posts everything regardless of post_at
  if (currentPostTime) {
    const beforeAtivas = ativas.length;
    const beforeNovas = novas.length;
    ativas = ativas.filter((b) => b.postAt === currentPostTime);
    novas = novas.filter((b) => b.postAt === currentPostTime);
    logger.info('[postBets] Filtered by post_at', {
      currentPostTime,
      groupId,
      ativasBefore: beforeAtivas,
      ativasAfter: ativas.length,
      novasBefore: beforeNovas,
      novasAfter: novas.length,
    });
  }

  // Filter by specific bet IDs when triggered from admin panel preview
  // allowedBetIds is set by checkPostNow() when post_now_bet_ids is stored in the group
  if (allowedBetIds) {
    const idSet = new Set(allowedBetIds);
    const beforeAtivas = ativas.length;
    const beforeNovas = novas.length;
    ativas = ativas.filter((b) => idSet.has(b.id));
    novas = novas.filter((b) => idSet.has(b.id));
    logger.info('[postBets] Filtered by allowedBetIds', {
      groupId,
      allowedCount: allowedBetIds.length,
      ativasBefore: beforeAtivas,
      ativasAfter: ativas.length,
      novasBefore: beforeNovas,
      novasAfter: novas.length,
    });
  }

  // Story 5.4 AC4/AC5: Log pending ready bets count for this group
  const readyCount = novas.filter((b) => validateBetForPosting(b).valid).length;
  logger.info('[postBets] Pending ready bets for group', { groupId, readyCount, ativas: ativas.length, novas: novas.length, total: ativas.length + novas.length });

  // If nothing to post, skip confirmation
  if (ativas.length === 0 && novas.length === 0) {
    logger.info('[postBets] No bets to post, skipping', { groupId });
    return { reposted: 0, posted: 0, skipped: 0, sendFailed: 0, totalSent: 0, cancelled: false };
  }

  // Step 2: Request confirmation (unless skipped)
  if (!skipConfirmation) {
    const confirmation = await requestConfirmation(ativas, novas, period, botCtx);

    if (!confirmation.confirmed) {
      logger.info('[postBets] Post bets cancelled by admin', { groupId });
      return { reposted: 0, posted: 0, skipped: 0, sendFailed: 0, totalSent: 0, cancelled: true };
    }

    if (confirmation.autoPosted) {
      logger.info('[postBets] Post bets auto-confirmed after timeout', { groupId });
    }
  }

  let reposted = 0;
  let repostFailed = 0;
  let posted = 0;
  let skipped = 0;
  let sendFailed = 0; // Story 1.1: Track Telegram send failures separately from validation skips

  // Story 14.3: Array para coletar apostas postadas para o warn
  const postedBetsArray = [];

  // Step 3: Repostar apostas ATIVAS (já postadas, continuam na fila)
  let betIndex = 0;
  if (ativas.length > 0) {
    logger.info('[postBets] Reposting active bets', {
      groupId,
      count: ativas.length,
      bets: ativas.map(b => ({ id: b.id, match: `${b.homeTeamName} x ${b.awayTeamName}` }))
    });

    for (const bet of ativas) {
      // Validate before posting
      const validation = validateBetForPosting(bet);
      if (!validation.valid) {
        logger.warn('[postBets] Active bet failed validation', { betId: bet.id, groupId, reason: validation.reason });
        repostFailed++;
        continue;
      }

      // Use preview message if available, otherwise use persisted/generated copy
      let message;
      if (previewMessages?.has(bet.id)) {
        message = previewMessages.get(bet.id);
        logger.debug('[postBets] Using preview message for active bet', { betId: bet.id, groupId });
      } else {
        message = await getOrGenerateMessage(bet, toneConfig, betIndex, groupId);
      }

      const sendResult = await postToAllChannels(groupId, message, botCtx);

      if (sendResult.success) {
        // Registrar repost no histórico (não muda status, já é posted)
        // GURU-46: pass groupId to update assignment's historico_postagens
        await registrarPostagem(bet.id, groupId);
        reposted++;
        logger.info('[postBets] Bet reposted successfully', { betId: bet.id, groupId, postedAt: new Date().toISOString(), channels: sendResult.results });

        // Story 14.3: Coletar dados para warn
        postedBetsArray.push({
          id: bet.id,
          homeTeamName: bet.homeTeamName,
          awayTeamName: bet.awayTeamName,
          betMarket: bet.betMarket,
          odds: bet.odds,
          type: 'repost',
        });
      } else {
        logger.error('[postBets] Failed to repost bet', { betId: bet.id, groupId, channels: sendResult.results });
        repostFailed++;
        sendFailed++;
      }
      betIndex++;
    }
  }

  // Step 4: Postar NOVAS apostas (preenchendo slots disponíveis)
  if (novas.length > 0) {
    logger.info('[postBets] Posting new bets', {
      groupId,
      count: novas.length,
      bets: novas.map(b => ({ id: b.id, match: `${b.homeTeamName} x ${b.awayTeamName}` }))
    });

    for (const bet of novas) {
      // Validate before posting
      const validation = validateBetForPosting(bet);
      if (!validation.valid) {
        logger.warn('[postBets] New bet failed validation', { betId: bet.id, groupId, reason: validation.reason });
        skipped++;
        continue;
      }

      // Use preview message if available, otherwise use persisted/generated copy
      let message;
      if (previewMessages?.has(bet.id)) {
        message = previewMessages.get(bet.id);
        logger.debug('[postBets] Using preview message for new bet', { betId: bet.id, groupId });
      } else {
        message = await getOrGenerateMessage(bet, toneConfig, betIndex, groupId);
      }

      const sendResult = await postToAllChannels(groupId, message, botCtx);

      if (sendResult.success) {
        // GURU-46: Mark assignment as posted (pass groupId)
        await markBetAsPosted(bet.id, sendResult.data.messageId, bet.odds, groupId);
        // Registrar postagem no histórico (GURU-46: pass groupId)
        await registrarPostagem(bet.id, groupId);
        posted++;
        logger.info('[postBets] Bet posted successfully', { betId: bet.id, groupId, postedAt: new Date().toISOString(), channels: sendResult.results });

        // Story 14.3: Coletar dados para warn
        postedBetsArray.push({
          id: bet.id,
          homeTeamName: bet.homeTeamName,
          awayTeamName: bet.awayTeamName,
          betMarket: bet.betMarket,
          odds: bet.odds,
          type: 'new',
        });
      } else {
        logger.error('[postBets] Failed to post new bet', { betId: bet.id, groupId, channels: sendResult.results });
        skipped++;
        sendFailed++;
      }
      betIndex++;
    }
  }

  logger.info('[postBets] Post bets job complete', {
    groupId,
    reposted,
    repostFailed,
    newPosted: posted,
    newSkipped: skipped,
    sendFailed,
    totalSent: reposted + posted
  });

  // Mark preview as confirmed after successful posting
  if (previewId && (reposted + posted) > 0) {
    const { error: confirmError } = await supabase
      .from('post_previews')
      .update({ status: 'confirmed' })
      .eq('preview_id', previewId);
    if (confirmError) {
      logger.warn('[postBets] Failed to mark preview as confirmed', { previewId, error: confirmError.message });
    } else {
      logger.info('[postBets] Preview marked as confirmed', { previewId, groupId });
    }
  }

  // Step 5: Enviar warn para grupo admin (Story 14.3)
  try {
    // Buscar apostas dos próximos 2 dias
    const upcomingResult = await getAvailableBets();
    const upcomingBets = upcomingResult.success ? upcomingResult.data : [];

    // Identificar pendências
    const pendingActions = [];
    for (const bet of upcomingBets) {
      if (!bet.deepLink) {
        pendingActions.push(`#${bet.id} precisa de link → /link ${bet.id} URL`);
      }
      if (!bet.odds || bet.odds < config.betting.minOdds) {
        pendingActions.push(`#${bet.id} sem odds adequadas → /atualizar`);
      }
    }

    await sendPostWarn(period, postedBetsArray, upcomingBets, pendingActions, botCtx);
    logger.info('[postBets] Post warn sent successfully', { groupId });
  } catch (warnErr) {
    // Warn failure should not fail the job
    logger.warn('[postBets] Failed to send post warn', { groupId, error: warnErr.message });
  }

  const result = {
    reposted,
    repostFailed,
    posted,
    skipped,
    sendFailed,
    totalSent: reposted + posted,
    cancelled: false
  };

  // Surface real posting failures to withExecutionLogging (Story 1.1: AC#2)
  // Only throw when all channel sends failed — validation skips are not posting failures
  if (sendFailed > 0 && result.totalSent === 0) {
    const err = new Error(
      `Post bets failed: ${sendFailed} send failures across all channels, 0 sent successfully`
    );
    err.jobResult = result;
    throw err;
  }

  return result;
}

// Run if called directly
if (require.main === module) {
  runPostBets()
    .then(result => {
      console.log('✅ Post bets complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Post bets failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runPostBets, formatBetMessage, formatBetPreview, validateBetForPosting, handlePostConfirmation, hasPendingConfirmation, getPendingConfirmationInfo, cancelAllPendingConfirmations, getRandomTemplate, getTemplate, getOrGenerateMessage };

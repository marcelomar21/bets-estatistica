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
const { sendToPublic, sendToAdmin, getBot } = require('../telegram');
const { getFilaStatus, markBetAsPosted, registrarPostagem, getAvailableBets } = require('../services/betService');
const { generateBetCopy } = require('../services/copyService');
const { sendPostWarn } = require('./jobWarn');

// Store pending confirmations (in-memory)
const pendingConfirmations = new Map();

// Confirmation timeout in ms (15 minutes)
const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;

function getLogGroupId() {
  return config.membership.groupId || 'single-tenant';
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
 * Get random template
 */
function getRandomTemplate() {
  const index = Math.floor(Math.random() * MESSAGE_TEMPLATES.length);
  return MESSAGE_TEMPLATES[index];
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
async function formatBetMessage(bet, template) {
  const kickoffDate = new Date(bet.kickoffTime);
  const kickoffStr = kickoffDate.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Build message parts
  const parts = [
    template.header,
    '',
    `⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*`,
    `🗓 ${kickoffStr}`,
    '',
    `📊 ${bet.betMarket}`,
    `💰 Odd: ${bet.odds?.toFixed(2) || 'N/A'}`,
  ];

  // Extrair dados do reasoning em bullets via LLM
  if (bet.reasoning) {
    try {
      const copyResult = await generateBetCopy(bet);
      if (copyResult.success && copyResult.data?.copy) {
        parts.push('');
        parts.push(copyResult.data.copy);
        logger.debug('Using extracted data bullets', { betId: bet.id, groupId: getLogGroupId() });
      } else {
        // Fallback: usar reasoning direto (truncado)
        const truncated = bet.reasoning.length > 200
          ? bet.reasoning.substring(0, 197) + '...'
          : bet.reasoning;
        parts.push('');
        parts.push(`_${truncated}_`);
      }
    } catch (err) {
      logger.warn('Failed to extract data bullets', { betId: bet.id, groupId: getLogGroupId(), error: err.message });
      const truncated = bet.reasoning.length > 200
        ? bet.reasoning.substring(0, 197) + '...'
        : bet.reasoning;
      parts.push('');
      parts.push(`_${truncated}_`);
    }
  }

  // Add deep link
  if (bet.deepLink) {
    parts.push('');
    parts.push(`🔗 [Apostar Agora](${bet.deepLink})`);
  }

  parts.push('');
  parts.push(template.footer);

  return parts.join('\n');
}

/**
 * Format bet preview (simpler version without LLM copy)
 * @param {object} bet - Bet object
 * @param {string} type - 'repost' or 'new'
 * @returns {string}
 */
function formatBetPreview(bet, type) {
  const kickoffDate = new Date(bet.kickoffTime);
  const kickoffStr = kickoffDate.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const typeLabel = type === 'repost' ? '🔄' : '🆕';

  return [
    `${typeLabel} *${bet.homeTeamName} x ${bet.awayTeamName}*`,
    `   🗓 ${kickoffStr}`,
    `   📊 ${bet.betMarket}`,
    `   💰 Odd: ${bet.odds?.toFixed(2) || 'N/A'}`,
    `   🔗 ${bet.deepLink ? '✅' : '❌ SEM LINK'}`,
  ].join('\n');
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
async function requestConfirmation(ativas, novas, period) {
  const confirmationId = `postbets_${Date.now()}`;
  const preview = generatePreviewMessage(ativas, novas);

  const bot = getBot();

  // Send confirmation request to admin group
  const sendResult = await bot.sendMessage(
    config.telegram.adminGroupId,
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
          chat_id: config.telegram.adminGroupId,
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

  if (action === 'confirm') {
    logger.info('Post confirmed by admin', { confirmationId, userId: user.id, username: user.username, groupId: getLogGroupId() });

    // Update message
    await bot.editMessageText(
      `✅ *Postagem confirmada* por @${user.username || user.first_name}`,
      {
        chat_id: config.telegram.adminGroupId,
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
        chat_id: config.telegram.adminGroupId,
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
 * Main job - Usa getFilaStatus() como fonte única de verdade
 * Garante que /postar posta EXATAMENTE o que /fila mostra
 * @param {boolean} skipConfirmation - Skip confirmation (for manual /postar command)
 */
async function runPostBets(skipConfirmation = false) {
  const period = getPeriod();
  const now = new Date().toISOString();
  const groupId = config.membership.groupId;
  logger.info('[postBets] Starting post bets job', { period, timestamp: now, skipConfirmation, groupId: groupId || 'single-tenant' });

  // Step 1: Usar getFilaStatus() - MESMA lógica do /fila
  // Story 5.1: passar groupId explicitamente quando disponível
  const filaResult = await getFilaStatus(groupId);

  if (!filaResult.success) {
    logger.error('[postBets] Failed to get fila status', { groupId, error: filaResult.error?.message });

    // Warn failure (Story 14.3 AC5)
    await sendToAdmin(`⚠️ *ERRO NA POSTAGEM*\n\nFalha ao buscar fila de apostas.\nErro: ${filaResult.error?.message || 'Desconhecido'}\n\nVerifique o banco de dados.`);

    return { reposted: 0, posted: 0, skipped: 0, totalSent: 0, cancelled: false };
  }

  const { ativas, novas } = filaResult.data;

  // Story 5.4 AC4/AC5: Log pending ready bets count for this group
  const readyCount = novas.filter((b) => validateBetForPosting(b).valid).length;
  logger.info('[postBets] Pending ready bets for group', { groupId, readyCount, ativas: ativas.length, novas: novas.length, total: ativas.length + novas.length });

  // If nothing to post, skip confirmation
  if (ativas.length === 0 && novas.length === 0) {
    logger.info('[postBets] No bets to post, skipping', { groupId });
    return { reposted: 0, posted: 0, skipped: 0, totalSent: 0, cancelled: false };
  }

  // Step 2: Request confirmation (unless skipped)
  if (!skipConfirmation) {
    const confirmation = await requestConfirmation(ativas, novas, period);

    if (!confirmation.confirmed) {
      logger.info('[postBets] Post bets cancelled by admin', { groupId });
      return { reposted: 0, posted: 0, skipped: 0, totalSent: 0, cancelled: true };
    }

    if (confirmation.autoPosted) {
      logger.info('[postBets] Post bets auto-confirmed after timeout', { groupId });
    }
  }

  let reposted = 0;
  let repostFailed = 0;
  let posted = 0;
  let skipped = 0;

  // Story 14.3: Array para coletar apostas postadas para o warn
  const postedBetsArray = [];

  // Step 3: Repostar apostas ATIVAS (já postadas, continuam na fila)
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

      // Format and send message
      const template = getRandomTemplate();
      const message = await formatBetMessage(bet, template);

      const sendResult = await sendToPublic(message);

      if (sendResult.success) {
        // Registrar repost no histórico (não muda status, já é posted)
        await registrarPostagem(bet.id);
        reposted++;
        logger.info('[postBets] Bet reposted successfully', { betId: bet.id, groupId, postedAt: new Date().toISOString(), telegramMessageId: sendResult.data.messageId });

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
        logger.error('[postBets] Failed to repost bet', { betId: bet.id, groupId, error: sendResult.error?.message });
        repostFailed++;
      }
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

      // Format and send message
      const template = getRandomTemplate();
      const message = await formatBetMessage(bet, template);

      const sendResult = await sendToPublic(message);

      if (sendResult.success) {
        // Mark as posted (updates status and timestamp)
        await markBetAsPosted(bet.id, sendResult.data.messageId, bet.odds);
        // Registrar postagem no histórico
        await registrarPostagem(bet.id);
        posted++;
        logger.info('[postBets] Bet posted successfully', { betId: bet.id, groupId, postedAt: new Date().toISOString(), telegramMessageId: sendResult.data.messageId });

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
        logger.error('[postBets] Failed to post new bet', { betId: bet.id, groupId, error: sendResult.error?.message });
        skipped++;
      }
    }
  }

  logger.info('[postBets] Post bets job complete', {
    groupId,
    reposted,
    repostFailed,
    newPosted: posted,
    newSkipped: skipped,
    totalSent: reposted + posted
  });

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

    await sendPostWarn(period, postedBetsArray, upcomingBets, pendingActions);
    logger.info('[postBets] Post warn sent successfully', { groupId });
  } catch (warnErr) {
    // Warn failure should not fail the job
    logger.warn('[postBets] Failed to send post warn', { groupId, error: warnErr.message });
  }

  return {
    reposted,
    repostFailed,
    posted,
    skipped,
    totalSent: reposted + posted,
    cancelled: false
  };
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

module.exports = { runPostBets, formatBetMessage, validateBetForPosting, handlePostConfirmation, hasPendingConfirmation, getPendingConfirmationInfo, cancelAllPendingConfirmations };

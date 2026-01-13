/**
 * Job: Post bets to public Telegram group
 *
 * Stories covered:
 * - 3.1: Criar job postagem pública
 * - 3.2: Formatar mensagem aposta
 * - 3.3: Incluir deep link na mensagem
 * - 3.4: Validar requisitos antes de postar
 * - 10.1: Copy dinâmico com LLM
 *
 * Run: node bot/jobs/postBets.js [morning|afternoon|night]
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { sendToPublic } = require('../telegram');
const { getFilaStatus, markBetAsPosted, registrarPostagem } = require('../services/betService');
const { getSuccessRate } = require('../services/metricsService');
const { generateBetCopy } = require('../services/copyService');

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
  
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

/**
 * Format bet message for Telegram (Story 10.1: LLM copy)
 * @param {object} bet - Bet object
 * @param {object} template - Message template
 * @param {number} successRate - Historical success rate
 * @returns {Promise<string>}
 */
async function formatBetMessage(bet, template, successRate) {
  const kickoffDate = new Date(bet.kickoffTime);
  const kickoffStr = kickoffDate.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Generate engaging copy with LLM (Story 10.1)
  let copyText = bet.reasoning; // Fallback to original reasoning
  try {
    const copyResult = await generateBetCopy(bet);
    if (copyResult.success && copyResult.data?.copy) {
      copyText = copyResult.data.copy;
      logger.debug('Using LLM-generated copy', {
        betId: bet.id,
        fromCache: copyResult.data.fromCache
      });
    }
  } catch (err) {
    logger.warn('Failed to generate LLM copy, using fallback', {
      betId: bet.id,
      error: err.message
    });
  }

  // Build message parts
  const parts = [
    template.header,
    '',
    `⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*`,
    `🗓 ${kickoffStr}`,
    '',
    `📊 *${bet.betMarket}*: ${bet.betPick}`,
    `💰 Odd: *${bet.odds?.toFixed(2) || 'N/A'}*`,
    '',
    `📝 _${copyText}_`,
  ];

  // Add success rate if available (Story 3.7)
  if (successRate !== null && successRate >= 0) {
    parts.push('');
    parts.push(`📈 Taxa de acerto: *${successRate.toFixed(0)}%*`);
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
 */
async function runPostBets() {
  const period = getPeriod();
  const now = new Date().toISOString();
  logger.info('Starting post bets job', { period, timestamp: now });

  // Step 1: Get success rate for messages
  let successRate = null;
  try {
    const metricsResult = await getSuccessRate();
    if (metricsResult.success) {
      successRate = metricsResult.data.rate30Days;
    }
  } catch (err) {
    logger.warn('Could not get success rate', { error: err.message });
  }

  // Step 2: Usar getFilaStatus() - MESMA lógica do /fila
  const filaResult = await getFilaStatus();

  if (!filaResult.success) {
    logger.error('Failed to get fila status', { error: filaResult.error?.message });
    return { reposted: 0, posted: 0, skipped: 0, totalSent: 0 };
  }

  const { ativas, novas } = filaResult.data;

  logger.info('Fila status', {
    ativas: ativas.length,
    novas: novas.length,
    total: ativas.length + novas.length
  });

  let reposted = 0;
  let repostFailed = 0;
  let posted = 0;
  let skipped = 0;

  // Step 3: Repostar apostas ATIVAS (já postadas, continuam na fila)
  if (ativas.length > 0) {
    logger.info('Reposting active bets', {
      count: ativas.length,
      bets: ativas.map(b => ({ id: b.id, match: `${b.homeTeamName} x ${b.awayTeamName}` }))
    });

    for (const bet of ativas) {
      // Validate before posting
      const validation = validateBetForPosting(bet);
      if (!validation.valid) {
        logger.warn('Active bet failed validation', { betId: bet.id, reason: validation.reason });
        repostFailed++;
        continue;
      }

      // Format and send message
      const template = getRandomTemplate();
      const message = await formatBetMessage(bet, template, successRate);

      const sendResult = await sendToPublic(message);

      if (sendResult.success) {
        // Registrar repost no histórico (não muda status, já é posted)
        await registrarPostagem(bet.id);
        reposted++;
        logger.info('Bet reposted successfully', { betId: bet.id, messageId: sendResult.data.messageId });
      } else {
        logger.error('Failed to repost bet', { betId: bet.id, error: sendResult.error?.message });
        repostFailed++;
      }
    }
  }

  // Step 4: Postar NOVAS apostas (preenchendo slots disponíveis)
  if (novas.length > 0) {
    logger.info('Posting new bets', {
      count: novas.length,
      bets: novas.map(b => ({ id: b.id, match: `${b.homeTeamName} x ${b.awayTeamName}` }))
    });

    for (const bet of novas) {
      // Validate before posting
      const validation = validateBetForPosting(bet);
      if (!validation.valid) {
        logger.warn('New bet failed validation', { betId: bet.id, reason: validation.reason });
        skipped++;
        continue;
      }

      // Format and send message
      const template = getRandomTemplate();
      const message = await formatBetMessage(bet, template, successRate);

      const sendResult = await sendToPublic(message);

      if (sendResult.success) {
        // Mark as posted (updates status and timestamp)
        await markBetAsPosted(bet.id, sendResult.data.messageId, bet.odds);
        // Registrar postagem no histórico
        await registrarPostagem(bet.id);
        posted++;
        logger.info('New bet posted successfully', { betId: bet.id, messageId: sendResult.data.messageId });
      } else {
        logger.error('Failed to post new bet', { betId: bet.id, error: sendResult.error?.message });
        skipped++;
      }
    }
  }

  logger.info('Post bets job complete', {
    reposted,
    repostFailed,
    newPosted: posted,
    newSkipped: skipped,
    totalSent: reposted + posted
  });

  return {
    reposted,
    repostFailed,
    posted,
    skipped,
    totalSent: reposted + posted
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

module.exports = { runPostBets, formatBetMessage, validateBetForPosting };

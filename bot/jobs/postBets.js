/**
 * Job: Post bets to public Telegram group
 * 
 * Stories covered:
 * - 3.1: Criar job postagem pública
 * - 3.2: Formatar mensagem aposta
 * - 3.3: Incluir deep link na mensagem
 * - 3.4: Validar requisitos antes de postar
 * 
 * Run: node bot/jobs/postBets.js [morning|afternoon|night]
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { sendToPublic } = require('../telegram');
const { getBetsReadyForPosting, markBetAsPosted, getActivePostedBets } = require('../services/betService');
const { getSuccessRate } = require('../services/metricsService');

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
 * Format bet message for Telegram
 * @param {object} bet - Bet object
 * @param {object} template - Message template
 * @param {number} successRate - Historical success rate
 * @returns {string}
 */
function formatBetMessage(bet, template, successRate) {
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
    `📊 *${bet.betMarket}*: ${bet.betPick}`,
    `💰 Odd: *${bet.odds?.toFixed(2) || 'N/A'}*`,
    '',
    `📝 _${bet.reasoning}_`,
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
 * Validate bet before posting (Story 3.4)
 * @param {object} bet - Bet object
 * @returns {object} - { valid: boolean, reason?: string }
 */
function validateBetForPosting(bet) {
  // Must have deep link
  if (!bet.deepLink) {
    return { valid: false, reason: 'No deep link' };
  }

  // Must have valid odds
  if (!bet.odds || bet.odds < config.betting.minOdds) {
    return { valid: false, reason: `Odds below minimum (${bet.odds} < ${config.betting.minOdds})` };
  }

  // Kickoff must be in the future
  if (new Date(bet.kickoffTime) <= new Date()) {
    return { valid: false, reason: 'Match already started' };
  }

  return { valid: true };
}

/**
 * Calculate how many more bets we can post
 */
async function calculatePostingSlots() {
  const activeResult = await getActivePostedBets();
  const activeBets = activeResult.success ? activeResult.data : [];
  
  // Only count bets where match hasn't finished yet
  const stillActive = activeBets.filter(bet => {
    const matchStatus = bet.matchStatus?.toLowerCase();
    return !matchStatus || !['complete', 'finished', 'ft'].includes(matchStatus);
  });
  
  const available = Math.max(0, config.betting.maxActiveBets - stillActive.length);
  
  logger.info('Posting slots available', {
    totalActive: activeBets.length,
    stillActive: stillActive.length,
    available,
  });
  
  return available;
}

/**
 * Main job
 */
async function runPostBets() {
  const period = getPeriod();
  logger.info('Starting post bets job', { period });

  // Step 1: Calculate available slots
  const availableSlots = await calculatePostingSlots();
  
  if (availableSlots === 0) {
    logger.info('No posting slots available');
    return { posted: 0, skipped: 0 };
  }

  // Step 2: Get bets ready for posting
  const result = await getBetsReadyForPosting();
  
  if (!result.success || result.data.length === 0) {
    logger.info('No bets ready for posting');
    return { posted: 0, skipped: 0 };
  }

  // Step 3: Get success rate for messages
  let successRate = null;
  try {
    const metricsResult = await getSuccessRate();
    if (metricsResult.success) {
      successRate = metricsResult.data.rate30Days;
    }
  } catch (err) {
    logger.warn('Could not get success rate', { error: err.message });
  }

  // Step 4: Post bets (up to available slots)
  const betsToPost = result.data.slice(0, availableSlots);
  let posted = 0;
  let skipped = 0;

  for (const bet of betsToPost) {
    // Validate before posting
    const validation = validateBetForPosting(bet);
    if (!validation.valid) {
      logger.warn('Bet failed validation', { betId: bet.id, reason: validation.reason });
      skipped++;
      continue;
    }

    // Format and send message
    const template = getRandomTemplate();
    const message = formatBetMessage(bet, template, successRate);
    
    const sendResult = await sendToPublic(message);
    
    if (sendResult.success) {
      // Mark as posted
      await markBetAsPosted(bet.id, sendResult.data.messageId, bet.odds);
      posted++;
      logger.info('Bet posted successfully', { betId: bet.id, messageId: sendResult.data.messageId });
    } else {
      logger.error('Failed to post bet', { betId: bet.id, error: sendResult.error?.message });
      skipped++;
    }
  }

  logger.info('Post bets complete', { posted, skipped });
  return { posted, skipped };
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

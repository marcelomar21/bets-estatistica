/**
 * Job: Request links from admin group
 * 
 * Stories covered:
 * - 2.1: Criar job pedido links
 * - 2.2: Formatar pedido link
 * - 4.5: Manter 3 apostas ativas
 * 
 * Logic:
 * - If bets are ready (odds + links ok): show preview
 * - If bets need links: request from admins
 * - If need more bets: select top bets and request links
 * 
 * Run: node bot/jobs/requestLinks.js [morning|afternoon|night]
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { 
  requestLinksForTopBets, 
  getActivePostedBets, 
  getBetsPendingLinks,
  getBetsReadyForPosting,
} = require('../services/betService');
const { alertAdmin } = require('../telegram');
const { runEnrichment } = require('./enrichOdds');

const PERIOD_NAMES = {
  morning: 'MANHÃ',
  afternoon: 'TARDE',
  night: 'NOITE',
};

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
 * Format bet for preview message
 */
function formatBetPreview(bet, index) {
  const kickoff = new Date(bet.kickoffTime).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${index}️⃣ *${bet.homeTeamName} vs ${bet.awayTeamName}*
   📅 ${kickoff}
   📊 ${bet.betMarket}
   💰 Odds: ${bet.odds?.toFixed(2) || 'N/A'}
   🔗 Link: ${bet.deepLink ? '✅' : '❌'}`;
}

/**
 * Send preview of ready bets to admin group
 */
async function sendPreview(readyBets, period) {
  const periodName = PERIOD_NAMES[period] || period.toUpperCase();
  
  let message = `👁️ *PRÉVIA - ${periodName}*\n\n`;
  message += `Apostas prontas para publicação:\n\n`;

  readyBets.forEach((bet, i) => {
    message += formatBetPreview(bet, i + 1);
    message += '\n\n';
  });

  message += `_Serão publicadas no horário programado._\n`;
  message += `_Para alterar, responda antes da publicação._`;

  await alertAdmin('INFO', 'Prévia de Apostas', message);
  logger.info('Sent preview to admin group', { count: readyBets.length });
}

/**
 * Send link request to admin group
 */
async function sendLinkRequest(bets, period) {
  const periodName = PERIOD_NAMES[period] || period.toUpperCase();
  
  let message = `🔗 *LINKS NECESSÁRIOS - ${periodName}*\n\n`;

  for (const bet of bets) {
    const kickoff = new Date(bet.kickoffTime).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    message += `*${bet.homeTeamName} vs ${bet.awayTeamName}*\n`;
    message += `📅 ${kickoff}\n`;
    message += `📊 ${bet.betMarket}\n`;
    message += `💰 Odds: ${bet.odds?.toFixed(2) || 'Definir com /odds'}\n`;
    message += `→ Responda: \`${bet.id}: https://...\`\n\n`;
  }

  message += `_Exemplo: \`${bets[0]?.id}: https://betano.bet.br/...\`_`;

  await alertAdmin('INFO', 'Links Necessários', message);
  logger.info('Sent link request to admin group', { count: bets.length });
}

/**
 * Calculate bet slots status
 */
async function getBetStatus() {
  // Get ready bets (have odds + links)
  const readyResult = await getBetsReadyForPosting();
  const readyBets = readyResult.success ? readyResult.data : [];

  // Get pending link bets (have odds, need links)
  const pendingResult = await getBetsPendingLinks();
  const pendingBets = pendingResult.success ? pendingResult.data : [];

  // Get active posted bets
  const activeResult = await getActivePostedBets();
  const activeBets = activeResult.success ? activeResult.data : [];

  const totalCovered = readyBets.length + pendingBets.length + activeBets.length;
  const needed = Math.max(0, config.betting.maxActiveBets - totalCovered);

  logger.info('Bet status', {
    ready: readyBets.length,
    pending: pendingBets.length,
    active: activeBets.length,
    needed,
  });

  return { readyBets, pendingBets, activeBets, needed };
}

/**
 * Main job
 */
async function runRequestLinks(periodOverride = null) {
  const period = periodOverride || getPeriod();
  logger.info('Starting request links job', { period });

  // Step 1: Enrich existing bets with latest odds (but don't change existing links)
  await runEnrichment();

  // Step 2: Get current bet status
  const { readyBets, pendingBets, needed } = await getBetStatus();

  // Step 3: If we have ready bets, show preview
  if (readyBets.length > 0) {
    await sendPreview(readyBets, period);
  }

  // Step 4: If we have pending bets, remind about those
  if (pendingBets.length > 0) {
    await sendLinkRequest(pendingBets, period);
    return { 
      preview: readyBets.length, 
      requested: 0, 
      reminded: pendingBets.length 
    };
  }

  // Step 5: If we need more bets, select and request links
  if (needed > 0) {
    const result = await requestLinksForTopBets(needed);
    
    if (result.success && result.data.length > 0) {
      await sendLinkRequest(result.data, period);
      return { 
        preview: readyBets.length, 
        requested: result.data.length, 
        reminded: 0 
      };
    }
  }

  // Step 6: All good, nothing to do
  if (readyBets.length === 0) {
    logger.info('No bets ready and none to request');
  }

  return { 
    preview: readyBets.length, 
    requested: 0, 
    reminded: 0 
  };
}

// Run if called directly
if (require.main === module) {
  runRequestLinks()
    .then(result => {
      console.log('✅ Request links complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Request links failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runRequestLinks };

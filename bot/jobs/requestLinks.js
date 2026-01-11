/**
 * Job: Request links from admin group
 * 
 * Stories covered:
 * - 2.1: Criar job pedido links
 * - 2.2: Formatar pedido link
 * - 4.5: Manter 3 apostas ativas
 * 
 * Run: node bot/jobs/requestLinks.js [morning|afternoon|night]
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { requestLinksForTopBets, getActivePostedBets, getBetsPendingLinks } = require('../services/betService');
const { requestLinksAlert } = require('../services/alertService');
const { runEnrichment } = require('./enrichOdds');

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
 * Calculate how many new bets we need
 * Story 4.5: Manter pelo menos 3 apostas ativas
 */
async function calculateNeededBets() {
  // Get current active posted bets
  const activeResult = await getActivePostedBets();
  const activeBets = activeResult.success ? activeResult.data : [];
  
  // Get pending link bets
  const pendingResult = await getBetsPendingLinks();
  const pendingBets = pendingResult.success ? pendingResult.data : [];
  
  const totalActive = activeBets.length + pendingBets.length;
  const needed = Math.max(0, config.betting.maxActiveBets - totalActive);
  
  logger.info('Calculating needed bets', {
    activeBets: activeBets.length,
    pendingLinks: pendingBets.length,
    needed,
  });
  
  return { needed, pendingBets };
}

/**
 * Main job
 */
async function runRequestLinks() {
  const period = getPeriod();
  logger.info('Starting request links job', { period });

  // Step 1: Enrich existing bets with latest odds
  await runEnrichment();

  // Step 2: Calculate how many new bets we need
  const { needed, pendingBets } = await calculateNeededBets();
  
  // Step 3: If we already have pending bets, just remind about those
  if (pendingBets.length > 0) {
    logger.info('Reminding about pending bets', { count: pendingBets.length });
    await requestLinksAlert(pendingBets, period);
    return { requested: 0, reminded: pendingBets.length };
  }

  // Step 4: Request links for new bets if needed
  if (needed > 0) {
    const result = await requestLinksForTopBets(needed);
    
    if (result.success && result.data.length > 0) {
      await requestLinksAlert(result.data, period);
      logger.info('Requested links for new bets', { count: result.data.length });
      return { requested: result.data.length, reminded: 0 };
    }
  }

  logger.info('No bets need link requests');
  return { requested: 0, reminded: 0 };
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

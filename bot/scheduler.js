/**
 * Scheduler - Automatiza os jobs do bot
 * 
 * Horários de execução (São Paulo):
 * - 08:00 - Request links (para ter tempo de responder)
 * - 10:00 - Post bets (manhã)
 * - 13:00 - Request links (para tarde)
 * - 15:00 - Post bets (tarde)
 * - 20:00 - Request links (para noite)
 * - 22:00 - Post bets (noite)
 * 
 * Para usar no Render:
 *   node bot/scheduler.js
 */
require('dotenv').config();

const cron = require('node-cron');
const { runEnrichment } = require('./jobs/enrichOdds');
const { runRequestLinks } = require('./jobs/requestLinks');
const { runPostBets } = require('./jobs/postBets');
const { runResultTracking } = require('./jobs/trackResults');
const logger = require('../lib/logger');

// Timezone São Paulo
const TZ = 'America/Sao_Paulo';

/**
 * Wrapper to run job with error handling
 */
async function runJob(name, jobFn) {
  const start = Date.now();
  logger.info(`Starting scheduled job: ${name}`);
  
  try {
    const result = await jobFn();
    const duration = Date.now() - start;
    logger.info(`Job ${name} completed`, { duration: `${duration}ms`, result });
    return result;
  } catch (err) {
    logger.error(`Job ${name} failed`, { error: err.message });
    throw err;
  }
}

/**
 * Morning workflow - 08:00
 * Enrich odds and request links for the day
 */
async function morningWorkflow() {
  await runJob('enrichOdds', runEnrichment);
  await runJob('requestLinks', () => runRequestLinks('morning'));
}

/**
 * Morning post - 10:00
 */
async function morningPost() {
  await runJob('postBets', () => runPostBets('morning'));
}

/**
 * Afternoon prep - 13:00
 */
async function afternoonPrep() {
  await runJob('enrichOdds', runEnrichment);
  await runJob('requestLinks', () => runRequestLinks('afternoon'));
}

/**
 * Afternoon post - 15:00
 */
async function afternoonPost() {
  await runJob('postBets', () => runPostBets('afternoon'));
}

/**
 * Night prep - 20:00
 */
async function nightPrep() {
  await runJob('enrichOdds', runEnrichment);
  await runJob('requestLinks', () => runRequestLinks('night'));
}

/**
 * Night post - 22:00
 */
async function nightPost() {
  await runJob('postBets', () => runPostBets('night'));
}

/**
 * Track results - every 5 min after 2h of match start
 */
async function trackResults() {
  await runJob('trackResults', runResultTracking);
}

/**
 * Setup all cron jobs
 */
function setupScheduler() {
  logger.info('Setting up scheduler', { timezone: TZ });

  // Morning workflow - 08:00 São Paulo
  cron.schedule('0 8 * * *', morningWorkflow, { timezone: TZ });
  
  // Morning post - 10:00 São Paulo
  cron.schedule('0 10 * * *', morningPost, { timezone: TZ });
  
  // Afternoon prep - 13:00 São Paulo
  cron.schedule('0 13 * * *', afternoonPrep, { timezone: TZ });
  
  // Afternoon post - 15:00 São Paulo
  cron.schedule('0 15 * * *', afternoonPost, { timezone: TZ });
  
  // Night prep - 20:00 São Paulo
  cron.schedule('0 20 * * *', nightPrep, { timezone: TZ });
  
  // Night post - 22:00 São Paulo
  cron.schedule('0 22 * * *', nightPost, { timezone: TZ });
  
  // Track results - every 5 minutes
  cron.schedule('*/5 * * * *', trackResults, { timezone: TZ });

  logger.info('Scheduler started with following jobs:');
  logger.info('  08:00 - Enrich odds + Request links (morning)');
  logger.info('  10:00 - Post bets (morning)');
  logger.info('  13:00 - Enrich odds + Request links (afternoon)');
  logger.info('  15:00 - Post bets (afternoon)');
  logger.info('  20:00 - Enrich odds + Request links (night)');
  logger.info('  22:00 - Post bets (night)');
  logger.info('  */5min - Track results');
}

// Run if called directly
if (require.main === module) {
  console.log('🤖 Starting Bot Scheduler\n');
  setupScheduler();
  
  // Keep process alive
  console.log('\n✅ Scheduler is running. Press Ctrl+C to stop.\n');
}

module.exports = { setupScheduler };

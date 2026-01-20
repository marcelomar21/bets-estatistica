/**
 * Job: Check Affiliate Expiration - Clear expired affiliate attributions
 * Story 18.2: Lógica de Expiração de Atribuição
 *
 * Clears affiliate_code and affiliate_clicked_at for members whose
 * last affiliate click was more than 14 days ago.
 * Preserves affiliate_history (never deleted).
 *
 * Run: node bot/jobs/membership/check-affiliate-expiration.js
 * Schedule: 00:30 BRT daily
 */
require('dotenv').config();

const logger = require('../../../lib/logger');
const { clearExpiredAffiliates } = require('../../services/memberService');

const JOB_NAME = 'check-affiliate-expiration';

// Lock to prevent concurrent runs (in-memory, same process)
let jobRunning = false;

/**
 * Run the check-affiliate-expiration job
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function runCheckAffiliateExpiration() {
  if (jobRunning) {
    logger.warn(`[membership:${JOB_NAME}] Job already running, skipping`);
    return { success: false, error: { code: 'JOB_ALREADY_RUNNING' } };
  }

  jobRunning = true;
  const startTime = Date.now();

  try {
    logger.info(`[membership:${JOB_NAME}] Starting job`);

    const result = await clearExpiredAffiliates();

    if (!result.success) {
      logger.error(`[membership:${JOB_NAME}] Job failed`, { error: result.error });
      return result;
    }

    const duration = Date.now() - startTime;
    logger.info(`[membership:${JOB_NAME}] Job completed`, {
      duration,
      cleared: result.data.cleared,
    });

    return {
      success: true,
      data: {
        cleared: result.data.cleared,
        duration,
      },
    };
  } catch (err) {
    logger.error(`[membership:${JOB_NAME}] Unexpected error`, { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  } finally {
    jobRunning = false;
  }
}

// CLI execution
if (require.main === module) {
  runCheckAffiliateExpiration()
    .then((result) => {
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runCheckAffiliateExpiration };

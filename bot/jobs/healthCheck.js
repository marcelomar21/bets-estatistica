/**
 * Job: Health Check - Monitor system health
 *
 * Simplified version - only checks critical issues:
 * - Database connection (Supabase)
 *
 * Other checks (stuck bets, posting schedule) removed:
 * - Jobs already alert on failure via jobFailureAlert
 * - /status command shows detailed info on demand
 *
 * Run: node bot/jobs/healthCheck.js
 * Cron: every 5 minutes
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { testConnection } = require('../../lib/supabase');
const { healthCheckAlert } = require('../services/alertService');

// Thresholds
const THRESHOLDS = {
  DB_TIMEOUT_MS: 5000,
  ALERT_DEBOUNCE_MINUTES: 60,
};

// Alert debounce cache (in-memory, resets on restart)
const alertCache = new Map();

// Lock to prevent concurrent health check runs
let healthCheckRunning = false;

/**
 * Check if alert can be sent (debounce logic)
 * @param {string} alertType - Type of alert
 * @returns {boolean} - true if alert can be sent
 */
function canSendAlert(alertType) {
  const lastSent = alertCache.get(alertType);
  const now = Date.now();
  const debounceMs = THRESHOLDS.ALERT_DEBOUNCE_MINUTES * 60 * 1000;

  if (lastSent && (now - lastSent) < debounceMs) {
    return false;
  }

  alertCache.set(alertType, now);
  return true;
}

/**
 * Check database connection health
 * @returns {Promise<{success: boolean, latencyMs?: number, error?: string}>}
 */
async function checkDatabaseConnection() {
  const startTime = Date.now();

  try {
    const result = await testConnection();
    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      logger.error('[healthCheck] Database connection failed', { error: result.error?.message });
      return {
        success: false,
        latencyMs,
        error: result.error?.message || 'Connection failed'
      };
    }

    return { success: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    logger.error('[healthCheck] Database error', { error: err.message });
    return { success: false, latencyMs, error: err.message };
  }
}

/**
 * Main health check job
 * Only checks DB connection - alerts only on failure
 * @returns {Promise<{success: boolean, dbLatencyMs: number}>}
 */
async function runHealthCheck() {
  // Prevent concurrent runs
  if (healthCheckRunning) {
    logger.debug('[healthCheck] Already running, skipping');
    return { success: true, skipped: true };
  }
  healthCheckRunning = true;

  try {
    const dbResult = await checkDatabaseConnection();

    // Only alert if DB is down (with debounce)
    if (!dbResult.success && canSendAlert('Database')) {
      try {
        await healthCheckAlert([{
          severity: 'error',
          check: 'Database',
          message: dbResult.error,
          action: 'Verifique o Supabase'
        }], true);
        logger.error('[healthCheck] DB alert sent', { error: dbResult.error });
      } catch (err) {
        logger.error('[healthCheck] Failed to send alert', { error: err.message });
      }
    }

    // Silent heartbeat - just log locally, no Telegram
    logger.debug('[healthCheck] Complete', {
      dbOk: dbResult.success,
      latencyMs: dbResult.latencyMs
    });

    return {
      success: dbResult.success,
      dbLatencyMs: dbResult.latencyMs
    };
  } finally {
    healthCheckRunning = false;
  }
}

// Run if called directly
if (require.main === module) {
  runHealthCheck()
    .then(result => {
      console.log('Health check result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Health check failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  runHealthCheck,
  checkDatabaseConnection,
  canSendAlert,
  THRESHOLDS,
};

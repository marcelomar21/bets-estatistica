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
const { supabase, testConnection } = require('../../lib/supabase');
const { healthCheckAlert } = require('../services/alertService');
const { reloadConfig } = require('../lib/configHelper');

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
 * Update bot_health heartbeat for the unified bot.
 * Uses SELECT + INSERT/UPDATE pattern because the unique index uses COALESCE
 * and NULL group_id values are not matched by PostgreSQL unique constraints.
 * @param {string} status - 'online' or 'offline'
 * @param {string|null} errorMessage - error detail if offline
 */
async function updateHeartbeat(status = 'online', errorMessage = null) {
  const now = new Date().toISOString();
  const payload = {
    group_id: null,
    channel: 'telegram',
    number_id: null,
    status,
    last_heartbeat: now,
    error_message: errorMessage,
    updated_at: now,
  };

  try {
    // Check if a heartbeat row already exists for the unified bot
    const { data: existing } = await supabase
      .from('bot_health')
      .select('id')
      .is('group_id', null)
      .eq('channel', 'telegram')
      .is('number_id', null)
      .limit(1);

    let error;
    if (existing && existing.length > 0) {
      ({ error } = await supabase
        .from('bot_health')
        .update(payload)
        .eq('id', existing[0].id));
    } else {
      ({ error } = await supabase
        .from('bot_health')
        .insert(payload));
      // Handle race condition: if another process inserted first, retry as update
      if (error && error.code === '23505') {
        const { data: retryRow } = await supabase
          .from('bot_health')
          .select('id')
          .is('group_id', null)
          .eq('channel', 'telegram')
          .is('number_id', null)
          .limit(1);
        if (retryRow && retryRow.length > 0) {
          ({ error } = await supabase
            .from('bot_health')
            .update(payload)
            .eq('id', retryRow[0].id));
        }
      }
    }

    if (error) {
      logger.warn('[healthCheck] Failed to update heartbeat', { error: error.message });
    }
  } catch (err) {
    logger.warn('[healthCheck] Heartbeat error (non-blocking)', { error: err.message });
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
    // Reload config cache so feature flag changes take effect without restart
    reloadConfig();

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

    // Update bot_health heartbeat (only when DB is reachable — if DB is down,
    // stale heartbeat detection in dashboard will catch it after 30 min)
    if (dbResult.success) {
      await updateHeartbeat('online');
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
  updateHeartbeat,
  canSendAlert,
  THRESHOLDS,
};

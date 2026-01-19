/**
 * Job: Health Check - Monitor system health
 *
 * Stories covered:
 * - 9.1: Monitorar Health Check
 *
 * Checks:
 * - Database connection (Supabase)
 * - Last posting occurred on schedule
 * - No stuck bets (pending_link, ready, posted)
 *
 * Run: node bot/jobs/healthCheck.js
 * Cron: every 5 minutes
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { supabase, testConnection } = require('../../lib/supabase');
const { healthCheckAlert, postingFailureAlert } = require('../services/alertService');

// Thresholds for health checks
const THRESHOLDS = {
  DB_TIMEOUT_MS: 5000,           // Database query should complete in < 5s
  PENDING_LINK_MAX_HOURS: 8,     // Alert if bet pending_link for > 8 hours (operador tem dia inteiro)
  READY_NOT_POSTED_HOURS: 6,     // Alert if bet ready but not posted for > 6 hours (intervalo entre postagens)
  POSTED_NO_RESULT_HOURS: 6,     // Alert if posted bet has no result 6h after kickoff
  POST_SCHEDULE_GRACE_MIN: 15,   // Minutes grace period after scheduled post time
  ALERT_DEBOUNCE_MINUTES: 60,    // Don't repeat same alert type within this period
};

// Scheduled post times (São Paulo timezone)
const POST_SCHEDULE = [10]; // Apenas 10:00 (simplificado)

// Alert debounce cache (in-memory, resets on restart)
const alertCache = new Map();

// Lock to prevent concurrent health check runs
let healthCheckRunning = false;

/**
 * Check if alert can be sent (debounce logic)
 * Prevents sending the same type of alert within ALERT_DEBOUNCE_MINUTES
 * @param {string} alertType - Type of alert (e.g., 'stuck_pending_link', 'Database')
 * @returns {boolean} - true if alert can be sent
 */
function canSendAlert(alertType) {
  const lastSent = alertCache.get(alertType);
  const now = Date.now();
  const debounceMs = THRESHOLDS.ALERT_DEBOUNCE_MINUTES * 60 * 1000;

  if (lastSent && (now - lastSent) < debounceMs) {
    const minutesAgo = Math.round((now - lastSent) / 60000);
    logger.debug('Alert debounced', { alertType, lastSentAgo: `${minutesAgo}min` });
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
      logger.error('Health check: Database connection failed', { error: result.error?.message });
      return {
        success: false,
        latencyMs,
        error: result.error?.message || 'Connection failed'
      };
    }

    if (latencyMs > THRESHOLDS.DB_TIMEOUT_MS) {
      logger.warn('Health check: Database latency high', { latencyMs });
      return {
        success: true,
        latencyMs,
        warning: `High latency: ${latencyMs}ms`
      };
    }

    logger.debug('Health check: Database OK', { latencyMs });
    return { success: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    logger.error('Health check: Database error', { error: err.message });
    return { success: false, latencyMs, error: err.message };
  }
}

/**
 * Check if last posting occurred on schedule
 * Bug fix: Now considers active posted bets (reposting) as evidence of working system
 * @returns {Promise<{success: boolean, lastPost?: Date, warning?: string, error?: string, failedPeriod?: string, isPostingFailure?: boolean}>}
 */
async function checkLastPosting() {
  try {
    // First, check if there are active posted bets with kickoff in future
    // If yes, the system is working (reposting is happening)
    const now = new Date();
    const { data: activeBets, error: activeError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        telegram_posted_at,
        league_matches!inner (kickoff_time)
      `)
      .eq('bet_status', 'posted')
      .gte('league_matches.kickoff_time', now.toISOString())
      .limit(1);

    if (activeError) {
      logger.error('Health check: Failed to query active bets', { error: activeError.message });
    }

    // If there are active posted bets, system is operational
    const hasActiveBets = activeBets && activeBets.length > 0;

    // Get the most recent posted bet timestamp
    const { data, error } = await supabase
      .from('suggested_bets')
      .select('telegram_posted_at')
      .eq('bet_status', 'posted')
      .not('telegram_posted_at', 'is', null)
      .order('telegram_posted_at', { ascending: false })
      .limit(1);

    if (error) {
      logger.error('Health check: Failed to query last posting', { error: error.message });
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      logger.info('Health check: No posted bets found');
      return { success: true, warning: 'No posts yet' };
    }

    const lastPostTime = new Date(data[0].telegram_posted_at);

    // Get current hour in São Paulo timezone
    const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = spNow.getHours();
    const currentMin = spNow.getMinutes();

    // Find the most recent scheduled post time
    let expectedPostHour = null;
    for (let i = POST_SCHEDULE.length - 1; i >= 0; i--) {
      if (currentHour > POST_SCHEDULE[i] ||
          (currentHour === POST_SCHEDULE[i] && currentMin >= THRESHOLDS.POST_SCHEDULE_GRACE_MIN)) {
        expectedPostHour = POST_SCHEDULE[i];
        break;
      }
    }

    // If we haven't passed any post time today, check yesterday's last post
    if (expectedPostHour === null) {
      // Use yesterday's last scheduled post as reference
      expectedPostHour = POST_SCHEDULE[POST_SCHEDULE.length - 1];
    }

    // Calculate expected post time today
    const expectedPost = new Date(spNow);
    expectedPost.setHours(expectedPostHour, THRESHOLDS.POST_SCHEDULE_GRACE_MIN, 0, 0);

    // If expected is in the future, use yesterday
    if (expectedPost > spNow) {
      expectedPost.setDate(expectedPost.getDate() - 1);
    }

    // Check if last post is after expected time
    if (lastPostTime < expectedPost) {
      // If there are active bets being reposted, the job is running fine
      // The timestamp is old because reposting doesn't update telegram_posted_at
      if (hasActiveBets) {
        logger.debug('Health check: Last post timestamp old but active bets exist (reposting)', {
          lastPost: lastPostTime.toISOString(),
          activeBetsExist: true
        });
        return { success: true, lastPost: lastPostTime };
      }

      const hoursSince = Math.round((now - lastPostTime) / (1000 * 60 * 60));

      // Determine if this is a recent failure (within last 2 hours of expected time)
      // This helps distinguish between "missed posting" vs "old data"
      const timeSinceExpected = now - expectedPost;
      const isRecentFailure = timeSinceExpected < 2 * 60 * 60 * 1000; // Within 2 hours

      logger.warn('Health check: Last post is old and no active bets', {
        lastPost: lastPostTime.toISOString(),
        expected: expectedPost.toISOString(),
        hoursSince,
        isRecentFailure,
        expectedPostHour
      });

      return {
        success: true,
        lastPost: lastPostTime,
        warning: `Last post ${hoursSince}h ago, expected post at ${expectedPostHour}:00`,
        failedPeriod: `${expectedPostHour}h`,
        isPostingFailure: isRecentFailure
      };
    }

    logger.debug('Health check: Last posting OK', { lastPost: lastPostTime.toISOString() });
    return { success: true, lastPost: lastPostTime };
  } catch (err) {
    logger.error('Health check: Error checking last posting', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Check for stuck/stale bets in various states
 * @returns {Promise<{success: boolean, issues?: Array, error?: string}>}
 */
async function checkJobsHealth() {
  const issues = [];
  const now = new Date();

  try {
    // 1. Check pending_link bets stuck for too long
    // Only consider bets with kickoff in the posting window (next 2 days)
    const pendingCutoff = new Date(now - THRESHOLDS.PENDING_LINK_MAX_HOURS * 60 * 60 * 1000);
    const maxKickoff = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days ahead
    const { data: stuckPending, error: pendingError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        created_at,
        league_matches!inner (kickoff_time)
      `)
      .eq('bet_status', 'pending_link')
      .lt('created_at', pendingCutoff.toISOString())
      .gte('league_matches.kickoff_time', now.toISOString())
      .lte('league_matches.kickoff_time', maxKickoff.toISOString());

    if (pendingError) {
      logger.error('Health check: Failed to query pending bets', { error: pendingError.message });
    } else if (stuckPending && stuckPending.length > 0) {
      issues.push({
        type: 'stuck_pending_link',
        count: stuckPending.length,
        message: `${stuckPending.length} bet(s) waiting for links > ${THRESHOLDS.PENDING_LINK_MAX_HOURS}h`
      });
    }

    // 2. Check ready bets not posted for too long
    // Only consider bets with kickoff in the posting window (next 2 days)
    const readyCutoff = new Date(now - THRESHOLDS.READY_NOT_POSTED_HOURS * 60 * 60 * 1000);
    const maxKickoffTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days ahead
    const { data: stuckReady, error: readyError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        created_at,
        league_matches!inner (kickoff_time)
      `)
      .eq('bet_status', 'ready')
      .lt('created_at', readyCutoff.toISOString())
      .gte('league_matches.kickoff_time', now.toISOString())
      .lte('league_matches.kickoff_time', maxKickoffTime.toISOString());

    if (readyError) {
      logger.error('Health check: Failed to query ready bets', { error: readyError.message });
    } else if (stuckReady && stuckReady.length > 0) {
      issues.push({
        type: 'stuck_ready',
        count: stuckReady.length,
        message: `${stuckReady.length} bet(s) ready but not posted > ${THRESHOLDS.READY_NOT_POSTED_HOURS}h`
      });
    }

    // 3. Check posted bets with matches finished but no result tracked
    const { data: stuckPosted, error: postedError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        telegram_posted_at,
        league_matches!inner (
          kickoff_time,
          status
        )
      `)
      .eq('bet_status', 'posted')
      .in('league_matches.status', ['complete', 'finished', 'ft', 'aet', 'pen']);

    if (postedError) {
      logger.error('Health check: Failed to query stuck posted bets', { error: postedError.message });
    } else if (stuckPosted && stuckPosted.length > 0) {
      // Filter to only those where match finished long ago
      const resultCutoff = new Date(now - THRESHOLDS.POSTED_NO_RESULT_HOURS * 60 * 60 * 1000);
      const stuckWithNoResult = stuckPosted.filter(bet => {
        const kickoff = new Date(bet.league_matches.kickoff_time);
        return kickoff < resultCutoff;
      });

      if (stuckWithNoResult.length > 0) {
        issues.push({
          type: 'stuck_no_result',
          count: stuckWithNoResult.length,
          message: `${stuckWithNoResult.length} bet(s) with finished matches but no result tracked`
        });
      }
    }

    if (issues.length > 0) {
      logger.warn('Health check: Found job issues', { issues });
      return { success: true, issues };
    }

    logger.debug('Health check: Jobs health OK');
    return { success: true, issues: [] };
  } catch (err) {
    logger.error('Health check: Error checking jobs', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Main health check job
 * Runs all checks and sends alerts if issues found
 * @returns {Promise<{success: boolean, checks: object}>}
 */
async function runHealthCheck() {
  // Prevent concurrent runs
  if (healthCheckRunning) {
    logger.debug('Health check already running, skipping');
    return { success: true, checks: {}, skipped: true };
  }
  healthCheckRunning = true;

  try {
    return await _runHealthCheckInternal();
  } finally {
    healthCheckRunning = false;
  }
}

async function _runHealthCheckInternal() {
  logger.info('Starting health check job');

  const results = {
    database: null,
    lastPosting: null,
    jobsHealth: null,
  };

  let hasErrors = false;
  let hasWarnings = false;

  // Run all checks in parallel
  const [dbResult, postResult, jobsResult] = await Promise.all([
    checkDatabaseConnection(),
    checkLastPosting(),
    checkJobsHealth(),
  ]);

  results.database = dbResult;
  results.lastPosting = postResult;
  results.jobsHealth = jobsResult;

  // Collect issues for alerting
  const alerts = [];

  // Database issues
  if (!dbResult.success) {
    hasErrors = true;
    alerts.push({
      severity: 'error',
      check: 'Database',
      message: dbResult.error,
      action: 'Verifique o Supabase'
    });
  } else if (dbResult.warning) {
    hasWarnings = true;
    alerts.push({
      severity: 'warn',
      check: 'Database',
      message: dbResult.warning,
      action: 'Monitore a latência'
    });
  }

  // Posting issues - use specific alert for recent failures
  if (!postResult.success) {
    hasErrors = true;
    alerts.push({
      severity: 'error',
      check: 'Postagem',
      message: postResult.error,
      action: 'Verifique os logs do bot'
    });
  } else if (postResult.warning) {
    hasWarnings = true;

    // If this is a recent posting failure, send the specific operator alert (with debounce)
    if (postResult.isPostingFailure && postResult.failedPeriod) {
      if (canSendAlert('posting_failure')) {
        const detectedAt = new Date().toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit'
        });
        try {
          await postingFailureAlert(postResult.failedPeriod, detectedAt);
          logger.info('Posting failure alert sent', { failedPeriod: postResult.failedPeriod });
        } catch (err) {
          logger.error('Failed to send posting failure alert', { error: err.message });
        }
      } else {
        logger.info('Posting failure alert suppressed (debounce)', { failedPeriod: postResult.failedPeriod });
      }
    } else {
      // For older issues, use regular health check alert
      alerts.push({
        severity: 'warn',
        check: 'Postagem',
        message: postResult.warning,
        action: 'Use /postar para forçar postagem'
      });
    }
  }

  // Jobs issues
  if (!jobsResult.success) {
    hasErrors = true;
    alerts.push({
      severity: 'error',
      check: 'Jobs',
      message: jobsResult.error,
      action: 'Verifique os cron jobs'
    });
  } else if (jobsResult.issues && jobsResult.issues.length > 0) {
    hasWarnings = true;
    for (const issue of jobsResult.issues) {
      alerts.push({
        severity: 'warn',
        check: issue.type,
        message: issue.message,
        action: issue.type === 'stuck_pending_link' ? 'Forneça os links pendentes' :
                issue.type === 'stuck_ready' ? 'Use /postar para forçar postagem' :
                'Use /status para verificar'
      });
    }
  }

  // Send alerts if any issues found (with debounce)
  if (alerts.length > 0) {
    // Filter alerts that pass debounce check
    const alertsToSend = alerts.filter(alert => {
      const alertType = alert.check;
      if (canSendAlert(alertType)) {
        return true;
      }
      logger.info('Alert suppressed (debounce)', { check: alertType, message: alert.message });
      return false;
    });

    if (alertsToSend.length > 0) {
      try {
        await healthCheckAlert(alertsToSend, hasErrors);
        logger.info('Health check alerts sent', { count: alertsToSend.length });
      } catch (err) {
        logger.error('Failed to send health check alert', { error: err.message });
      }
    } else {
      logger.debug('All alerts debounced, none sent');
    }
  }

  // Log summary
  const summary = {
    success: !hasErrors,
    hasWarnings,
    alertCount: alerts.length,
    dbLatencyMs: dbResult.latencyMs,
    lastPost: postResult.lastPost?.toISOString(),
    jobIssues: jobsResult.issues?.length || 0,
  };

  logger.info('Health check complete', summary);

  return {
    success: !hasErrors,
    checks: results,
    alerts,
  };
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
  checkLastPosting,
  checkJobsHealth,
  canSendAlert,
  THRESHOLDS,
};

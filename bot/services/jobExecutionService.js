/**
 * Job Execution Service - Log job executions to database
 *
 * Provides wrapper function for jobs to automatically log:
 * - Start time
 * - End time
 * - Duration
 * - Success/failure status
 * - Error messages
 *
 * Also sends alerts on failure with debounce.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { jobFailureAlert } = require('./alertService');

/**
 * Start a job execution record
 * @param {string} jobName - Name of the job
 * @returns {Promise<{success: boolean, data?: {executionId: string}, error?: object}>}
 */
async function startExecution(jobName) {
  const { data, error } = await supabase
    .from('job_executions')
    .insert({ job_name: jobName, status: 'running' })
    .select('id')
    .single();

  if (error) {
    // Log warning but don't fail - job should still run even if logging fails
    logger.warn('[jobExecutionService] Failed to start execution logging (job will still run)', {
      jobName,
      error: error.message
    });
    return { success: false, error };
  }
  return { success: true, data: { executionId: data.id } };
}

/**
 * Finish a job execution record
 * @param {string} executionId - Execution ID from startExecution
 * @param {string} status - 'success' or 'failed'
 * @param {object} result - Job result data (optional)
 * @param {string} errorMessage - Error message if failed (optional)
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function finishExecution(executionId, status, result = null, errorMessage = null) {
  const startResult = await supabase
    .from('job_executions')
    .select('started_at')
    .eq('id', executionId)
    .single();

  // Handle error fetching started_at - continue with null duration
  if (startResult.error) {
    logger.warn('[jobExecutionService] Failed to fetch started_at for duration calculation', {
      executionId,
      error: startResult.error.message
    });
  }

  const durationMs = startResult.data?.started_at
    ? Date.now() - new Date(startResult.data.started_at).getTime()
    : null;

  const { error } = await supabase
    .from('job_executions')
    .update({
      status,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      result,
      error_message: errorMessage
    })
    .eq('id', executionId);

  if (error) {
    logger.warn('[jobExecutionService] Failed to finish execution logging', {
      executionId,
      error: error.message
    });
    return { success: false, error };
  }
  return { success: true };
}

/**
 * Wrapper function to execute a job with automatic logging
 * @param {string} jobName - Name of the job
 * @param {Function} fn - Async function to execute
 * @returns {Promise<any>} - Result of the job function
 * @throws {Error} - Re-throws any error from the job
 */
async function withExecutionLogging(jobName, fn) {
  const startResult = await startExecution(jobName);
  const executionId = startResult.success ? startResult.data.executionId : null;

  if (!executionId) {
    logger.warn('[jobExecutionService] Running job without execution logging', { jobName });
  }

  try {
    const result = await fn();
    if (executionId) {
      await finishExecution(executionId, 'success', result);
    }
    return result;
  } catch (err) {
    if (executionId) {
      await finishExecution(executionId, 'failed', null, err.message);
      await jobFailureAlert(jobName, err.message, executionId);
    } else {
      // Still send alert even if logging failed
      await jobFailureAlert(jobName, err.message, null);
    }
    throw err;
  }
}

// Cache for getLatestExecutions (30s TTL)
let executionsCache = {
  data: null,
  timestamp: 0,
  TTL_MS: 30000
};

/**
 * Reset the executions cache (for testing)
 */
function _resetCache() {
  executionsCache.data = null;
  executionsCache.timestamp = 0;
}

/**
 * Format job result JSONB to human-readable string
 * @param {string} jobName - Name of the job
 * @param {object} result - Result JSONB from database
 * @returns {string} - Formatted result string (max 30 chars)
 */
function formatResult(jobName, result) {
  if (!result) return '';

  try {
    // Format based on job type
    switch (jobName) {
      case 'pipeline': {
        if (result.analysesGenerated !== undefined) {
          return `${result.analysesGenerated} análises`;
        }
        if (result.stepsRun !== undefined) {
          const skipped = result.stepsSkipped ? `, ${result.stepsSkipped} skip` : '';
          return `${result.stepsRun} steps${skipped}`;
        }
        if (result.dryRun) {
          return 'dry-run';
        }
        return 'ok';
      }

      case 'post-bets': {
        const posted = result.posted || 0;
        const reposted = result.reposted || 0;
        if (posted > 0 || reposted > 0) {
          return `${posted} posted, ${reposted} repost`;
        }
        return 'nenhuma';
      }

      case 'track-results': {
        const tracked = result.tracked || 0;
        const green = result.green || 0;
        const red = result.red || 0;
        if (tracked > 0) {
          return `${tracked} tracked (${green}G/${red}R)`;
        }
        return 'nenhum';
      }

      case 'kick-expired': {
        const kicked = result.kicked || result.count || 0;
        return `${kicked} kicked`;
      }

      case 'enrich-odds': {
        const enriched = result.enriched || result.count || 0;
        return `${enriched} enriched`;
      }

      case 'reminders':
      case 'trial-reminders':
      case 'renewal-reminders': {
        const sent = result.sent || result.count || 0;
        return `${sent} sent`;
      }

      case 'reconciliation': {
        const reconciled = result.reconciled || result.count || 0;
        return `${reconciled} reconciled`;
      }

      case 'request-links': {
        const requested = result.requested || result.count || 0;
        return `${requested} requested`;
      }

      case 'healthCheck':
        if (result.alerts && result.alerts.length > 0) {
          return `${result.alerts.length} warns`;
        }
        return 'ok';

      default: {
        // Generic: try to extract a count or stringify
        if (typeof result.count === 'number') {
          return `${result.count} items`;
        }
        const str = JSON.stringify(result);
        return str.length > 30 ? str.substring(0, 27) + '...' : str;
      }
    }
  } catch (err) {
    logger.warn('[jobExecutionService] formatResult error', { jobName, error: err.message });
  }

  return '';
}

/**
 * Get the latest execution of each job (for /status command)
 * Uses DISTINCT ON to get one row per job_name, ordered by started_at DESC
 * Results are cached for 30 seconds to prevent spam
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getLatestExecutions() {
  // Check cache
  const now = Date.now();
  if (executionsCache.data && (now - executionsCache.timestamp) < executionsCache.TTL_MS) {
    logger.debug('[jobExecutionService] getLatestExecutions cache hit');
    return { success: true, data: executionsCache.data, fromCache: true };
  }

  try {
    // Supabase doesn't support DISTINCT ON, so we use RPC or a workaround
    // Workaround: get recent executions and filter in JS
    const { data, error } = await supabase
      .from('job_executions')
      .select('id, job_name, started_at, finished_at, status, duration_ms, result, error_message')
      .order('started_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('[jobExecutionService] getLatestExecutions query failed', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Get the latest execution for each job_name
    const latestByJob = new Map();
    for (const row of data || []) {
      if (!latestByJob.has(row.job_name)) {
        latestByJob.set(row.job_name, row);
      }
    }

    const result = Array.from(latestByJob.values());

    // Update cache
    executionsCache.data = result;
    executionsCache.timestamp = now;

    logger.debug('[jobExecutionService] getLatestExecutions fetched', { count: result.length });
    return { success: true, data: result };
  } catch (err) {
    logger.error('[jobExecutionService] getLatestExecutions error', { error: err.message });
    return { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } };
  }
}

/**
 * Cleanup stuck jobs - mark jobs with status='running' for over 1 hour as 'failed'
 * Prevents orphaned records from jobs that crashed without finishing
 * @returns {Promise<{success: boolean, data?: {cleaned: number}, error?: object}>}
 */
async function cleanupStuckJobs() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('job_executions')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: 'Timeout: job não finalizou'
      })
      .eq('status', 'running')
      .lt('started_at', oneHourAgo)
      .select('id');

    if (error) {
      logger.error('[jobExecutionService] cleanupStuckJobs update failed', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const cleaned = data?.length || 0;
    if (cleaned > 0) {
      logger.info('[jobExecutionService] cleanupStuckJobs cleaned stuck jobs', { cleaned });
      // Invalidate cache so /status shows updated data
      _resetCache();
      // Alert admin about timed out jobs
      await jobFailureAlert(
        'cleanup-stuck-jobs',
        `${cleaned} job(s) marcado(s) como failed por timeout (running > 1h)`,
        null
      );
    } else {
      logger.debug('[jobExecutionService] cleanupStuckJobs no stuck jobs found');
    }

    return { success: true, data: { cleaned } };
  } catch (err) {
    logger.error('[jobExecutionService] cleanupStuckJobs error', { error: err.message });
    return { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } };
  }
}

module.exports = {
  startExecution,
  finishExecution,
  withExecutionLogging,
  getLatestExecutions,
  cleanupStuckJobs,
  formatResult,
  _resetCache
};

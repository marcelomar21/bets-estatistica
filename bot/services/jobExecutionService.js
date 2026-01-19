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

module.exports = { startExecution, finishExecution, withExecutionLogging };

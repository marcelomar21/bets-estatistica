/**
 * Dynamic Posting Scheduler (Story 5.5)
 *
 * Replaces hardcoded posting/distribution cron jobs with a dynamic scheduler
 * that reads posting times from the groups table (posting_schedule JSONB).
 *
 * Features:
 * - loadPostingSchedule(): Reads config from DB
 * - setupDynamicScheduler(): Creates/recreates cron jobs
 * - reloadPostingSchedule(): Periodic reload + change detection
 * - checkPostNow(): Polls post_now_requested_at flag for manual posting
 */

const cron = require('node-cron');
const { supabase } = require('../lib/supabase');
const { config } = require('../lib/config');
const logger = require('../lib/logger');
const { withExecutionLogging } = require('./services/jobExecutionService');
const { runPostBets } = require('./jobs/postBets');
const { runDistributeBets } = require('./jobs/distributeBets');

const TZ = 'America/Sao_Paulo';
const DEFAULT_SCHEDULE = { enabled: true, times: ['10:00', '15:00', '22:00'] };

// Internal state
let activePostingJobs = [];
let currentSchedule = null;
let isManualPostInProgress = false;

/**
 * Load posting schedule from database for this bot's group
 * @returns {Promise<{enabled: boolean, times: string[]}>}
 */
async function loadPostingSchedule() {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('posting_schedule')
      .eq('id', config.membership.groupId)
      .single();

    if (error) {
      logger.error('[scheduler] Failed to load posting schedule', {
        groupId: config.membership.groupId,
        error: error.message,
      });
      return DEFAULT_SCHEDULE;
    }

    return data?.posting_schedule || DEFAULT_SCHEDULE;
  } catch (err) {
    logger.error('[scheduler] Exception loading posting schedule', {
      error: err.message,
    });
    return DEFAULT_SCHEDULE;
  }
}

/**
 * Helper to run distributeBets with failure guard (same as server.js pattern)
 */
async function runDistributeBetsWithFailureGuard() {
  return withExecutionLogging('distribute-bets', async () => {
    const result = await runDistributeBets();
    if (!result?.success) {
      throw new Error(result?.error?.message || 'runDistributeBets returned success=false');
    }
    return result;
  });
}

/**
 * Calculate distribution cron time (5 minutes before posting time)
 * @param {number} hours - Posting hour (0-23)
 * @param {number} minutes - Posting minute (0-59)
 * @returns {{distHours: number, distMinutes: number}}
 */
function calcDistributionTime(hours, minutes) {
  let distMinutes = minutes - 5;
  let distHours = hours;

  if (distMinutes < 0) {
    distMinutes += 60;
    distHours -= 1;
    if (distHours < 0) {
      distHours = 23;
    }
  }

  return { distHours, distMinutes };
}

/**
 * Setup dynamic scheduler with cron jobs based on schedule config
 * Stops all previous posting/distribution jobs before creating new ones
 *
 * @param {{enabled: boolean, times: string[]}} schedule
 */
function setupDynamicScheduler(schedule) {
  // 1. Stop old jobs
  activePostingJobs.forEach(job => job.stop());
  activePostingJobs = [];

  // 2. Create new jobs for each configured time
  for (const time of schedule.times) {
    const [hours, minutes] = time.split(':').map(Number);

    // Distribution job (5 min before posting)
    const { distHours, distMinutes } = calcDistributionTime(hours, minutes);
    const distCron = `${distMinutes} ${distHours} * * *`;
    const distJob = cron.schedule(distCron, async () => {
      logger.info('[scheduler] Running distribute-bets (dynamic)', {
        postTime: time,
        groupId: config.membership.groupId,
      });
      try {
        await runDistributeBetsWithFailureGuard();
        logger.info('[scheduler] distribute-bets (dynamic) complete', { postTime: time });
      } catch (err) {
        logger.error('[scheduler] distribute-bets (dynamic) failed', {
          postTime: time,
          error: err.message,
        });
      }
    }, { timezone: TZ });
    activePostingJobs.push(distJob);

    // Posting job
    const postCron = `${minutes} ${hours} * * *`;
    const postJob = cron.schedule(postCron, async () => {
      // Check enabled flag at EXECUTION TIME (re-reads from current schedule cache)
      if (!currentSchedule?.enabled) {
        logger.info('[scheduler] Posting disabled for group, skipping', {
          groupId: config.membership.groupId,
          postTime: time,
        });
        return;
      }

      logger.info('[scheduler] Running post-bets (dynamic)', {
        postTime: time,
        groupId: config.membership.groupId,
      });
      try {
        await withExecutionLogging('post-bets', () => runPostBets(true, { postTimes: currentSchedule?.times }));
        logger.info('[scheduler] post-bets (dynamic) complete', { postTime: time });
      } catch (err) {
        logger.error('[scheduler] post-bets (dynamic) failed', {
          postTime: time,
          error: err.message,
        });
      }
    }, { timezone: TZ });
    activePostingJobs.push(postJob);
  }

  // Update cached schedule
  currentSchedule = schedule;

  logger.info('[scheduler] Dynamic scheduler configured', {
    groupId: config.membership.groupId,
    enabled: schedule.enabled,
    times: schedule.times,
    totalJobs: activePostingJobs.length,
  });
}

/**
 * Reload posting schedule from DB and reconfigure if changed
 */
async function reloadPostingSchedule() {
  try {
    const newSchedule = await loadPostingSchedule();

    if (JSON.stringify(newSchedule) !== JSON.stringify(currentSchedule)) {
      logger.info('[scheduler] Posting schedule changed, reconfiguring', {
        old: currentSchedule,
        new: newSchedule,
      });
      setupDynamicScheduler(newSchedule);
    }
  } catch (err) {
    logger.error('[scheduler] Failed to reload posting schedule', {
      error: err.message,
    });
    // Keep current schedule on failure
  }
}

/**
 * Check for "Post Now" flag in the database
 * If post_now_requested_at is set, execute runPostBets(true) and clear the flag
 */
async function checkPostNow() {
  try {
    if (isManualPostInProgress) {
      logger.debug('[scheduler] Post Now already in progress, skipping this cycle', {
        groupId: config.membership.groupId,
      });
      return;
    }

    const { data, error } = await supabase
      .from('groups')
      .select('post_now_requested_at')
      .eq('id', config.membership.groupId)
      .single();

    if (error) {
      logger.error('[scheduler] Failed to check post-now flag', {
        error: error.message,
      });
      return;
    }

    if (!data?.post_now_requested_at) {
      return;
    }

    const requestedAt = data.post_now_requested_at;
    logger.info('[scheduler] Post Now requested via admin panel', {
      groupId: config.membership.groupId,
      requestedAt,
    });

    isManualPostInProgress = true;
    try {
      await withExecutionLogging('post-bets-manual', () => runPostBets(true, { postTimes: currentSchedule?.times }));
      logger.info('[scheduler] Post Now completed successfully', {
        groupId: config.membership.groupId,
      });
    } catch (err) {
      logger.error('[scheduler] Post Now execution failed', {
        groupId: config.membership.groupId,
        error: err.message,
      });
    } finally {
      const { error: clearError } = await supabase
        .from('groups')
        .update({ post_now_requested_at: null })
        .eq('id', config.membership.groupId)
        .eq('post_now_requested_at', requestedAt);

      if (clearError) {
        logger.error('[scheduler] Failed to clear post-now flag after execution', {
          groupId: config.membership.groupId,
          error: clearError.message,
        });
      }
      isManualPostInProgress = false;
    }
  } catch (err) {
    logger.error('[scheduler] checkPostNow exception', {
      error: err.message,
    });
    isManualPostInProgress = false;
  }
}

/**
 * Expose internal state for testing
 */
function _getState() {
  return { activePostingJobs, currentSchedule, isManualPostInProgress };
}

module.exports = {
  loadPostingSchedule,
  setupDynamicScheduler,
  reloadPostingSchedule,
  checkPostNow,
  _getState,
};

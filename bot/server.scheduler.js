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
let perMinuteJob = null;
let isPerMinutePostInProgress = false;

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
 * Get the current time in BRT as "HH:MM"
 * @returns {string}
 */
function getCurrentBrtTime() {
  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const h = String(brTime.getHours()).padStart(2, '0');
  const m = String(brTime.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Per-minute scheduler: checks if any bets have post_at matching the current minute.
 * This enables free-form scheduling (any HH:MM, not just group-configured times).
 */
async function checkScheduledBets() {
  if (isPerMinutePostInProgress) return;
  if (!currentSchedule?.enabled) return;

  const currentTime = getCurrentBrtTime();
  const groupId = config.membership.groupId;

  // Skip if the current time matches a configured posting time
  // (those are already handled by the dedicated cron jobs)
  if (currentSchedule?.times?.includes(currentTime)) {
    return;
  }

  try {
    // Check if any non-posted bets have post_at for this minute
    const { data, error } = await supabase
      .from('suggested_bets')
      .select('id')
      .eq('group_id', groupId)
      .eq('post_at', currentTime)
      .in('elegibilidade', ['elegivel'])
      .in('bet_status', ['generated', 'pending_link', 'pending_odds', 'ready', 'posted'])
      .limit(1);

    if (error || !data || data.length === 0) return;

    logger.info('[scheduler] Per-minute check found bets to post', {
      currentTime,
      groupId,
      count: data.length,
    });

    isPerMinutePostInProgress = true;
    try {
      await withExecutionLogging('post-bets', () =>
        runPostBets(true, { postTimes: currentSchedule?.times, currentPostTime: currentTime })
      );
      logger.info('[scheduler] Per-minute post complete', { currentTime });
    } catch (err) {
      logger.error('[scheduler] Per-minute post failed', {
        currentTime,
        error: err.message,
      });
    } finally {
      isPerMinutePostInProgress = false;
    }
  } catch (err) {
    logger.error('[scheduler] Per-minute check exception', { error: err.message });
  }
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
  if (perMinuteJob) {
    perMinuteJob.stop();
    perMinuteJob = null;
  }

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
        await withExecutionLogging('post-bets', () => runPostBets(true, { postTimes: currentSchedule?.times, currentPostTime: time }));
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

  // 3. Per-minute cron for free-form post_at times (not in configured schedule)
  perMinuteJob = cron.schedule('* * * * *', checkScheduledBets, { timezone: TZ });

  // Update cached schedule
  currentSchedule = schedule;

  logger.info('[scheduler] Dynamic scheduler configured', {
    groupId: config.membership.groupId,
    enabled: schedule.enabled,
    times: schedule.times,
    totalJobs: activePostingJobs.length,
    perMinuteEnabled: true,
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
      .select('post_now_requested_at, post_now_bet_ids, post_now_preview_id')
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
    const allowedBetIds = Array.isArray(data.post_now_bet_ids) ? data.post_now_bet_ids : null;
    const previewId = data.post_now_preview_id || null;
    logger.info('[scheduler] Post Now requested via admin panel', {
      groupId: config.membership.groupId,
      requestedAt,
      allowedBetIds: allowedBetIds ? allowedBetIds.length : 'all',
      previewId,
    });

    isManualPostInProgress = true;
    try {
      await withExecutionLogging('post-bets-manual', () => runPostBets(true, { postTimes: currentSchedule?.times, allowedBetIds, previewId }));
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
        .update({ post_now_requested_at: null, post_now_bet_ids: null, post_now_preview_id: null })
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

/**
 * Factory: Create a scheduler instance for a specific group (Phase 5)
 * Each instance has its own state, independent of the singleton
 * @param {string} groupId - Group UUID
 * @param {object} [botCtx] - Optional BotContext for multi-bot
 * @returns {object} Scheduler instance with the same API as the module exports
 */
function createScheduler(groupId, botCtx = null) {
  let instanceJobs = [];
  let instanceSchedule = null;
  let instanceManualPostInProgress = false;

  async function instanceLoadSchedule() {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('posting_schedule')
        .eq('id', groupId)
        .single();

      if (error) {
        logger.error('[scheduler:factory] Failed to load posting schedule', { groupId, error: error.message });
        return DEFAULT_SCHEDULE;
      }
      return data?.posting_schedule || DEFAULT_SCHEDULE;
    } catch (err) {
      logger.error('[scheduler:factory] Exception loading posting schedule', { groupId, error: err.message });
      return DEFAULT_SCHEDULE;
    }
  }

  function instanceSetup(schedule) {
    instanceJobs.forEach(job => job.stop());
    instanceJobs = [];

    for (const time of schedule.times) {
      const [hours, minutes] = time.split(':').map(Number);
      const { distHours, distMinutes } = calcDistributionTime(hours, minutes);

      const distJob = cron.schedule(`${distMinutes} ${distHours} * * *`, async () => {
        logger.info('[scheduler:factory] Running distribute-bets', { postTime: time, groupId });
        try {
          await runDistributeBetsWithFailureGuard();
        } catch (err) {
          logger.error('[scheduler:factory] distribute-bets failed', { postTime: time, groupId, error: err.message });
        }
      }, { timezone: TZ });
      instanceJobs.push(distJob);

      const postJob = cron.schedule(`${minutes} ${hours} * * *`, async () => {
        if (!instanceSchedule?.enabled) {
          logger.info('[scheduler:factory] Posting disabled, skipping', { groupId, postTime: time });
          return;
        }
        logger.info('[scheduler:factory] Running post-bets', { postTime: time, groupId });
        try {
          await withExecutionLogging('post-bets', () => runPostBets(true, { postTimes: instanceSchedule?.times, currentPostTime: time, botCtx: botCtx || { groupId } }));
        } catch (err) {
          logger.error('[scheduler:factory] post-bets failed', { postTime: time, groupId, error: err.message });
        }
      }, { timezone: TZ });
      instanceJobs.push(postJob);
    }

    instanceSchedule = schedule;
    logger.info('[scheduler:factory] Scheduler configured', { groupId, enabled: schedule.enabled, times: schedule.times });
  }

  async function instanceReload() {
    try {
      const newSchedule = await instanceLoadSchedule();
      if (JSON.stringify(newSchedule) !== JSON.stringify(instanceSchedule)) {
        logger.info('[scheduler:factory] Schedule changed, reconfiguring', { groupId });
        instanceSetup(newSchedule);
      }
    } catch (err) {
      logger.error('[scheduler:factory] Failed to reload schedule', { groupId, error: err.message });
    }
  }

  async function instanceCheckPostNow() {
    try {
      if (instanceManualPostInProgress) return;

      const { data, error } = await supabase
        .from('groups')
        .select('post_now_requested_at, post_now_bet_ids, post_now_preview_id')
        .eq('id', groupId)
        .single();

      if (error || !data?.post_now_requested_at) return;

      const requestedAt = data.post_now_requested_at;
      const allowedBetIds = Array.isArray(data.post_now_bet_ids) ? data.post_now_bet_ids : null;
      const previewId = data.post_now_preview_id || null;
      logger.info('[scheduler:factory] Post Now requested', { groupId, requestedAt, allowedBetIds: allowedBetIds ? allowedBetIds.length : 'all', previewId });

      instanceManualPostInProgress = true;
      try {
        await withExecutionLogging('post-bets-manual', () => runPostBets(true, { postTimes: instanceSchedule?.times, allowedBetIds, previewId, botCtx: botCtx || { groupId } }));
      } catch (err) {
        logger.error('[scheduler:factory] Post Now failed', { groupId, error: err.message });
      } finally {
        await supabase
          .from('groups')
          .update({ post_now_requested_at: null, post_now_bet_ids: null, post_now_preview_id: null })
          .eq('id', groupId)
          .eq('post_now_requested_at', requestedAt);
        instanceManualPostInProgress = false;
      }
    } catch (err) {
      logger.error('[scheduler:factory] checkPostNow exception', { groupId, error: err.message });
      instanceManualPostInProgress = false;
    }
  }

  function instanceStop() {
    instanceJobs.forEach(job => job.stop());
    instanceJobs = [];
    instanceSchedule = null;
    logger.info('[scheduler:factory] Scheduler stopped', { groupId });
  }

  return {
    groupId,
    botCtx,
    loadPostingSchedule: instanceLoadSchedule,
    setupDynamicScheduler: instanceSetup,
    reloadPostingSchedule: instanceReload,
    checkPostNow: instanceCheckPostNow,
    stop: instanceStop,
    getState: () => ({ activePostingJobs: instanceJobs, currentSchedule: instanceSchedule, isManualPostInProgress: instanceManualPostInProgress }),
  };
}

module.exports = {
  loadPostingSchedule,
  setupDynamicScheduler,
  reloadPostingSchedule,
  checkPostNow,
  createScheduler,
  calcDistributionTime,
  _getState,
};

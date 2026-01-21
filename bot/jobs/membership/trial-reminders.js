/**
 * Job: Trial Reminders - Send reminders to members in trial period
 * Story 16.5: Implementar Notificacoes de Cobranca
 *
 * Sends reminders to members whose trial ends in 1-3 days (day 5, 6, 7 of trial).
 *
 * Run: node bot/jobs/membership/trial-reminders.js
 * Schedule: 09:00 BRT daily
 */
require('dotenv').config();

const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');
const { getSuccessRate } = require('../../services/metricsService');
const { getTrialDays } = require('../../services/memberService');
const {
  hasNotificationToday,
  registerNotification,
  sendPrivateMessage,
  getPaymentLinkForMember,
  formatTrialReminder,
} = require('../../services/notificationService');

// Configuration
const CONFIG = {
  TARGET_DAYS: [1, 2, 3], // Days remaining until trial ends (1 = last day, 3 = day 5 of 7)
  NOTIFICATION_TYPE: 'trial_reminder',
};

// Lock to prevent concurrent runs (in-memory, same process)
let trialRemindersRunning = false;

/**
 * Get members needing trial reminder
 * Returns members whose trial ends in 1-3 days
 * Calculates trial_ends_at dynamically from trial_started_at + TRIAL_DAYS
 * @returns {Promise<{success: boolean, data?: {members: Array, trialDays: number}, error?: object}>}
 */
async function getMembersNeedingTrialReminder() {
  try {
    // Get trial days from system_config
    const trialDaysResult = await getTrialDays();
    const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get all trial members with trial_started_at
    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null);

    if (error) {
      logger.error('[membership:trial-reminders] getMembersNeedingTrialReminder: database error', {
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Filter members whose trial ends in 1-3 days
    const membersNeedingReminder = (members || []).filter(member => {
      // Skip if no valid trial_started_at
      if (!member.trial_started_at) {
        return false;
      }

      const trialStartedAt = new Date(member.trial_started_at);
      if (isNaN(trialStartedAt.getTime())) {
        logger.warn('[membership:trial-reminders] Invalid trial_started_at', {
          memberId: member.id,
          trial_started_at: member.trial_started_at,
        });
        return false;
      }

      const trialEndsAt = new Date(trialStartedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      const msRemaining = trialEndsAt.getTime() - today.getTime();
      const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

      // Add computed trial_ends_at to member object for later use
      member.trial_ends_at = trialEndsAt.toISOString();

      // Return true if 1-3 days remaining
      return daysRemaining >= 1 && daysRemaining <= 3;
    });

    logger.debug('[membership:trial-reminders] getMembersNeedingTrialReminder: found members', {
      total: members?.length || 0,
      needingReminder: membersNeedingReminder.length,
      trialDays,
    });

    return { success: true, data: { members: membersNeedingReminder, trialDays } };
  } catch (err) {
    logger.error('[membership:trial-reminders] getMembersNeedingTrialReminder: unexpected error', {
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Calculate days remaining until trial ends
 * @param {string} trialEndsAt - ISO date string
 * @returns {number} - Days remaining (rounded up)
 */
function getDaysRemaining(trialEndsAt) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endsAt = new Date(trialEndsAt);
  const msRemaining = endsAt.getTime() - today.getTime();
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

/**
 * Send trial reminder to a single member
 * @param {object} member - Member object with telegram_id, trial_ends_at
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendTrialReminder(member) {
  const { id: memberId, telegram_id: telegramId, trial_ends_at: trialEndsAt } = member;

  // Validate telegram_id exists
  if (!telegramId) {
    logger.warn('[membership:trial-reminders] sendTrialReminder: member has no telegram_id', { memberId });
    return {
      success: false,
      error: { code: 'NO_TELEGRAM_ID', message: 'Member does not have a telegram_id' },
    };
  }

  // Check if already sent today
  const hasResult = await hasNotificationToday(memberId, CONFIG.NOTIFICATION_TYPE);
  if (hasResult.success && hasResult.data.hasNotification) {
    logger.debug('[membership:trial-reminders] sendTrialReminder: already sent today', { memberId });
    return {
      success: false,
      error: { code: 'NOTIFICATION_ALREADY_SENT', message: 'Notification already sent today' },
    };
  }

  if (!hasResult.success) {
    return hasResult; // Pass through error
  }

  // Get payment link with affiliate tracking (Story 18.3)
  const linkResult = getPaymentLinkForMember(member);
  if (!linkResult.success) {
    logger.warn('[membership:trial-reminders] sendTrialReminder: no checkout URL', { memberId });
    return linkResult;
  }
  const checkoutUrl = linkResult.data.url;

  // Log affiliate tracking status
  logger.debug('[membership:trial-reminders] Payment link generated', {
    memberId,
    hasAffiliate: linkResult.data.hasAffiliate,
    affiliateCode: linkResult.data.affiliateCode
  });

  // Get success rate for message
  let successRate = null;
  try {
    const rateResult = await getSuccessRate();
    if (rateResult.success && rateResult.data?.rateAllTime) {
      successRate = rateResult.data.rateAllTime;
    }
  } catch (err) {
    logger.warn('[membership:trial-reminders] sendTrialReminder: failed to get success rate', {
      error: err.message,
    });
  }

  // Calculate days remaining
  const daysRemaining = getDaysRemaining(trialEndsAt);

  // Format message
  const message = formatTrialReminder(member, daysRemaining, checkoutUrl, successRate);

  // Send message
  const sendResult = await sendPrivateMessage(telegramId, message);

  if (!sendResult.success) {
    // USER_BLOCKED_BOT is expected - log but don't treat as failure
    if (sendResult.error?.code === 'USER_BLOCKED_BOT') {
      logger.warn('[membership:trial-reminders] sendTrialReminder: user blocked bot', {
        memberId,
        telegramId,
      });
    }
    return sendResult;
  }

  // Register notification
  const registerResult = await registerNotification(
    memberId,
    CONFIG.NOTIFICATION_TYPE,
    'telegram',
    sendResult.data.messageId
  );

  if (!registerResult.success) {
    logger.error('[membership:trial-reminders] sendTrialReminder: failed to register notification', {
      memberId,
      error: registerResult.error,
    });
    // Message was sent, so return success even if registration fails
  }

  logger.info('[membership:trial-reminders] sendTrialReminder: success', {
    memberId,
    telegramId,
    daysRemaining,
    messageId: sendResult.data.messageId,
  });

  return { success: true, data: { messageId: sendResult.data.messageId, daysRemaining } };
}

/**
 * Main entry point - runs the trial reminders job with lock
 * @returns {Promise<{success: boolean, sent?: number, skipped?: number, failed?: number, error?: string}>}
 */
async function runTrialReminders() {
  // Prevent concurrent runs
  if (trialRemindersRunning) {
    logger.debug('[membership:trial-reminders] Already running, skipping');
    return { success: true, skipped: true };
  }
  trialRemindersRunning = true;

  try {
    return await _runTrialRemindersInternal();
  } finally {
    trialRemindersRunning = false;
  }
}

/**
 * Internal processor - handles the actual reminder sending
 * @returns {Promise<{success: boolean, sent: number, skipped: number, failed: number}>}
 */
async function _runTrialRemindersInternal() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  logger.info('[membership:trial-reminders] Starting', { date: today });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Get members needing reminders
    const membersResult = await getMembersNeedingTrialReminder();

    if (!membersResult.success) {
      logger.error('[membership:trial-reminders] Failed to get members', {
        error: membersResult.error,
      });
      return { success: false, sent: 0, skipped: 0, failed: 0, error: membersResult.error.message };
    }

    const members = membersResult.data.members;

    if (members.length === 0) {
      logger.info('[membership:trial-reminders] No members need reminders');
      return { success: true, sent: 0, skipped: 0, failed: 0 };
    }

    logger.info('[membership:trial-reminders] Processing members', { count: members.length });

    // Process each member
    for (const member of members) {
      const result = await sendTrialReminder(member);

      if (result.success) {
        sent++;
      } else if (result.error?.code === 'NOTIFICATION_ALREADY_SENT' ||
                 result.error?.code === 'USER_BLOCKED_BOT' ||
                 result.error?.code === 'NO_TELEGRAM_ID') {
        skipped++;
      } else {
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[membership:trial-reminders] Complete', {
      sent,
      skipped,
      failed,
      durationMs: duration,
    });

    return { success: true, sent, skipped, failed };
  } catch (err) {
    logger.error('[membership:trial-reminders] Unexpected error', { error: err.message });
    return { success: false, sent, skipped, failed, error: err.message };
  }
}

// Run if called directly
if (require.main === module) {
  runTrialReminders()
    .then(result => {
      logger.info('[membership:trial-reminders] CLI result', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      logger.error('[membership:trial-reminders] CLI failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  runTrialReminders,
  getMembersNeedingTrialReminder,
  sendTrialReminder,
  getDaysRemaining,
  CONFIG,
};

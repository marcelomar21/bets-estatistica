/**
 * Job: Renewal Reminders - Send reminders to active members with PIX/Boleto
 * Story 16.5: Implementar Notificacoes de Cobranca
 *
 * Sends reminders to active members whose subscription ends in 1, 3, or 5 days.
 * Only for PIX/Boleto - cartao_recorrente is excluded (auto-renewal).
 *
 * Run: node bot/jobs/membership/renewal-reminders.js
 * Schedule: 10:00 BRT daily
 */
require('dotenv').config();

const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');
const {
  hasNotificationToday,
  registerNotification,
  sendPrivateMessage,
  getCheckoutLink,
  formatRenewalReminder,
} = require('../../services/notificationService');

// Configuration
const CONFIG = {
  TARGET_DAYS: [5, 3, 1], // Days before subscription ends to send reminder
  NOTIFICATION_TYPE: 'renewal_reminder',
  MANUAL_PAYMENT_METHODS: ['pix', 'boleto'], // Exclude cartao_recorrente
};

// Lock to prevent concurrent runs (in-memory, same process)
let renewalRemindersRunning = false;

/**
 * Get members needing renewal reminder
 * Returns active members with PIX/Boleto whose subscription ends in 1, 3, or 5 days
 * @returns {Promise<{success: boolean, data?: {members: Array}, error?: object}>}
 */
async function getMembersNeedingRenewalReminder() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get all active members with PIX/Boleto
    const { data: allMembers, error } = await supabase
      .from('members')
      .select('*')
      .eq('status', 'ativo')
      .in('payment_method', CONFIG.MANUAL_PAYMENT_METHODS)
      .not('subscription_ends_at', 'is', null);

    if (error) {
      logger.error('[membership:renewal-reminders] getMembersNeedingRenewalReminder: database error', {
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (!allMembers || allMembers.length === 0) {
      return { success: true, data: { members: [] } };
    }

    // Filter by target days
    const members = allMembers.filter(member => {
      const daysUntil = getDaysUntilRenewal(member.subscription_ends_at);
      return CONFIG.TARGET_DAYS.includes(daysUntil);
    });

    logger.debug('[membership:renewal-reminders] getMembersNeedingRenewalReminder: found members', {
      totalActive: allMembers.length,
      needingReminder: members.length,
    });

    return { success: true, data: { members } };
  } catch (err) {
    logger.error('[membership:renewal-reminders] getMembersNeedingRenewalReminder: unexpected error', {
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Calculate days until subscription renewal/end
 * @param {string} subscriptionEndsAt - ISO date string
 * @returns {number} - Days until end (rounded up)
 */
function getDaysUntilRenewal(subscriptionEndsAt) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endsAt = new Date(subscriptionEndsAt);
  const msRemaining = endsAt.getTime() - today.getTime();
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

/**
 * Send renewal reminder to a single member
 * @param {object} member - Member object with telegram_id, subscription_ends_at
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendRenewalReminder(member) {
  const { id: memberId, telegram_id: telegramId, subscription_ends_at: subscriptionEndsAt } = member;

  // Validate telegram_id exists
  if (!telegramId) {
    logger.warn('[membership:renewal-reminders] sendRenewalReminder: member has no telegram_id', { memberId });
    return {
      success: false,
      error: { code: 'NO_TELEGRAM_ID', message: 'Member does not have a telegram_id' },
    };
  }

  // Check if already sent today
  const hasResult = await hasNotificationToday(memberId, CONFIG.NOTIFICATION_TYPE);
  if (hasResult.success && hasResult.data.hasNotification) {
    logger.debug('[membership:renewal-reminders] sendRenewalReminder: already sent today', { memberId });
    return {
      success: false,
      error: { code: 'NOTIFICATION_ALREADY_SENT', message: 'Notification already sent today' },
    };
  }

  if (!hasResult.success) {
    return hasResult; // Pass through error
  }

  // Get checkout link
  const checkoutResult = getCheckoutLink();
  if (!checkoutResult.success) {
    logger.warn('[membership:renewal-reminders] sendRenewalReminder: no checkout URL', { memberId });
    return checkoutResult;
  }
  const checkoutUrl = checkoutResult.data.checkoutUrl;

  // Calculate days until renewal
  const daysUntilRenewal = getDaysUntilRenewal(subscriptionEndsAt);

  // Format message
  const message = formatRenewalReminder(member, daysUntilRenewal, checkoutUrl);

  // Send message
  const sendResult = await sendPrivateMessage(telegramId, message);

  if (!sendResult.success) {
    // USER_BLOCKED_BOT is expected - log but don't treat as failure
    if (sendResult.error?.code === 'USER_BLOCKED_BOT') {
      logger.warn('[membership:renewal-reminders] sendRenewalReminder: user blocked bot', {
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
    logger.error('[membership:renewal-reminders] sendRenewalReminder: failed to register notification', {
      memberId,
      error: registerResult.error,
    });
    // Message was sent, so return success even if registration fails
  }

  logger.info('[membership:renewal-reminders] sendRenewalReminder: success', {
    memberId,
    telegramId,
    daysUntilRenewal,
    messageId: sendResult.data.messageId,
  });

  return { success: true, data: { messageId: sendResult.data.messageId, daysUntilRenewal } };
}

/**
 * Main entry point - runs the renewal reminders job with lock
 * @returns {Promise<{success: boolean, sent?: number, skipped?: number, failed?: number, error?: string}>}
 */
async function runRenewalReminders() {
  // Prevent concurrent runs
  if (renewalRemindersRunning) {
    logger.debug('[membership:renewal-reminders] Already running, skipping');
    return { success: true, skipped: true };
  }
  renewalRemindersRunning = true;

  try {
    return await _runRenewalRemindersInternal();
  } finally {
    renewalRemindersRunning = false;
  }
}

/**
 * Internal processor - handles the actual reminder sending
 * @returns {Promise<{success: boolean, sent: number, skipped: number, failed: number}>}
 */
async function _runRenewalRemindersInternal() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  logger.info('[membership:renewal-reminders] Starting', { date: today });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Get members needing reminders
    const membersResult = await getMembersNeedingRenewalReminder();

    if (!membersResult.success) {
      logger.error('[membership:renewal-reminders] Failed to get members', {
        error: membersResult.error,
      });
      return { success: false, sent: 0, skipped: 0, failed: 0, error: membersResult.error.message };
    }

    const members = membersResult.data.members;

    if (members.length === 0) {
      logger.info('[membership:renewal-reminders] No members need reminders');
      return { success: true, sent: 0, skipped: 0, failed: 0 };
    }

    logger.info('[membership:renewal-reminders] Processing members', { count: members.length });

    // Process each member
    for (const member of members) {
      const result = await sendRenewalReminder(member);

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
    logger.info('[membership:renewal-reminders] Complete', {
      sent,
      skipped,
      failed,
      durationMs: duration,
    });

    return { success: true, sent, skipped, failed };
  } catch (err) {
    logger.error('[membership:renewal-reminders] Unexpected error', { error: err.message });
    return { success: false, sent, skipped, failed, error: err.message };
  }
}

// Run if called directly
if (require.main === module) {
  runRenewalReminders()
    .then(result => {
      logger.info('[membership:renewal-reminders] CLI result', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      logger.error('[membership:renewal-reminders] CLI failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  runRenewalReminders,
  getMembersNeedingRenewalReminder,
  sendRenewalReminder,
  getDaysUntilRenewal,
  CONFIG,
};

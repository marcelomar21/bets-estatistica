/**
 * Job: Process Inadimplente Members (Warnings + Kicks)
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * Tech-Spec: Migração MP - With grace period
 *
 * Processes:
 * - Members in grace period: sends daily kick warning
 * - Members past grace period: kicks from group
 *
 * Grace period: config.membership.gracePeriodDays (default 2 days)
 *
 * Flow:
 * 1. Payment rejected → status='inadimplente', inadimplente_at=NOW()
 * 2. Day 1-2: Daily warning notification
 * 3. Day 3+: Kicked from group
 *
 * Note: With Mercado Pago, trial expiration is handled via webhooks.
 * When MP cancels a subscription (trial not converted), the webhook
 * handler (handleSubscriptionCancelled) processes the removal.
 *
 * Run: node bot/jobs/membership/kick-expired.js
 * Schedule: 00:01 BRT daily
 */
require('dotenv').config();

const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');
const { config } = require('../../../lib/config');
const {
  sendPrivateMessage,
  getCheckoutLink,
  formatFarewellMessage,
  sendKickWarningNotification,
} = require('../../services/notificationService');
const {
  kickMemberFromGroup,
  markMemberAsRemoved,
} = require('../../services/memberService');
const { alertAdmin } = require('../../services/alertService');

// Configuration
const CONFIG = {
  // Errors that warrant immediate admin alert (won't resolve on retry)
  PERSISTENT_ERROR_CODES: ['BOT_NO_PERMISSION', 'CONFIG_MISSING'],
};

// Lock to prevent concurrent runs (in-memory, same process)
let kickExpiredRunning = false;

/**
 * Get all members marked as inadimplente (defaulted)
 * Returns all inadimplente members for processing (warnings + kicks)
 * @returns {Promise<{success: boolean, data?: {members: Array}, error?: object}>}
 */
async function getAllInadimplenteMembers() {
  try {
    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('status', 'inadimplente');

    if (error) {
      logger.error('[membership:kick-expired] getAllInadimplenteMembers: database error', {
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[membership:kick-expired] getAllInadimplenteMembers: found members', {
      count: members?.length || 0,
    });

    return { success: true, data: { members: members || [] } };
  } catch (err) {
    logger.error('[membership:kick-expired] getAllInadimplenteMembers: unexpected error', {
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Calculate days remaining in grace period for a member
 * @param {object} member - Member object with inadimplente_at
 * @returns {number} Days remaining (0 or negative means kick)
 */
function calculateDaysRemaining(member) {
  const gracePeriodDays = config.membership?.gracePeriodDays || 2;
  const inadimplenteAt = member.inadimplente_at || member.updated_at;
  const inadimplenteDate = new Date(inadimplenteAt);
  const now = new Date();

  // Calculate days since inadimplente
  const daysSinceInadimplente = Math.floor((now - inadimplenteDate) / (24 * 60 * 60 * 1000));

  // Days remaining = grace period - days since inadimplente
  return gracePeriodDays - daysSinceInadimplente;
}

/**
 * Check if member should be kicked (past grace period)
 * @param {object} member - Member object
 * @returns {boolean} true if should be kicked
 */
function shouldKickMember(member) {
  return calculateDaysRemaining(member) <= 0;
}

/**
 * Process a single member kick
 * Sends farewell message and kicks from group
 *
 * Retry Strategy:
 * - Transient errors (TELEGRAM_ERROR): Retried naturally on next daily run
 * - Persistent errors (BOT_NO_PERMISSION, CONFIG_MISSING): Alert admin immediately
 * - USER_NOT_IN_GROUP: Not an error - member already removed from group
 *
 * @param {object} member - Member object
 * @param {string} reason - 'payment_failed' or 'subscription_cancelled'
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function processMemberKick(member, reason) {
  const { id: memberId, telegram_id: telegramId, telegram_username: username } = member;

  // If no telegram_id, just mark as removed in DB
  if (!telegramId) {
    logger.warn('[membership:kick-expired] processMemberKick: member without telegram_id', {
      memberId,
    });
    const removeResult = await markMemberAsRemoved(memberId, reason);
    if (removeResult.success) {
      return { success: true, data: { skipped: true, reason: 'no_telegram_id' } };
    }
    return removeResult;
  }

  // 1. Send farewell message
  const checkoutResult = getCheckoutLink();
  if (checkoutResult.success) {
    const farewellMessage = formatFarewellMessage(member, reason, checkoutResult.data.checkoutUrl);
    const sendResult = await sendPrivateMessage(telegramId, farewellMessage);

    if (!sendResult.success && sendResult.error?.code !== 'USER_BLOCKED_BOT') {
      logger.warn('[membership:kick-expired] processMemberKick: failed to send farewell', {
        memberId,
        error: sendResult.error,
      });
      // Continue - kick is more important than farewell message
    }
  } else {
    logger.warn('[membership:kick-expired] processMemberKick: no checkout URL configured', {
      memberId,
    });
    // Continue without farewell message
  }

  // 2. Kick from group
  const chatId = config.telegram?.publicGroupId || process.env.TELEGRAM_PUBLIC_GROUP_ID;

  if (!chatId) {
    logger.error('[membership:kick-expired] processMemberKick: TELEGRAM_PUBLIC_GROUP_ID not configured');
    // Alert admin immediately - this is a persistent config error
    await alertAdmin(
      `ERRO DE CONFIGURACAO: TELEGRAM_PUBLIC_GROUP_ID nao configurado.\n\nMembro ${username ? `@${username}` : memberId} nao pode ser removido.`
    );
    return { success: false, error: { code: 'CONFIG_MISSING', message: 'Group ID not configured' } };
  }

  const kickResult = await kickMemberFromGroup(telegramId, chatId);

  if (!kickResult.success) {
    // User already not in group - just mark as removed
    if (kickResult.error?.code === 'USER_NOT_IN_GROUP') {
      logger.info('[membership:kick-expired] processMemberKick: member already not in group', {
        memberId,
        telegramId,
      });
      const removeResult = await markMemberAsRemoved(memberId, reason);
      return { success: false, error: { code: 'USER_NOT_IN_GROUP' }, data: removeResult.data };
    }

    // Alert admin immediately for persistent errors that won't resolve on retry
    if (CONFIG.PERSISTENT_ERROR_CODES.includes(kickResult.error?.code)) {
      const memberIdentifier = username ? `@${username}` : memberId;
      await alertAdmin(
        `ERRO PERSISTENTE ao remover membro: ${memberIdentifier}\n\nErro: ${kickResult.error?.code} - ${kickResult.error?.message}\n\nEste erro requer intervencao manual.`
      );
      logger.error('[membership:kick-expired] processMemberKick: persistent error', {
        memberId,
        telegramId,
        errorCode: kickResult.error?.code,
      });
    } else {
      // Transient error - will be retried on next daily run
      logger.warn('[membership:kick-expired] processMemberKick: transient error, will retry next run', {
        memberId,
        telegramId,
        errorCode: kickResult.error?.code,
      });
    }

    return { success: false, error: kickResult.error };
  }

  // 3. Mark as removed in DB
  const removeResult = await markMemberAsRemoved(memberId, reason);

  if (!removeResult.success) {
    logger.error('[membership:kick-expired] processMemberKick: kick succeeded but DB update failed', {
      memberId,
      error: removeResult.error,
      note: 'Member was kicked from Telegram. Will be marked as removed on next run.',
    });
  }

  logger.info('[membership:kick-expired] processMemberKick: member kicked successfully', {
    memberId,
    telegramId,
    reason,
    until_date: kickResult.data?.until_date,
  });

  return { success: true, data: { kicked: true, reason } };
}

/**
 * Main entry point - runs the kick expired job with lock
 * @returns {Promise<{success: boolean, kicked?: number, alreadyRemoved?: number, failed?: number, error?: string}>}
 */
async function runKickExpired() {
  // Prevent concurrent runs
  if (kickExpiredRunning) {
    logger.debug('[membership:kick-expired] Already running, skipping');
    return { success: true, skipped: true };
  }
  kickExpiredRunning = true;

  try {
    return await _runKickExpiredInternal();
  } finally {
    kickExpiredRunning = false;
  }
}

/**
 * Internal processor - handles warnings and kicks
 * - Members still in grace period: send daily warning
 * - Members past grace period: kick from group
 * @returns {Promise<{success: boolean, kicked: number, warned: number, alreadyRemoved: number, failed: number}>}
 */
async function _runKickExpiredInternal() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const gracePeriodDays = config.membership?.gracePeriodDays || 2;
  logger.info('[membership:kick-expired] Starting', { date: today, gracePeriodDays });

  let kicked = 0;
  let warned = 0;
  let alreadyRemoved = 0;
  let failed = 0;

  try {
    // Get ALL inadimplente members
    const inadimplenteResult = await getAllInadimplenteMembers();

    if (!inadimplenteResult.success) {
      logger.error('[membership:kick-expired] Failed to get inadimplente members', {
        error: inadimplenteResult.error,
      });
      return { success: false, kicked, warned, alreadyRemoved, failed, error: inadimplenteResult.error?.message };
    }

    const members = inadimplenteResult.data.members;

    if (members.length === 0) {
      logger.info('[membership:kick-expired] No inadimplente members to process');
      return { success: true, kicked, warned, alreadyRemoved, failed };
    }

    logger.info('[membership:kick-expired] Processing inadimplente members', {
      count: members.length,
    });

    for (const member of members) {
      const daysRemaining = calculateDaysRemaining(member);

      if (shouldKickMember(member)) {
        // Past grace period - KICK
        logger.info('[membership:kick-expired] Kicking member (grace period exceeded)', {
          memberId: member.id,
          daysRemaining,
          inadimplente_at: member.inadimplente_at,
        });

        const result = await processMemberKick(member, 'payment_failed');

        if (result.success) {
          kicked++;
        } else if (result.error?.code === 'USER_NOT_IN_GROUP') {
          alreadyRemoved++;
        } else {
          failed++;
        }
      } else {
        // Still in grace period - WARN
        logger.info('[membership:kick-expired] Sending warning to member', {
          memberId: member.id,
          daysRemaining,
          inadimplente_at: member.inadimplente_at,
        });

        const warnResult = await sendKickWarningNotification(member, daysRemaining);

        if (warnResult.success) {
          if (!warnResult.data?.skipped) {
            warned++;
          }
        } else {
          logger.warn('[membership:kick-expired] Failed to send warning', {
            memberId: member.id,
            error: warnResult.error,
          });
          // Don't count as failed - warning is best effort
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[membership:kick-expired] Complete', {
      kicked,
      warned,
      alreadyRemoved,
      failed,
      durationMs: duration,
    });

    return { success: true, kicked, warned, alreadyRemoved, failed };
  } catch (err) {
    logger.error('[membership:kick-expired] Unexpected error', { error: err.message });
    return { success: false, kicked, warned, alreadyRemoved, failed, error: err.message };
  }
}

// Run if called directly
if (require.main === module) {
  runKickExpired()
    .then(result => {
      logger.info('[membership:kick-expired] CLI result', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      logger.error('[membership:kick-expired] CLI failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  runKickExpired,
  getAllInadimplenteMembers,
  calculateDaysRemaining,
  shouldKickMember,
  processMemberKick,
  CONFIG,
};

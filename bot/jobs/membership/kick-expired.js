/**
 * Job: Kick Defaulted Members
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * Tech-Spec: Migração MP - Simplified
 *
 * Removes:
 * - Inadimplente members (payment failed after being active)
 *
 * Note: With Mercado Pago, trial expiration is handled via webhooks.
 * When MP cancels a subscription (trial not converted), the webhook
 * handler (handleSubscriptionCancelled) processes the removal.
 * This job only handles inadimplente members as a safety net.
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
 * Get members marked as inadimplente (defaulted)
 * These are members who had payment failures/cancellations
 * @returns {Promise<{success: boolean, data?: {members: Array}, error?: object}>}
 */
async function getInadimplenteMembers() {
  try {
    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('status', 'inadimplente');

    if (error) {
      logger.error('[membership:kick-expired] getInadimplenteMembers: database error', {
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[membership:kick-expired] getInadimplenteMembers: found members', {
      count: members?.length || 0,
    });

    return { success: true, data: { members: members || [] } };
  } catch (err) {
    logger.error('[membership:kick-expired] getInadimplenteMembers: unexpected error', {
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
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
 * Internal processor - handles the actual kick processing
 * @returns {Promise<{success: boolean, kicked: number, alreadyRemoved: number, failed: number}>}
 */
async function _runKickExpiredInternal() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  logger.info('[membership:kick-expired] Starting', { date: today });

  let kicked = 0;
  let alreadyRemoved = 0;
  let failed = 0;

  try {
    // Process inadimplente members (payment failures after being active)
    // Note: Trial expirations are now handled via MP webhook (subscription_cancelled)
    const inadimplenteResult = await getInadimplenteMembers();

    if (inadimplenteResult.success && inadimplenteResult.data.members.length > 0) {
      logger.info('[membership:kick-expired] Processing inadimplente members', {
        count: inadimplenteResult.data.members.length,
      });

      for (const member of inadimplenteResult.data.members) {
        const result = await processMemberKick(member, 'payment_failed');

        if (result.success) {
          kicked++;
        } else if (result.error?.code === 'USER_NOT_IN_GROUP') {
          alreadyRemoved++;
        } else {
          failed++;
        }
      }
    } else {
      logger.info('[membership:kick-expired] No inadimplente members to process');
    }

    const duration = Date.now() - startTime;
    logger.info('[membership:kick-expired] Complete', {
      kicked,
      alreadyRemoved,
      failed,
      durationMs: duration,
    });

    return { success: true, kicked, alreadyRemoved, failed };
  } catch (err) {
    logger.error('[membership:kick-expired] Unexpected error', { error: err.message });
    return { success: false, kicked, alreadyRemoved, failed, error: err.message };
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
  getInadimplenteMembers,
  processMemberKick,
  CONFIG,
};

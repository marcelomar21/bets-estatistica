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
const { registerMemberEvent } = require('../../handlers/memberEvents');

// Configuration
const CONFIG = {
  // Errors that warrant immediate admin alert (won't resolve on retry)
  PERSISTENT_ERROR_CODES: ['BOT_NO_PERMISSION', 'CONFIG_MISSING'],
};

// Lock to prevent concurrent runs (in-memory, same process)
let kickExpiredRunning = false;

/**
 * Resolve group data from database by group ID
 * Story 4.5: Multi-tenant group resolution for kick job
 * @param {string} groupId - UUID of the group
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function resolveGroupData(groupId) {
  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, name, telegram_group_id, checkout_url, status')
      .eq('id', groupId)
      .single();

    if (error || !group) {
      logger.error('[membership:kick-expired] resolveGroupData: group not found', {
        groupId,
        error: error?.message,
      });
      return { success: false, error: { code: 'GROUP_NOT_FOUND', message: `Group ${groupId} not found` } };
    }

    return { success: true, data: group };
  } catch (err) {
    logger.error('[membership:kick-expired] resolveGroupData: unexpected error', {
      groupId,
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get all members marked as inadimplente (defaulted)
 * Returns all inadimplente members for processing (warnings + kicks)
 * Story 4.5: Filters by group_id when GROUP_ID is configured (multi-tenant)
 * @returns {Promise<{success: boolean, data?: {members: Array}, error?: object}>}
 */
async function getAllInadimplenteMembers() {
  try {
    const groupId = config.membership?.groupId;

    let query = supabase
      .from('members')
      .select('*')
      .eq('status', 'inadimplente');

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data: members, error } = await query;

    if (error) {
      logger.error('[membership:kick-expired] getAllInadimplenteMembers: database error', {
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[membership:kick-expired] getAllInadimplenteMembers: found members', {
      count: members?.length || 0,
      groupId: groupId || 'all (single-tenant)',
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
 * Resolve chat ID for kick operation
 * Multi-tenant mode (GROUP_ID set): requires group.telegram_group_id from DB
 * Single-tenant mode: falls back to config.telegram.publicGroupId
 * @param {object|null} groupData - Resolved group data from DB
 * @returns {{success: boolean, data?: {chatId: string|number}, error?: object}}
 */
function resolveKickChatId(groupData) {
  const configuredGroupId = config.membership?.groupId || null;
  const isMultiTenant = Boolean(configuredGroupId);

  if (groupData?.telegram_group_id) {
    return { success: true, data: { chatId: groupData.telegram_group_id } };
  }

  if (!isMultiTenant) {
    const fallbackChatId = config.telegram?.publicGroupId || process.env.TELEGRAM_PUBLIC_GROUP_ID;
    if (fallbackChatId) {
      return { success: true, data: { chatId: fallbackChatId } };
    }
  }

  return {
    success: false,
    error: {
      code: 'GROUP_CHAT_ID_MISSING',
      message: isMultiTenant
        ? `Missing telegram_group_id for GROUP_ID=${configuredGroupId}`
        : 'Group ID not configured',
    },
  };
}

/**
 * Register kick audit event and return normalized result
 * @param {string} memberId - Internal member UUID
 * @param {string} reason - Kick reason
 * @param {object|null} groupData - Resolved group data
 * @param {object} extraPayload - Additional audit fields
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function registerKickAuditEvent(memberId, reason, groupData, extraPayload = {}) {
  const eventPayload = {
    reason,
    groupId: groupData?.id || config.membership?.groupId || null,
    groupName: groupData?.name || null,
    ...extraPayload,
  };

  const eventResult = await registerMemberEvent(memberId, 'kick', eventPayload);
  if (!eventResult?.success) {
    logger.error('[membership:kick-expired] processMemberKick: failed to register audit event', {
      memberId,
      reason,
      groupId: eventPayload.groupId,
      error: eventResult?.error,
    });
    return {
      success: false,
      error: eventResult?.error || { code: 'AUDIT_LOG_FAILED', message: 'Failed to register kick audit event' },
    };
  }

  return { success: true };
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
 * @param {object} [groupData] - Resolved group data (multi-tenant). If null, falls back to single-tenant config.
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function processMemberKick(member, reason, groupData) {
  const { id: memberId, telegram_id: telegramId, telegram_username: username } = member;
  const configuredGroupId = config.membership?.groupId || null;

  // If no telegram_id, just mark as removed in DB
  if (!telegramId) {
    logger.warn('[membership:kick-expired] processMemberKick: member without telegram_id', {
      memberId,
    });
    const removeResult = await markMemberAsRemoved(memberId, reason);
    if (!removeResult.success) {
      return removeResult;
    }

    const auditResult = await registerKickAuditEvent(memberId, reason, groupData, {
      skipped: true,
      skippedReason: 'no_telegram_id',
    });
    if (!auditResult.success) {
      return { success: false, error: auditResult.error };
    }

    return { success: true, data: { skipped: true, reason: 'no_telegram_id' } };
  }

  // 1. Resolve chat ID for kick
  const chatResult = resolveKickChatId(groupData);
  if (!chatResult.success) {
    logger.error('[membership:kick-expired] processMemberKick: no group chat ID available', {
      memberId,
      configuredGroupId,
      hasGroupData: Boolean(groupData),
    });
    await alertAdmin(
      `ERRO DE CONFIGURACAO: Nenhum group chat ID disponivel.\n\nMembro ${username ? `@${username}` : memberId} nao pode ser removido.\nGROUP_ID: ${configuredGroupId || 'n/a'}`
    );
    return { success: false, error: chatResult.error };
  }
  const chatId = chatResult.data.chatId;

  // 2. Send farewell message (best effort)
  // Story 4.5: Use group's checkout_url (multi-tenant) or fall back to config
  const checkoutUrl = groupData?.checkout_url || null;
  const fallbackResult = !checkoutUrl ? getCheckoutLink() : null;
  const effectiveCheckoutUrl = checkoutUrl || (fallbackResult?.success ? fallbackResult.data.checkoutUrl : null);

  if (effectiveCheckoutUrl) {
    const farewellMessage = formatFarewellMessage(member, reason, effectiveCheckoutUrl);
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

  // 3. Kick from group

  const kickResult = await kickMemberFromGroup(telegramId, chatId);

  if (!kickResult.success) {
    // User already not in group - just mark as removed
    if (kickResult.error?.code === 'USER_NOT_IN_GROUP') {
      logger.info('[membership:kick-expired] processMemberKick: member already not in group', {
        memberId,
        telegramId,
      });
      const removeResult = await markMemberAsRemoved(memberId, reason);
      if (!removeResult.success) {
        logger.error('[membership:kick-expired] processMemberKick: failed to mark already-removed member in DB', {
          memberId,
          error: removeResult.error,
        });
        return { success: false, error: removeResult.error };
      }

      const auditResult = await registerKickAuditEvent(memberId, reason, groupData, {
        alreadyNotInGroup: true,
      });
      if (!auditResult.success) {
        return { success: false, error: auditResult.error };
      }

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

  // 4. Mark as removed in DB
  const removeResult = await markMemberAsRemoved(memberId, reason);

  if (!removeResult.success) {
    logger.error('[membership:kick-expired] processMemberKick: kick succeeded but DB update failed', {
      memberId,
      error: removeResult.error,
      note: 'Member was kicked from Telegram but not marked as removed.',
    });
    await alertAdmin(
      `ERRO CRITICO: membro kickado no Telegram mas nao atualizado no banco.\n\nMembro: ${username ? `@${username}` : memberId}\nErro: ${removeResult.error?.code || 'UNKNOWN'}`
    );
    return {
      success: false,
      error: {
        code: 'REMOVE_AFTER_KICK_FAILED',
        message: removeResult.error?.message || 'Failed to mark member as removed after successful kick',
      },
    };
  }

  // 5. Audit log (Story 4.5: AC1)
  const auditResult = await registerKickAuditEvent(memberId, reason, groupData, {
    untilDate: kickResult.data?.until_date || null,
  });
  if (!auditResult.success) {
    await alertAdmin(
      `ERRO DE AUDITORIA: kick executado, mas evento nao foi registrado.\n\nMembro: ${username ? `@${username}` : memberId}`
    );
    return { success: false, error: auditResult.error };
  }

  logger.info('[membership:kick-expired] processMemberKick: member kicked successfully', {
    memberId,
    telegramId,
    reason,
    groupId: groupData?.id || null,
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
  const groupId = config.membership?.groupId;
  logger.info('[membership:kick-expired] Starting', { date: today, gracePeriodDays, groupId: groupId || 'single-tenant' });

  let kicked = 0;
  let warned = 0;
  let alreadyRemoved = 0;
  let failed = 0;
  let blockedByMissingGroup = 0;

  try {
    // Story 4.5: Resolve group data for multi-tenant
    let groupData = null;
    let groupResolutionFailed = false;
    if (groupId) {
      const groupResult = await resolveGroupData(groupId);
      if (!groupResult.success) {
        groupResolutionFailed = true;
        logger.error('[membership:kick-expired] Failed to resolve group, aborting', {
          groupId,
          error: groupResult.error,
        });
        await alertAdmin(
          `ERRO: Grupo ${groupId} nao encontrado no banco.\n\nJob kick-expired abortado. Verifique a configuracao GROUP_ID.`
        );
      } else {
        groupData = groupResult.data;
        logger.info('[membership:kick-expired] Group resolved', {
          groupId: groupData.id,
          groupName: groupData.name,
          telegramGroupId: groupData.telegram_group_id,
        });
      }
    }

    // Get inadimplente members (filtered by group_id if multi-tenant)
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
      return {
        success: !groupResolutionFailed,
        kicked,
        warned,
        alreadyRemoved,
        failed,
        blockedByMissingGroup,
        error: groupResolutionFailed ? `Failed to resolve group ${groupId}` : undefined,
      };
    }

    logger.info('[membership:kick-expired] Processing inadimplente members', {
      count: members.length,
      groupId: groupId || 'all',
    });

    for (const member of members) {
      const daysRemaining = calculateDaysRemaining(member);

      if (shouldKickMember(member)) {
        if (groupId && !groupData) {
          blockedByMissingGroup++;
          failed++;
          logger.error('[membership:kick-expired] Cannot kick member: group could not be resolved', {
            memberId: member.id,
            configuredGroupId: groupId,
          });
          continue;
        }

        // Past grace period - KICK
        logger.info('[membership:kick-expired] Kicking member (grace period exceeded)', {
          memberId: member.id,
          daysRemaining,
          inadimplente_at: member.inadimplente_at,
        });

        const result = await processMemberKick(member, 'payment_failed', groupData);

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
      blockedByMissingGroup,
      durationMs: duration,
    });

    return {
      success: !groupResolutionFailed,
      kicked,
      warned,
      alreadyRemoved,
      failed,
      blockedByMissingGroup,
      error: groupResolutionFailed ? `Failed to resolve group ${groupId}` : undefined,
    };
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
  resolveGroupData,
  getAllInadimplenteMembers,
  calculateDaysRemaining,
  shouldKickMember,
  processMemberKick,
  CONFIG,
};

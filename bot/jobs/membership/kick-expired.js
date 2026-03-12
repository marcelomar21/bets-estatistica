/**
 * Job: Process Inadimplente Members (Warnings + Kicks)
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * Tech-Spec: Migração MP - With grace period
 *
 * Multi-tenant: iterates over all registered bots, processes each group's
 * members using the correct bot instance and group-specific config.
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
 * Run: node bot/jobs/membership/kick-expired.js
 * Schedule: 00:01 BRT daily
 */
require('dotenv').config();

const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');
const { config } = require('../../../lib/config');
const { getConfig } = require('../../lib/configHelper');
const { getAllBots } = require('../../telegram');
const {
  sendPrivateMessage,
  formatFarewellMessage,
  sendKickWarningNotification,
} = require('../../services/notificationService');
const {
  kickMemberFromGroup,
  markMemberAsRemoved,
} = require('../../services/memberService');
const { alertAdmin } = require('../../services/alertService');
const { registerMemberEvent } = require('../../handlers/memberEvents');
const { sendDM: channelSendDM } = require('../../../lib/channelAdapter');
const { phoneToJid } = require('../../../lib/phoneUtils');
const { resolveGroupClient, revokeInviteLink } = require('../../../whatsapp/services/inviteLinkService');

// Configuration
const CONFIG = {
  // Errors that warrant immediate admin alert (won't resolve on retry)
  PERSISTENT_ERROR_CODES: ['BOT_NO_PERMISSION', 'CONFIG_MISSING'],
};

// Lock to prevent concurrent runs (in-memory, same process)
let kickExpiredRunning = false;

/**
 * Resolve group data from database by group ID
 * @param {string} groupId - UUID of the group
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function resolveGroupData(groupId) {
  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, name, telegram_group_id, whatsapp_group_jid, checkout_url, operator_username, subscription_price, status')
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
 * @param {string} [groupId] - Group UUID to filter by (multi-tenant)
 * @returns {Promise<{success: boolean, data?: {members: Array}, error?: object}>}
 */
async function getAllInadimplenteMembers(groupId = null) {
  try {
    let query = supabase
      .from('members')
      .select('*')
      .eq('status', 'inadimplente')
      .eq('is_admin', false);

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
      groupId: groupId || 'all',
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
 * Get trial members whose trial has expired
 * @param {string} [groupId] - Group UUID to filter by (multi-tenant)
 * @returns {Promise<{success: boolean, data?: {members: Array}, error?: object}>}
 */
async function getExpiredTrialMembers(groupId = null) {
  try {
    let query = supabase
      .from('members')
      .select('*')
      .eq('status', 'trial')
      .eq('is_admin', false)
      .not('trial_ends_at', 'is', null)
      .lte('trial_ends_at', new Date().toISOString());

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data: members, error } = await query;

    if (error) {
      logger.error('[membership:kick-expired] getExpiredTrialMembers: database error', {
        error: error.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[membership:kick-expired] getExpiredTrialMembers: found members', {
      count: members?.length || 0,
      groupId: groupId || 'all',
    });

    return { success: true, data: { members: members || [] } };
  } catch (err) {
    logger.error('[membership:kick-expired] getExpiredTrialMembers: unexpected error', {
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

  const daysSinceInadimplente = Math.floor((now - inadimplenteDate) / (24 * 60 * 60 * 1000));
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
 * @param {object|null} groupData - Resolved group data from DB
 * @param {object|null} botCtx - BotContext with publicGroupId
 * @returns {{success: boolean, data?: {chatId: string|number}, error?: object}}
 */
function resolveKickChatId(groupData, botCtx = null) {
  if (groupData?.telegram_group_id) {
    return { success: true, data: { chatId: groupData.telegram_group_id } };
  }

  if (botCtx?.publicGroupId) {
    return { success: true, data: { chatId: botCtx.publicGroupId } };
  }

  return {
    success: false,
    error: {
      code: 'GROUP_CHAT_ID_MISSING',
      message: 'No Telegram group chat ID available for kick (groupData and botCtx both missing)',
    },
  };
}

/**
 * Register kick audit event
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
 * @param {object} member - Member object
 * @param {string} reason - 'payment_failed' or 'trial_expired'
 * @param {object} [groupData] - Resolved group data
 * @param {object} [botInstance] - Bot instance for multi-tenant
 * @param {object} [botCtx] - Full BotContext for resolving chat ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function processMemberKick(member, reason, groupData, botInstance = null, botCtx = null) {
  const channel = member.channel || 'telegram';

  // Route to channel-specific kick flow
  if (channel === 'whatsapp') {
    return _processWhatsAppKick(member, reason, groupData);
  }
  return _processTelegramKick(member, reason, groupData, botInstance, botCtx);
}

/**
 * WhatsApp-specific kick flow (Story 15-4)
 * 1. Send farewell DM via channelAdapter
 * 2. Remove from WhatsApp group via Baileys
 * 3. Mark as removed in DB
 * 4. Revoke invite link
 * 5. Register audit event
 */
async function _processWhatsAppKick(member, reason, groupData) {
  const { id: memberId, channel_user_id: phone } = member;
  const groupId = member.group_id || groupData?.id;

  if (!phone) {
    logger.warn('[membership:kick-expired] WhatsApp kick: member without channel_user_id', { memberId });
    const removeResult = await markMemberAsRemoved(memberId, reason);
    if (!removeResult.success) return removeResult;
    await registerKickAuditEvent(memberId, reason, groupData, { skipped: true, skippedReason: 'no_channel_user_id' });
    return { success: true, data: { skipped: true, reason: 'no_channel_user_id' } };
  }

  // 1. Send farewell DM (best effort)
  const checkoutUrl = groupData?.checkout_url || '';
  const groupName = groupData?.name || 'Guru da Bet';
  let farewellText = `Ola! Infelizmente seu acesso ao grupo *${groupName}* foi encerrado`;
  if (reason === 'trial_expired') {
    farewellText += ' pois o periodo de trial expirou.';
  } else {
    farewellText += ' por inadimplencia.';
  }
  if (checkoutUrl) {
    farewellText += `\n\nPara voltar, assine aqui:\n${checkoutUrl}`;
  }

  const dmResult = await channelSendDM(phone, farewellText, { channel: 'whatsapp', groupId });
  if (!dmResult.success) {
    logger.warn('[membership:kick-expired] WhatsApp farewell DM failed (non-blocking)', {
      memberId, phone, error: dmResult.error,
    });
  }

  // 2. Remove from WhatsApp group
  const resolved = await resolveGroupClient(groupId);
  if (resolved.error) {
    logger.error('[membership:kick-expired] WhatsApp kick: cannot resolve client', {
      memberId, groupId, error: resolved.error,
    });
    return { success: false, error: resolved.error };
  }

  const { client, groupJid } = resolved;
  const participantJid = phoneToJid(phone);
  const kickResult = await client.removeGroupParticipant(groupJid, participantJid);

  if (!kickResult.success) {
    logger.warn('[membership:kick-expired] WhatsApp kick: removeGroupParticipant failed, will retry next run', {
      memberId, phone, groupJid, error: kickResult.error,
    });
    return { success: false, error: kickResult.error };
  }

  // 3. Mark as removed in DB
  const removeResult = await markMemberAsRemoved(memberId, reason);
  if (!removeResult.success) {
    logger.error('[membership:kick-expired] WhatsApp kick: DB update failed after kick', {
      memberId, error: removeResult.error,
    });
    return { success: false, error: removeResult.error };
  }

  // 4. Revoke invite link (so kicked member can't rejoin with old link)
  const revokeResult = await revokeInviteLink(groupId);
  if (!revokeResult.success) {
    logger.warn('[membership:kick-expired] WhatsApp kick: invite revocation failed (non-blocking)', {
      memberId, groupId, error: revokeResult.error,
    });
    // Non-blocking — kick already succeeded
  }

  // 5. Audit log
  await registerKickAuditEvent(memberId, reason, groupData, {
    channel: 'whatsapp',
    phone,
    inviteRevoked: revokeResult?.success || false,
  });

  logger.info('[membership:kick-expired] WhatsApp member kicked successfully', {
    memberId, phone, reason, groupId, inviteRevoked: revokeResult?.success || false,
  });

  return { success: true, data: { kicked: true, reason, channel: 'whatsapp' } };
}

/**
 * Telegram-specific kick flow (existing logic, extracted)
 */
async function _processTelegramKick(member, reason, groupData, botInstance, botCtx) {
  const { id: memberId, telegram_id: telegramId, telegram_username: username } = member;

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
  const chatResult = resolveKickChatId(groupData, botCtx);
  if (!chatResult.success) {
    logger.error('[membership:kick-expired] processMemberKick: no group chat ID available', {
      memberId,
      hasGroupData: Boolean(groupData),
    });
    await alertAdmin(
      `ERRO DE CONFIGURACAO: Nenhum group chat ID disponivel.\n\nMembro ${username ? `@${username}` : memberId} nao pode ser removido.`
    );
    return { success: false, error: chatResult.error };
  }
  const chatId = chatResult.data.chatId;

  // 2. Send farewell message (best effort)
  // NOTE: No global config fallback — group-specific checkout URL only (multi-tenant safety)
  const groupConfig = botCtx?.groupConfig || null;
  const effectiveCheckoutUrl = groupData?.checkout_url || groupConfig?.checkoutUrl || null;

  if (effectiveCheckoutUrl) {
    const farewellMessage = formatFarewellMessage(member, reason, effectiveCheckoutUrl, groupConfig);
    const sendResult = await sendPrivateMessage(telegramId, farewellMessage, 'Markdown', botInstance);

    if (!sendResult.success && sendResult.error?.code !== 'USER_BLOCKED_BOT') {
      logger.warn('[membership:kick-expired] processMemberKick: failed to send farewell', {
        memberId,
        error: sendResult.error,
      });
    }
  } else {
    logger.warn('[membership:kick-expired] processMemberKick: no checkout URL configured', {
      memberId,
    });
  }

  // 3. Kick from group
  const kickResult = await kickMemberFromGroup(telegramId, chatId, botInstance);

  if (!kickResult.success) {
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

  // 5. Audit log
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
async function runKickExpired(botCtx = null) {
  if (kickExpiredRunning) {
    logger.debug('[membership:kick-expired] Already running, skipping');
    return { success: true, skipped: true };
  }
  kickExpiredRunning = true;

  try {
    return await _runKickExpiredInternal(botCtx);
  } finally {
    kickExpiredRunning = false;
  }
}

/**
 * Process a single group's expired and inadimplente members
 * @param {string} groupId - Group UUID
 * @param {object} botCtx - BotContext for this group
 * @param {string} trialMode - Current TRIAL_MODE value
 * @returns {Promise<{kicked: number, warned: number, alreadyRemoved: number, failed: number}>}
 */
async function _processGroup(groupId, botCtx, trialMode) {
  let kicked = 0;
  let warned = 0;
  let alreadyRemoved = 0;
  let failed = 0;
  const groupName = botCtx.groupConfig?.name || groupId;

  // Resolve group data from DB (includes checkout_url, operator_username, etc.)
  const groupResult = await resolveGroupData(groupId);
  let groupData = null;
  if (!groupResult.success) {
    logger.error('[membership:kick-expired] Failed to resolve group', { groupId, groupName, error: groupResult.error });
    return { kicked, warned, alreadyRemoved, failed: 1 };
  }
  groupData = groupResult.data;

  // Process expired trial members when TRIAL_MODE='internal'
  if (trialMode === 'internal') {
    const trialResult = await getExpiredTrialMembers(groupId);

    if (trialResult.success && trialResult.data.members.length > 0) {
      const trialMembers = trialResult.data.members;
      logger.info('[membership:kick-expired] Processing expired trial members', {
        count: trialMembers.length,
        groupId,
        groupName,
      });

      for (const member of trialMembers) {
        const result = await processMemberKick(member, 'trial_expired', groupData, botCtx.bot, botCtx);

        if (result.success) {
          kicked++;
        } else if (result.error?.code === 'USER_NOT_IN_GROUP') {
          alreadyRemoved++;
        } else {
          failed++;
        }
      }
    } else if (!trialResult.success) {
      logger.error('[membership:kick-expired] Failed to get expired trial members', {
        error: trialResult.error,
        groupId,
      });
    }
  }

  // Process inadimplente members
  const inadimplenteResult = await getAllInadimplenteMembers(groupId);

  if (!inadimplenteResult.success) {
    logger.error('[membership:kick-expired] Failed to get inadimplente members', {
      error: inadimplenteResult.error,
      groupId,
    });
    return { kicked, warned, alreadyRemoved, failed: failed + 1 };
  }

  const members = inadimplenteResult.data.members;

  for (const member of members) {
    const daysRemaining = calculateDaysRemaining(member);

    if (shouldKickMember(member)) {
      logger.info('[membership:kick-expired] Kicking member (grace period exceeded)', {
        memberId: member.id,
        daysRemaining,
        groupId,
      });

      const result = await processMemberKick(member, 'payment_failed', groupData, botCtx.bot, botCtx);

      if (result.success) {
        kicked++;
      } else if (result.error?.code === 'USER_NOT_IN_GROUP') {
        alreadyRemoved++;
      } else {
        failed++;
      }
    } else {
      logger.info('[membership:kick-expired] Sending warning to member', {
        memberId: member.id,
        daysRemaining,
        groupId,
      });

      const groupConfig = botCtx.groupConfig || null;
      const warnResult = await sendKickWarningNotification(member, daysRemaining, groupConfig, botCtx.bot);

      if (warnResult.success) {
        if (!warnResult.data?.skipped) {
          warned++;
        }
      } else {
        logger.warn('[membership:kick-expired] Failed to send warning', {
          memberId: member.id,
          error: warnResult.error,
        });
      }
    }
  }

  return { kicked, warned, alreadyRemoved, failed };
}

/**
 * Internal processor - iterates over all groups
 * @returns {Promise<{success: boolean, kicked: number, warned: number, alreadyRemoved: number, failed: number}>}
 */
async function _runKickExpiredInternal(botCtx = null) {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const gracePeriodDays = config.membership?.gracePeriodDays || 2;
  logger.info('[membership:kick-expired] Starting', { date: today, gracePeriodDays });

  let kicked = 0;
  let warned = 0;
  let alreadyRemoved = 0;
  let failed = 0;

  try {
    const trialMode = await getConfig('TRIAL_MODE', 'mercadopago');

    // Multi-tenant: iterate over all registered bots
    const allBots = getAllBots();

    if (allBots.size === 0) {
      logger.warn('[membership:kick-expired] No bots registered in registry');
      return { success: true, kicked, warned, alreadyRemoved, failed };
    }

    for (const [groupId, groupBotCtx] of allBots) {
      const groupName = groupBotCtx.groupConfig?.name || groupId;
      logger.debug('[membership:kick-expired] Processing group', { groupId, groupName });

      const result = await _processGroup(groupId, groupBotCtx, trialMode);

      kicked += result.kicked;
      warned += result.warned;
      alreadyRemoved += result.alreadyRemoved;
      failed += result.failed;
    }

    const duration = Date.now() - startTime;
    logger.info('[membership:kick-expired] Complete', {
      kicked,
      warned,
      alreadyRemoved,
      failed,
      groupsProcessed: allBots.size,
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
  resolveGroupData,
  getAllInadimplenteMembers,
  getExpiredTrialMembers,
  calculateDaysRemaining,
  shouldKickMember,
  processMemberKick,
  CONFIG,
};

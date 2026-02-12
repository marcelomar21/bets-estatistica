/**
 * Job: Sync Group Members - Periodic sync between Telegram group and local DB
 *
 * Compares members in the Telegram group (via getChatAdministrators + getChatMember)
 * with members in the Supabase `members` table. Creates missing members, detects
 * members who left the group, and logs discrepancies.
 *
 * Run: node bot/jobs/membership/sync-group-members.js
 * Schedule: Every 30 minutes
 */
require('dotenv').config();

const logger = require('../../../lib/logger');
const { sleep } = require('../../../lib/utils');
const { config } = require('../../../lib/config');
const { supabase } = require('../../../lib/supabase');
const { getBot } = require('../../telegram');

const JOB_NAME = 'membership:sync-group-members';
const RATE_LIMIT_MS = 100; // 10 req/s — same as reconciliation.js

// Lock to prevent concurrent runs
let syncRunning = false;

/**
 * Normalize Telegram group ID to supergroup format (-100{id}).
 * @param {number|string} id - Telegram group ID
 * @returns {string} Normalized chat ID
 */
function normalizeChatId(id) {
  const numId = Number(id);
  if (numId > 0) {
    return `-100${numId}`;
  }
  return String(numId);
}

/**
 * Resolve the group's chat ID and group UUID.
 * Uses GROUP_ID env var (multi-tenant) or falls back to config.
 * @returns {Promise<{groupId: string|null, chatId: string|null}>}
 */
async function resolveGroup() {
  const groupId = config.membership.groupId || null;

  if (groupId) {
    // Multi-tenant: fetch from DB
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, telegram_group_id')
      .eq('id', groupId)
      .single();

    if (error || !group || !group.telegram_group_id) {
      logger.error(`[${JOB_NAME}] Could not resolve group from DB`, {
        groupId,
        error: error?.message,
      });
      return { groupId: null, chatId: null };
    }

    return {
      groupId: group.id,
      chatId: normalizeChatId(group.telegram_group_id),
    };
  }

  // Single-tenant fallback: use config
  const chatId = config.telegram.publicGroupId;
  if (!chatId) {
    logger.error(`[${JOB_NAME}] No group configured (GROUP_ID or TELEGRAM_PUBLIC_GROUP_ID)`);
    return { groupId: null, chatId: null };
  }

  return { groupId: null, chatId: normalizeChatId(chatId) };
}

/**
 * Check a single user's membership status in the Telegram group.
 * @param {object} bot - Telegram bot instance
 * @param {string} chatId - Telegram chat ID
 * @param {number} telegramId - User's Telegram ID
 * @returns {Promise<{inGroup: boolean, status: string|null}>}
 */
async function checkTelegramMembership(bot, chatId, telegramId) {
  try {
    const chatMember = await bot.getChatMember(chatId, telegramId);
    const status = chatMember.status;
    const inGroup = ['member', 'administrator', 'creator', 'restricted'].includes(status);
    return { inGroup, status };
  } catch (err) {
    if (
      err.message?.includes('user not found') ||
      err.message?.includes('PARTICIPANT_ID_INVALID') ||
      err.message?.includes('Bad Request: user not found')
    ) {
      return { inGroup: false, status: 'not_found' };
    }
    logger.warn(`[${JOB_NAME}] getChatMember error`, {
      telegramId,
      error: err.message,
    });
    return { inGroup: false, status: 'error' };
  }
}

/**
 * Main sync function.
 * 1. Fetch admins from Telegram
 * 2. For each non-bot admin, ensure they exist in DB
 * 3. For each active/trial member in DB, verify they're still in the group
 * @returns {Promise<object>} Sync results
 */
async function runSyncGroupMembers() {
  if (syncRunning) {
    logger.debug(`[${JOB_NAME}] Already running, skipping`);
    return { success: true, skipped: true };
  }

  syncRunning = true;

  try {
    return await _runSyncInternal();
  } finally {
    syncRunning = false;
  }
}

async function _runSyncInternal() {
  const bot = getBot();
  if (!bot) {
    logger.error(`[${JOB_NAME}] Bot not initialized`);
    return { success: false, error: 'Bot not initialized' };
  }

  const { groupId, chatId } = await resolveGroup();
  if (!chatId) {
    return { success: false, error: 'No group configured' };
  }

  logger.info(`[${JOB_NAME}] Starting sync`, { groupId, chatId });

  // Step 1: Get admins from Telegram
  let admins;
  try {
    admins = await bot.getChatAdministrators(chatId);
  } catch (err) {
    logger.error(`[${JOB_NAME}] getChatAdministrators failed`, {
      chatId,
      error: err.message,
    });
    return { success: false, error: `getChatAdministrators failed: ${err.message}` };
  }

  const humanAdmins = admins.filter((m) => !m.user.is_bot);
  logger.info(`[${JOB_NAME}] Found ${humanAdmins.length} human admins in Telegram`);

  const created = [];
  const updatedJoin = [];
  const skippedAdmins = [];

  // Step 2: Ensure each admin exists in DB
  for (const admin of humanAdmins) {
    const telegramId = admin.user.id;
    const username = admin.user.username || null;

    // Build query with optional group filter
    let query = supabase
      .from('members')
      .select('id, joined_group_at')
      .eq('telegram_id', telegramId);

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data: existing } = await query.maybeSingle();

    if (!existing) {
      // Create new member
      const insertData = {
        telegram_id: telegramId,
        telegram_username: username,
        status: 'ativo',
        joined_group_at: new Date().toISOString(),
      };
      if (groupId) {
        insertData.group_id = groupId;
      }

      const { error: insertError } = await supabase
        .from('members')
        .insert(insertData);

      if (insertError) {
        logger.warn(`[${JOB_NAME}] Insert failed`, { telegramId, error: insertError.message });
        skippedAdmins.push({ telegram_id: telegramId, username, reason: insertError.message });
      } else {
        created.push({ telegram_id: telegramId, username });
        logger.info(`[${JOB_NAME}] Created member`, { telegramId, username });
      }
    } else if (!existing.joined_group_at) {
      // Update joined_group_at
      const { error: updateError } = await supabase
        .from('members')
        .update({
          joined_group_at: new Date().toISOString(),
          telegram_username: username,
        })
        .eq('id', existing.id);

      if (updateError) {
        logger.warn(`[${JOB_NAME}] Update joined_group_at failed`, { telegramId, error: updateError.message });
        skippedAdmins.push({ telegram_id: telegramId, username, reason: updateError.message });
      } else {
        updatedJoin.push({ telegram_id: telegramId, username });
      }
    } else {
      skippedAdmins.push({ telegram_id: telegramId, username, reason: 'already_synced' });
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Step 3: Check active/trial members in DB against Telegram
  let dbQuery = supabase
    .from('members')
    .select('id, telegram_id, telegram_username, status')
    .in('status', ['ativo', 'trial'])
    .not('telegram_id', 'is', null);

  if (groupId) {
    dbQuery = dbQuery.eq('group_id', groupId);
  }

  const { data: activeMembers, error: dbError } = await dbQuery;

  if (dbError) {
    logger.error(`[${JOB_NAME}] Failed to fetch active members from DB`, { error: dbError.message });
    return {
      success: true,
      partial: true,
      created,
      updated_join: updatedJoin,
      skipped_admins: skippedAdmins,
      error: `DB query failed: ${dbError.message}`,
    };
  }

  const leftGroup = [];
  let checked = 0;

  for (const member of (activeMembers || [])) {
    const { inGroup, status } = await checkTelegramMembership(bot, chatId, member.telegram_id);

    if (!inGroup && status !== 'error') {
      leftGroup.push({
        member_id: member.id,
        telegram_id: member.telegram_id,
        username: member.telegram_username,
        telegram_status: status,
        db_status: member.status,
      });

      logger.warn(`[${JOB_NAME}] Member not in group`, {
        memberId: member.id,
        telegramId: member.telegram_id,
        telegramStatus: status,
        dbStatus: member.status,
      });
    }

    checked++;
    if (checked % 100 === 0) {
      logger.info(`[${JOB_NAME}] Checked ${checked}/${activeMembers.length} members`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  const result = {
    success: true,
    created: created.length,
    updated_join: updatedJoin.length,
    skipped_admins: skippedAdmins.length,
    active_members_checked: checked,
    left_group: leftGroup.length,
    left_group_details: leftGroup,
  };

  logger.info(`[${JOB_NAME}] Sync complete`, {
    created: result.created,
    updatedJoin: result.updated_join,
    skippedAdmins: result.skipped_admins,
    checked: result.active_members_checked,
    leftGroup: result.left_group,
  });

  return result;
}

module.exports = { runSyncGroupMembers };

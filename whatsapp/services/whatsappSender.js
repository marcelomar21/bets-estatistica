/**
 * WhatsApp message sender service.
 * Resolves the active BaileyClient for a group and sends messages
 * through the rate limiter.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { getClient } = require('../clientRegistry');
const { RateLimiter } = require('./rateLimiter');
const { phoneToJid, validateE164 } = require('../../lib/phoneUtils');

// One rate limiter per number, keyed by numberId
const rateLimiters = new Map();

/**
 * Get or create a rate limiter for a given number.
 * @param {string} numberId
 * @returns {RateLimiter}
 */
function getRateLimiter(numberId) {
  if (!rateLimiters.has(numberId)) {
    rateLimiters.set(numberId, new RateLimiter());
  }
  return rateLimiters.get(numberId);
}

/**
 * Get the active BaileyClient for a group by looking up the active number.
 * @param {string} groupId - UUID of the group
 * @returns {Promise<{success: boolean, data?: {client: import('../client/baileyClient').BaileyClient, numberId: string}, error?: {code: string, message: string}}>}
 */
async function getActiveClientForGroup(groupId) {
  const { data: number, error } = await supabase
    .from('whatsapp_numbers')
    .select('id')
    .eq('group_id', groupId)
    .eq('role', 'active')
    .eq('status', 'active')
    .single();

  if (error || !number) {
    return { success: false, error: { code: 'NO_ACTIVE_NUMBER', message: `No active WhatsApp number for group ${groupId}` } };
  }

  const client = getClient(number.id);
  if (!client) {
    return { success: false, error: { code: 'CLIENT_NOT_CONNECTED', message: `BaileyClient not connected for number ${number.id}` } };
  }

  return { success: true, data: { client, numberId: number.id } };
}

/**
 * Send a text message to a WhatsApp group.
 * @param {string} groupId - UUID of the group
 * @param {string} groupJid - WhatsApp group JID (e.g. 120363xxxxx@g.us)
 * @param {string} text - Message text (WhatsApp formatting)
 * @returns {Promise<{success: boolean, data?: {messageId: string}, error?: {code: string, message: string}}>}
 */
async function sendToGroup(groupId, groupJid, text) {
  const clientResult = await getActiveClientForGroup(groupId);
  if (!clientResult.success) return clientResult;

  const { client, numberId } = clientResult.data;
  const limiter = getRateLimiter(numberId);

  await limiter.waitForSlot();

  const result = await client.sendMessage(groupJid, text);

  if (result.success) {
    logger.info('WhatsApp message sent to group', { groupId, groupJid, numberId, messageId: result.data.messageId });
  } else {
    logger.error('Failed to send WhatsApp message to group', { groupId, groupJid, numberId, error: result.error });
  }

  return result;
}

/**
 * Send a media message (image) to a WhatsApp group.
 * @param {string} groupId - UUID of the group
 * @param {string} groupJid - WhatsApp group JID
 * @param {string} imageUrl - URL of the image
 * @param {string} [caption] - Optional caption (WhatsApp formatting)
 * @returns {Promise<{success: boolean, data?: {messageId: string}, error?: {code: string, message: string}}>}
 */
async function sendMediaToGroup(groupId, groupJid, imageUrl, caption) {
  const clientResult = await getActiveClientForGroup(groupId);
  if (!clientResult.success) return clientResult;

  const { client, numberId } = clientResult.data;
  const limiter = getRateLimiter(numberId);

  await limiter.waitForSlot();

  const result = await client.sendImage(groupJid, imageUrl, caption);

  if (result.success) {
    logger.info('WhatsApp media sent to group', { groupId, groupJid, numberId, messageId: result.data.messageId });
  } else {
    logger.error('Failed to send WhatsApp media to group', { groupId, groupJid, numberId, error: result.error });
  }

  return result;
}

const DM_MAX_RETRIES = 3;
const DM_BACKOFF_MS = [1000, 3000, 5000];

/**
 * Send a private message (DM) to a WhatsApp user with retry and backoff.
 * Story 15-2: Max 3 retries with backoff. Logs delivery for audit.
 * Uses any connected client (prefers the group's active number if groupId is provided).
 * @param {string} phoneE164 - E.164 phone number of the recipient
 * @param {string} text - Message text (WhatsApp formatting)
 * @param {string} [groupId] - Optional group ID to use that group's active number
 * @returns {Promise<{success: boolean, data?: {messageId: string}, error?: {code: string, message: string}}>}
 */
async function sendDM(phoneE164, text, groupId) {
  const validation = validateE164(phoneE164);
  if (!validation.valid) {
    return { success: false, error: { code: 'INVALID_PHONE', message: validation.error } };
  }

  let client;
  let numberId;

  if (groupId) {
    const clientResult = await getActiveClientForGroup(groupId);
    if (clientResult.success) {
      client = clientResult.data.client;
      numberId = clientResult.data.numberId;
    }
  }

  // Fallback: use any connected client
  if (!client) {
    const { clients } = require('../clientRegistry');
    for (const [id, c] of clients) {
      if (c.socket) {
        client = c;
        numberId = id;
        break;
      }
    }
  }

  if (!client || !numberId) {
    return { success: false, error: { code: 'NO_CLIENT', message: 'No connected WhatsApp client available' } };
  }

  const jid = phoneToJid(phoneE164);
  const limiter = getRateLimiter(numberId);

  // Story 15-2: Retry with backoff (max 3 attempts)
  let lastError = null;
  for (let attempt = 0; attempt < DM_MAX_RETRIES; attempt++) {
    await limiter.waitForSlot();

    const result = await client.sendMessage(jid, text);

    if (result.success) {
      logger.info('WhatsApp DM sent', {
        phone: phoneE164, numberId, messageId: result.data.messageId, attempt: attempt + 1,
      });

      // Audit log: record successful DM delivery
      await _logDMDelivery(phoneE164, groupId, numberId, result.data.messageId);

      return result;
    }

    lastError = result.error;
    logger.warn('WhatsApp DM attempt failed, retrying', {
      phone: phoneE164, numberId, attempt: attempt + 1, maxRetries: DM_MAX_RETRIES,
      error: result.error,
    });

    // Wait before retry (skip for last attempt)
    if (attempt < DM_MAX_RETRIES - 1) {
      const delay = DM_BACKOFF_MS[Math.min(attempt, DM_BACKOFF_MS.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted — flag member for review
  logger.error('WhatsApp DM failed after all retries', {
    phone: phoneE164, numberId, groupId, error: lastError,
  });
  await _flagMemberForReview(phoneE164, groupId, lastError);

  return { success: false, error: lastError || { code: 'DM_FAILED', message: 'All retry attempts exhausted' } };
}

/**
 * Log a successful DM delivery to member_events for audit.
 */
async function _logDMDelivery(phoneE164, groupId, numberId, messageId) {
  try {
    if (!groupId) return;

    // Find member by phone to get member_id
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('channel_user_id', phoneE164)
      .eq('channel', 'whatsapp')
      .eq('group_id', groupId)
      .maybeSingle();

    if (member) {
      await supabase.from('member_events').insert({
        member_id: member.id,
        event_type: 'dm_sent',
        metadata: { channel: 'whatsapp', phone: phoneE164, number_id: numberId, message_id: messageId },
      });
    }
  } catch (err) {
    // Audit logging is non-critical
    logger.warn('Failed to log DM delivery', { phone: phoneE164, error: err.message });
  }
}

/**
 * Flag a member for review when DM delivery fails after all retries.
 */
async function _flagMemberForReview(phoneE164, groupId, error) {
  try {
    if (!groupId) return;

    const { data: member } = await supabase
      .from('members')
      .select('id, notes')
      .eq('channel_user_id', phoneE164)
      .eq('channel', 'whatsapp')
      .eq('group_id', groupId)
      .maybeSingle();

    if (member) {
      const note = `[DM FAILED] ${new Date().toISOString()} - ${error?.message || 'Unknown error'}`;
      const existingNotes = member.notes || '';
      await supabase
        .from('members')
        .update({ notes: existingNotes ? `${existingNotes}\n${note}` : note })
        .eq('id', member.id);

      logger.info('Member flagged for review after DM failure', {
        memberId: member.id, phone: phoneE164,
      });
    }
  } catch (err) {
    logger.warn('Failed to flag member for review', { phone: phoneE164, error: err.message });
  }
}

module.exports = { sendToGroup, sendMediaToGroup, sendDM };

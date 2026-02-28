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

/**
 * Send a private message (DM) to a WhatsApp user.
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

  await limiter.waitForSlot();

  const result = await client.sendMessage(jid, text);

  if (result.success) {
    logger.info('WhatsApp DM sent', { phone: phoneE164, numberId, messageId: result.data.messageId });
  } else {
    logger.error('Failed to send WhatsApp DM', { phone: phoneE164, numberId, error: result.error });
  }

  return result;
}

module.exports = { sendToGroup, sendMediaToGroup, sendDM };

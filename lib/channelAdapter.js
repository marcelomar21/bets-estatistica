/**
 * Channel Adapter — Unified multi-channel messaging interface.
 *
 * All business services (betService, copyService, memberService) MUST use
 * this adapter to send messages. Never call Telegram Bot API or Baileys directly.
 *
 * Supports:
 * - sendMessage(groupId, text, options) — send text to a group channel
 * - sendPhoto(groupId, imageUrl, caption, options) — send image with caption
 * - sendDM(userId, message, options) — send private message
 *
 * Options:
 * - channel: 'telegram' | 'whatsapp' (required)
 * - botCtx: BotContext for Telegram (required for Telegram channel)
 * - groupJid: WhatsApp group JID (required for WhatsApp group messages)
 * - groupId: UUID of the group (for WhatsApp sender to resolve active number)
 */
const logger = require('./logger');
const { telegramToWhatsApp } = require('./formatConverter');

/**
 * Send a text message to a group via the specified channel.
 * @param {string} groupId - UUID of the group
 * @param {string} text - Message text (Telegram Markdown format)
 * @param {object} options
 * @param {'telegram'|'whatsapp'} options.channel - Target channel
 * @param {object} [options.botCtx] - Telegram BotContext (required for telegram)
 * @param {string} [options.groupJid] - WhatsApp group JID (required for whatsapp)
 * @returns {Promise<{success: boolean, data?: {messageId: string|number}, error?: {code: string, message: string}}>}
 */
async function sendMessage(groupId, text, options = {}) {
  const { channel } = options;

  if (!channel) {
    return { success: false, error: { code: 'MISSING_CHANNEL', message: 'options.channel is required' } };
  }

  if (channel === 'telegram') {
    return _sendTelegramMessage(text, options);
  }

  if (channel === 'whatsapp') {
    const whatsappText = telegramToWhatsApp(text);
    return _sendWhatsAppMessage(groupId, whatsappText, options);
  }

  return { success: false, error: { code: 'UNKNOWN_CHANNEL', message: `Unknown channel: ${channel}` } };
}

/**
 * Send an image with caption to a group via the specified channel.
 * @param {string} groupId - UUID of the group
 * @param {string} imageUrl - URL of the image
 * @param {string} caption - Caption text (Telegram Markdown format)
 * @param {object} options
 * @param {'telegram'|'whatsapp'} options.channel - Target channel
 * @param {object} [options.botCtx] - Telegram BotContext (required for telegram)
 * @param {string} [options.groupJid] - WhatsApp group JID (required for whatsapp)
 * @returns {Promise<{success: boolean, data?: {messageId: string|number}, error?: {code: string, message: string}}>}
 */
async function sendPhoto(groupId, imageUrl, caption, options = {}) {
  const { channel } = options;

  if (!channel) {
    return { success: false, error: { code: 'MISSING_CHANNEL', message: 'options.channel is required' } };
  }

  if (channel === 'telegram') {
    return _sendTelegramMedia(imageUrl, caption, options);
  }

  if (channel === 'whatsapp') {
    const whatsappCaption = caption ? telegramToWhatsApp(caption) : undefined;
    return _sendWhatsAppMedia(groupId, imageUrl, whatsappCaption, options);
  }

  return { success: false, error: { code: 'UNKNOWN_CHANNEL', message: `Unknown channel: ${channel}` } };
}

/**
 * Send a private message (DM) to a user via the specified channel.
 * @param {string} userId - Telegram user ID or phone number (E.164) for WhatsApp
 * @param {string} message - Message text (Telegram Markdown format)
 * @param {object} options
 * @param {'telegram'|'whatsapp'} options.channel - Target channel
 * @param {object} [options.botInstance] - Telegram bot instance (optional for telegram)
 * @param {string} [options.groupId] - Group UUID (optional, helps WhatsApp pick the right number)
 * @returns {Promise<{success: boolean, data?: {messageId: string|number}, error?: {code: string, message: string}}>}
 */
async function sendDM(userId, message, options = {}) {
  const { channel } = options;

  if (!channel) {
    return { success: false, error: { code: 'MISSING_CHANNEL', message: 'options.channel is required' } };
  }

  if (channel === 'telegram') {
    return _sendTelegramDM(userId, message, options);
  }

  if (channel === 'whatsapp') {
    const whatsappText = telegramToWhatsApp(message);
    return _sendWhatsAppDM(userId, whatsappText, options);
  }

  return { success: false, error: { code: 'UNKNOWN_CHANNEL', message: `Unknown channel: ${channel}` } };
}

// ==========================================
// Telegram senders (delegate to bot/telegram.js)
// ==========================================

async function _sendTelegramMessage(text, options) {
  try {
    if (!options.botCtx) {
      return { success: false, error: { code: 'MISSING_BOT_CTX', message: 'botCtx is required for Telegram messages' } };
    }
    const { sendToPublic } = require('../bot/telegram');
    const result = await sendToPublic(text, options.botCtx);
    return result;
  } catch (err) {
    logger.error('channelAdapter: Telegram sendMessage failed', { error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

async function _sendTelegramMedia(imageUrl, caption, options) {
  try {
    const { sendMediaToPublic } = require('../bot/telegram');
    if (!options.botCtx) {
      return { success: false, error: { code: 'MISSING_BOT_CTX', message: 'botCtx is required for Telegram media' } };
    }
    const result = await sendMediaToPublic('image', imageUrl, caption, options.botCtx);
    return result;
  } catch (err) {
    logger.error('channelAdapter: Telegram sendMedia failed', { error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

async function _sendTelegramDM(userId, message, options) {
  try {
    const { sendPrivateMessage } = require('../bot/services/notificationService');
    const result = await sendPrivateMessage(userId, message, 'Markdown', options.botInstance || null);
    return result;
  } catch (err) {
    logger.error('channelAdapter: Telegram sendDM failed', { error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

// ==========================================
// WhatsApp senders (delegate to whatsapp/services/whatsappSender.js)
// ==========================================

async function _sendWhatsAppMessage(groupId, text, options) {
  try {
    const { sendToGroup } = require('../whatsapp/services/whatsappSender');
    if (!options.groupJid) {
      return { success: false, error: { code: 'MISSING_GROUP_JID', message: 'options.groupJid is required for WhatsApp group messages' } };
    }
    return await sendToGroup(groupId, options.groupJid, text);
  } catch (err) {
    logger.error('channelAdapter: WhatsApp sendMessage failed', { error: err.message });
    return { success: false, error: { code: 'WHATSAPP_ERROR', message: err.message } };
  }
}

async function _sendWhatsAppMedia(groupId, imageUrl, caption, options) {
  try {
    const { sendMediaToGroup } = require('../whatsapp/services/whatsappSender');
    if (!options.groupJid) {
      return { success: false, error: { code: 'MISSING_GROUP_JID', message: 'options.groupJid is required for WhatsApp group messages' } };
    }
    return await sendMediaToGroup(groupId, options.groupJid, imageUrl, caption);
  } catch (err) {
    logger.error('channelAdapter: WhatsApp sendMedia failed', { error: err.message });
    return { success: false, error: { code: 'WHATSAPP_ERROR', message: err.message } };
  }
}

async function _sendWhatsAppDM(userId, message, options) {
  try {
    const { sendDM: whatsappSendDM } = require('../whatsapp/services/whatsappSender');
    return await whatsappSendDM(userId, message, options.groupId);
  } catch (err) {
    logger.error('channelAdapter: WhatsApp sendDM failed', { error: err.message });
    return { success: false, error: { code: 'WHATSAPP_ERROR', message: err.message } };
  }
}

module.exports = { sendMessage, sendPhoto, sendDM };

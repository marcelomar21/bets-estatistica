/**
 * Telegram Bot client — singleton + multi-bot support
 * ALL Telegram interactions MUST go through this module
 *
 * Modes:
 * - 'none': No polling/webhook (for jobs that just send messages)
 * - 'polling': Long polling mode (for bot/index.js in development)
 * - 'webhook': Webhook mode (for bot/server.js in production)
 *
 * Multi-bot (Phase 2):
 * - BotContext: { bot, groupId, adminGroupId, publicGroupId, botToken, groupConfig }
 * - BotRegistry: Map<groupId, BotContext>
 * - initBots() reads from bot_pool table
 * - getBotForGroup(groupId) returns BotContext
 * - sendToAdmin/sendToPublic accept optional botCtx parameter
 */
const TelegramBot = require('node-telegram-bot-api');
const { config } = require('../lib/config');
const logger = require('../lib/logger');

// ==========================================
// Legacy singleton state (backward-compat)
// ==========================================
let bot = null;
let currentMode = null;

// ==========================================
// Multi-bot state (Phase 2)
// ==========================================

/**
 * @typedef {Object} BotContext
 * @property {TelegramBot} bot - Telegram bot instance
 * @property {string} groupId - UUID of the group
 * @property {string|number} adminGroupId - Telegram chat ID for admin group
 * @property {string|number} publicGroupId - Telegram chat ID for public group
 * @property {string} botToken - Bot token
 * @property {object} groupConfig - Group-specific config (postingSchedule, copyToneConfig, etc.)
 */

/** @type {Map<string, BotContext>} */
const botRegistry = new Map();

// ==========================================
// Legacy singleton functions (backward-compat)
// ==========================================

/**
 * Initialize or get the bot singleton
 * @param {'none'|'polling'|'webhook'} mode - Bot mode
 * @returns {TelegramBot}
 */
function initBot(mode = 'none') {
  if (bot && currentMode === mode) {
    return bot;
  }

  if (bot) {
    if (currentMode === 'polling') {
      bot.stopPolling();
      logger.info('Stopped polling mode');
    }
    bot = null;
  }

  const options = {};
  if (mode === 'polling') {
    options.polling = true;
  }

  bot = new TelegramBot(config.telegram.botToken, options);
  currentMode = mode;

  logger.info('Telegram bot initialized', { mode });
  return bot;
}

/**
 * Get the bot instance (initializes with 'none' mode if needed)
 * @returns {TelegramBot}
 */
function getBot() {
  if (!bot) {
    initBot('none');
  }
  return bot;
}

/**
 * Stop the bot gracefully
 */
function stopBot() {
  if (bot && currentMode === 'polling') {
    bot.stopPolling();
  }
  bot = null;
  currentMode = null;
  logger.info('Bot stopped');
}

/**
 * Get current bot mode
 * @returns {string|null}
 */
function getBotMode() {
  return currentMode;
}

// ==========================================
// Multi-bot functions (Phase 2)
// ==========================================

/**
 * Initialize multiple bots from bot_pool table
 * @param {object} supabaseClient - Supabase client instance
 * @returns {Promise<Map<string, BotContext>>}
 */
async function initBots(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('bot_pool')
    .select(`
      id,
      bot_token,
      bot_username,
      group_id,
      admin_group_id,
      public_group_id,
      is_active,
      groups!inner (
        id,
        name,
        posting_schedule,
        max_active_bets,
        copy_tone_config,
        checkout_url,
        operator_username,
        subscription_price,
        status
      )
    `)
    .eq('is_active', true)
    .eq('groups.status', 'active');

  if (error) {
    logger.error('Failed to load bots from bot_pool', { error: error.message });
    return botRegistry;
  }

  for (const row of (data || [])) {
    if (!row.bot_token || !row.group_id) {
      logger.warn('Skipping bot_pool entry with missing data', { id: row.id });
      continue;
    }

    try {
      const botInstance = new TelegramBot(row.bot_token);
      const groupConfig = {
        name: row.groups.name,
        postingSchedule: row.groups.posting_schedule,
        maxActiveBets: row.groups.max_active_bets,
        copyToneConfig: row.groups.copy_tone_config || {},
        checkoutUrl: row.groups.checkout_url || null,
        operatorUsername: row.groups.operator_username || null,
        subscriptionPrice: row.groups.subscription_price || null,
      };

      const ctx = {
        bot: botInstance,
        groupId: row.group_id,
        adminGroupId: row.admin_group_id || row.groups?.telegram_admin_group_id,
        publicGroupId: row.public_group_id || row.groups?.telegram_group_id,
        botToken: row.bot_token,
        groupConfig,
      };

      botRegistry.set(row.group_id, ctx);
      logger.info('Bot registered', {
        groupId: row.group_id,
        username: row.bot_username,
        groupName: groupConfig.name,
      });
    } catch (err) {
      logger.error('Failed to initialize bot', {
        groupId: row.group_id,
        error: err.message,
      });
    }
  }

  // Also register the legacy singleton bot if it exists and isn't already registered
  if (config.membership.groupId && !botRegistry.has(config.membership.groupId)) {
    const legacyBot = getBot();
    botRegistry.set(config.membership.groupId, {
      bot: legacyBot,
      groupId: config.membership.groupId,
      adminGroupId: config.telegram.adminGroupId,
      publicGroupId: config.telegram.publicGroupId,
      botToken: config.telegram.botToken,
      groupConfig: {},
    });
    logger.info('Legacy bot registered in registry', { groupId: config.membership.groupId });
  }

  logger.info('Bot registry initialized', { count: botRegistry.size });
  return botRegistry;
}

/**
 * Get BotContext for a specific group
 * @param {string} groupId - Group UUID
 * @returns {BotContext|null}
 */
function getBotForGroup(groupId) {
  return botRegistry.get(groupId) || null;
}

/**
 * Get all registered BotContexts
 * @returns {Map<string, BotContext>}
 */
function getAllBots() {
  return botRegistry;
}

/**
 * Get the first available BotContext (for backward-compat fallback)
 * @returns {BotContext|null}
 */
function getDefaultBotCtx() {
  if (botRegistry.size === 0) return null;
  return botRegistry.values().next().value;
}

// ==========================================
// Messaging functions (support both legacy and botCtx)
// ==========================================

/**
 * Send message to admin group
 * @param {string} text - Message text (supports Markdown)
 * @param {BotContext|object} [botCtxOrOptions] - BotContext or legacy options
 * @param {object} [options] - Additional options (when botCtx is provided)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendToAdmin(text, botCtxOrOptions, options) {
  let targetBot, targetChatId, sendOptions;

  // Detect if second arg is a BotContext or legacy options
  if (botCtxOrOptions && botCtxOrOptions.adminGroupId && botCtxOrOptions.bot) {
    // New multi-bot call: sendToAdmin(text, botCtx, options?)
    targetBot = botCtxOrOptions.bot;
    targetChatId = botCtxOrOptions.adminGroupId;
    sendOptions = options || {};
  } else {
    // Legacy call: sendToAdmin(text, options?)
    if (!botCtxOrOptions || !botCtxOrOptions.adminGroupId) {
      // Log backward-compat warning only if registry has entries
      if (botRegistry.size > 0) {
        logger.warn('sendToAdmin called without botCtx, using legacy singleton');
      }
    }
    targetBot = getBot();
    targetChatId = config.telegram.adminGroupId;
    sendOptions = botCtxOrOptions || {};
  }

  try {
    const message = await targetBot.sendMessage(
      targetChatId,
      text,
      { parse_mode: 'Markdown', ...sendOptions }
    );

    logger.info('Message sent to admin group', { messageId: message.message_id });
    return { success: true, data: { messageId: message.message_id } };
  } catch (err) {
    logger.error('Failed to send to admin group', { error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Send message to public group
 * @param {string} text - Message text (supports Markdown)
 * @param {BotContext|object} [botCtxOrOptions] - BotContext or legacy options
 * @param {object} [options] - Additional options (when botCtx is provided)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendToPublic(text, botCtxOrOptions, options) {
  let targetBot, targetChatId, sendOptions;

  if (botCtxOrOptions && botCtxOrOptions.publicGroupId && botCtxOrOptions.bot) {
    targetBot = botCtxOrOptions.bot;
    targetChatId = botCtxOrOptions.publicGroupId;
    sendOptions = options || {};
  } else {
    if (!botCtxOrOptions || !botCtxOrOptions.publicGroupId) {
      if (botRegistry.size > 0) {
        logger.warn('sendToPublic called without botCtx, using legacy singleton');
      }
    }
    targetBot = getBot();
    targetChatId = config.telegram.publicGroupId;
    sendOptions = botCtxOrOptions || {};
  }

  try {
    const message = await targetBot.sendMessage(
      targetChatId,
      text,
      { parse_mode: 'Markdown', disable_web_page_preview: false, ...sendOptions }
    );

    logger.info('Message sent to public group', { messageId: message.message_id });
    return { success: true, data: { messageId: message.message_id } };
  } catch (err) {
    logger.error('Failed to send to public group', { error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Send media (photo or document) to public group with optional caption
 * @param {'image'|'pdf'} mediaType - Type of media to send
 * @param {string} mediaUrl - URL of the media file (signed URL)
 * @param {string|null} caption - Optional caption text (Markdown)
 * @param {BotContext} botCtx - Bot context for the target group
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendMediaToPublic(mediaType, mediaUrl, caption, botCtx) {
  const targetBot = botCtx.bot;
  const targetChatId = botCtx.publicGroupId;

  const sendOptions = {
    parse_mode: 'Markdown',
  };

  if (caption) {
    sendOptions.caption = caption;
  }

  try {
    let message;
    if (mediaType === 'image') {
      message = await targetBot.sendPhoto(targetChatId, mediaUrl, sendOptions);
    } else {
      message = await targetBot.sendDocument(targetChatId, mediaUrl, sendOptions);
    }

    logger.info('Media sent to public group', {
      messageId: message.message_id,
      mediaType,
    });
    return { success: true, data: { messageId: message.message_id } };
  } catch (err) {
    logger.error('Failed to send media to public group', {
      error: err.message,
      mediaType,
    });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Send alert to admin group (formatted for errors/warnings)
 * @param {string} type - Alert type (ERROR, WARN, INFO)
 * @param {string} technicalMessage - Technical details
 * @param {string} simpleExplanation - Non-technical explanation
 * @param {BotContext} [botCtx] - Optional BotContext for multi-bot
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function alertAdmin(type, technicalMessage, simpleExplanation, botCtx) {
  const emoji = type === 'ERROR' ? '🔴' : type === 'WARN' ? '🟡' : '🔵';
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const text = `
${emoji} *ALERTA: ${type}*

📋 *Técnico:* \`${technicalMessage}\`

💬 *Resumo:* ${simpleExplanation}

🕐 ${timestamp}
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Test bot connection by getting bot info
 * @param {BotContext} [botCtx] - Optional BotContext for multi-bot
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function testConnection(botCtx) {
  try {
    const targetBot = botCtx ? botCtx.bot : getBot();
    const me = await targetBot.getMe();
    logger.info('Telegram bot connected', { username: me.username });
    return { success: true, data: { username: me.username, id: me.id } };
  } catch (err) {
    logger.error('Telegram bot connection failed', { error: err.message });
    return { success: false, error: { code: 'BOT_ERROR', message: err.message } };
  }
}

/**
 * Set up webhook for the bot
 * @param {string} webhookUrl - Full webhook URL
 * @param {BotContext} [botCtx] - Optional BotContext for multi-bot
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function setWebhook(webhookUrl, botCtx) {
  try {
    const targetBot = botCtx ? botCtx.bot : getBot();
    const token = botCtx ? botCtx.botToken : config.telegram.botToken;
    await targetBot.setWebHook(webhookUrl);
    logger.info('Webhook set', { url: webhookUrl.replace(token, '***') });
    return { success: true };
  } catch (err) {
    logger.error('Failed to set webhook', { error: err.message });
    return { success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } };
  }
}

module.exports = {
  // Legacy singleton management
  initBot,
  getBot,
  stopBot,
  getBotMode,

  // Multi-bot management (Phase 2)
  initBots,
  getBotForGroup,
  getAllBots,
  getDefaultBotCtx,

  // Messaging functions (support both legacy and botCtx)
  sendToAdmin,
  sendToPublic,
  sendMediaToPublic,
  alertAdmin,
  testConnection,
  setWebhook,

  // Legacy export for backwards compatibility
  get bot() {
    return getBot();
  },
};

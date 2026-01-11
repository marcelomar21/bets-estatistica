/**
 * Telegram Bot singleton client
 * ALL Telegram interactions MUST go through this module
 *
 * Modes:
 * - 'none': No polling/webhook (for jobs that just send messages)
 * - 'polling': Long polling mode (for bot/index.js in development)
 * - 'webhook': Webhook mode (for bot/server.js in production)
 */
const TelegramBot = require('node-telegram-bot-api');
const { config } = require('../lib/config');
const logger = require('../lib/logger');

// Singleton state
let bot = null;
let currentMode = null;

/**
 * Initialize or get the bot singleton
 * @param {'none'|'polling'|'webhook'} mode - Bot mode
 * @returns {TelegramBot}
 */
function initBot(mode = 'none') {
  // If already initialized with same mode, return existing
  if (bot && currentMode === mode) {
    return bot;
  }

  // If switching modes, cleanup existing
  if (bot) {
    if (currentMode === 'polling') {
      bot.stopPolling();
      logger.info('Stopped polling mode');
    }
    bot = null;
  }

  // Create new bot instance
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

/**
 * Send message to admin group
 * @param {string} text - Message text (supports Markdown)
 * @param {object} options - Additional options
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendToAdmin(text, options = {}) {
  try {
    const message = await getBot().sendMessage(
      config.telegram.adminGroupId,
      text,
      { parse_mode: 'Markdown', ...options }
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
 * @param {object} options - Additional options
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendToPublic(text, options = {}) {
  try {
    const message = await getBot().sendMessage(
      config.telegram.publicGroupId,
      text,
      { parse_mode: 'Markdown', disable_web_page_preview: false, ...options }
    );

    logger.info('Message sent to public group', { messageId: message.message_id });
    return { success: true, data: { messageId: message.message_id } };
  } catch (err) {
    logger.error('Failed to send to public group', { error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Send alert to admin group (formatted for errors/warnings)
 * @param {string} type - Alert type (ERROR, WARN, INFO)
 * @param {string} technicalMessage - Technical details
 * @param {string} simpleExplanation - Non-technical explanation
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function alertAdmin(type, technicalMessage, simpleExplanation) {
  const emoji = type === 'ERROR' ? '🔴' : type === 'WARN' ? '🟡' : '🔵';
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const text = `
${emoji} *ALERTA: ${type}*

📋 *Técnico:* \`${technicalMessage}\`

💬 *Resumo:* ${simpleExplanation}

🕐 ${timestamp}
  `.trim();

  return sendToAdmin(text);
}

/**
 * Test bot connection by getting bot info
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function testConnection() {
  try {
    const me = await getBot().getMe();
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
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function setWebhook(webhookUrl) {
  try {
    await getBot().setWebHook(webhookUrl);
    logger.info('Webhook set', { url: webhookUrl.replace(config.telegram.botToken, '***') });
    return { success: true };
  } catch (err) {
    logger.error('Failed to set webhook', { error: err.message });
    return { success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } };
  }
}

module.exports = {
  // Bot instance management
  initBot,
  getBot,
  stopBot,
  getBotMode,

  // Messaging functions
  sendToAdmin,
  sendToPublic,
  alertAdmin,
  testConnection,
  setWebhook,

  // Legacy export for backwards compatibility
  get bot() {
    return getBot();
  },
};

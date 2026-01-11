/**
 * Telegram Bot singleton client
 * ALL Telegram interactions MUST go through this module
 */
const TelegramBot = require('node-telegram-bot-api');
const { config } = require('../lib/config');
const logger = require('../lib/logger');

// Create singleton bot instance
const bot = new TelegramBot(config.telegram.botToken, { 
  polling: false // We use webhooks/cron, not polling
});

/**
 * Send message to admin group
 * @param {string} text - Message text (supports Markdown)
 * @param {object} options - Additional options
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendToAdmin(text, options = {}) {
  try {
    const message = await bot.sendMessage(
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
    const message = await bot.sendMessage(
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
    const me = await bot.getMe();
    logger.info('Telegram bot connected', { username: me.username });
    return { success: true, data: { username: me.username, id: me.id } };
  } catch (err) {
    logger.error('Telegram bot connection failed', { error: err.message });
    return { success: false, error: { code: 'BOT_ERROR', message: err.message } };
  }
}

module.exports = {
  bot,
  sendToAdmin,
  sendToPublic,
  alertAdmin,
  testConnection,
};

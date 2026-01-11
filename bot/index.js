/**
 * Bot Entry Point (Polling Mode)
 *
 * This is the main entry point for the Telegram bot in POLLING mode.
 * Use this for local development. For production on Render, use server.js instead.
 *
 * Usage: node bot/index.js
 */
require('dotenv').config();
const { config, validateConfig } = require('../lib/config');
const logger = require('../lib/logger');
const { initBot, stopBot, testConnection } = require('./telegram');
const { handleAdminMessage } = require('./handlers/adminGroup');

// Validate config on startup
validateConfig();

// Initialize bot with polling mode
const bot = initBot('polling');

/**
 * Handle messages in admin group
 */
bot.on('message', async (msg) => {
  // Only process messages from admin group
  if (msg.chat.id.toString() !== config.telegram.adminGroupId) {
    return;
  }

  try {
    await handleAdminMessage(bot, msg);
  } catch (err) {
    logger.error('Error handling admin message', { error: err.message });
  }
});

/**
 * Handle /status command
 */
bot.onText(/\/status/, async (msg) => {
  if (msg.chat.id.toString() !== config.telegram.adminGroupId) {
    return;
  }

  const statusText = `
🤖 *Status do Bot*

✅ Bot online (polling mode)
📊 Ambiente: ${config.env}
🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
});

/**
 * Handle /help command
 */
bot.onText(/\/help/, async (msg) => {
  if (msg.chat.id.toString() !== config.telegram.adminGroupId) {
    return;
  }

  const helpText = `
📚 *Comandos Disponíveis*

/status - Ver status do bot
/help - Ver esta ajuda

*Para enviar links:*
Responda às solicitações com:
\`ID: link_da_aposta\`

Exemplo: \`123: https://bet365.com/...\`
  `.trim();

  await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

/**
 * Startup
 */
async function startup() {
  logger.info('Starting bot in polling mode...');

  const result = await testConnection();
  if (!result.success) {
    logger.error('Failed to connect to Telegram', { error: result.error.message });
    process.exit(1);
  }

  logger.info('Bot started successfully', {
    username: result.data.username,
    env: config.env
  });

  console.log(`\n🤖 Bot @${result.data.username} is running in POLLING mode!`);
  console.log(`📍 Admin Group: ${config.telegram.adminGroupId}`);
  console.log(`📍 Public Group: ${config.telegram.publicGroupId}`);
  console.log('\nPress Ctrl+C to stop.\n');
}

startup();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down bot...');
  stopBot();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down bot...');
  stopBot();
  process.exit(0);
});

/**
 * Bot Web Server - Webhook mode for Render Free Tier
 * 
 * Render free tier spins down after 15min of inactivity,
 * but Telegram webhooks will wake it up when messages arrive.
 * 
 * Usage:
 *   node bot/server.js
 * 
 * Environment:
 *   PORT - Server port (Render sets this automatically)
 *   WEBHOOK_URL - Your Render URL (e.g., https://bets-bot.onrender.com)
 */
require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { config, validateConfig } = require('../lib/config');
const logger = require('../lib/logger');
const { handleAdminMessage } = require('./handlers/adminGroup');

// Validate config
validateConfig();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Create bot in webhook mode (no polling)
const bot = new TelegramBot(config.telegram.botToken);

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    bot: 'GuruBet',
    time: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

/**
 * Telegram webhook endpoint
 */
app.post(`/webhook/${config.telegram.botToken}`, async (req, res) => {
  try {
    const update = req.body;
    
    // Process message
    if (update.message) {
      const msg = update.message;
      
      // Only process admin group messages
      if (msg.chat.id.toString() === config.telegram.adminGroupId) {
        await handleAdminMessage(bot, msg);
      }
      
      // Handle commands
      if (msg.text?.startsWith('/status')) {
        await handleStatusCommand(msg);
      } else if (msg.text?.startsWith('/help')) {
        await handleHelpCommand(msg);
      }
    }
    
    res.sendStatus(200);
  } catch (err) {
    logger.error('Webhook error', { error: err.message });
    res.sendStatus(200); // Always respond 200 to avoid retries
  }
});

/**
 * Handle /status command
 */
async function handleStatusCommand(msg) {
  if (msg.chat.id.toString() !== config.telegram.adminGroupId) return;
  
  const statusText = `
🤖 *Status do Bot*

✅ Bot online (webhook mode)
📊 Ambiente: ${config.env}
🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
}

/**
 * Handle /help command
 */
async function handleHelpCommand(msg) {
  if (msg.chat.id.toString() !== config.telegram.adminGroupId) return;
  
  const helpText = `
📚 *Comandos Disponíveis*

/status - Ver status do bot
/help - Ver esta ajuda

*Para enviar links:*
\`ID: link_da_aposta\`

*Para definir odds:*
\`/odds ID valor\`

Exemplo: 
\`40: https://betano.bet.br/...\`
\`/odds 40 1.85\`
  `.trim();

  await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
}

/**
 * Setup webhook
 */
async function setupWebhook() {
  if (!WEBHOOK_URL) {
    logger.warn('WEBHOOK_URL not set, skipping webhook setup');
    return false;
  }

  const webhookUrl = `${WEBHOOK_URL}/webhook/${config.telegram.botToken}`;
  
  try {
    await bot.setWebHook(webhookUrl);
    logger.info('Webhook set', { url: webhookUrl.replace(config.telegram.botToken, '***') });
    return true;
  } catch (err) {
    logger.error('Failed to set webhook', { error: err.message });
    return false;
  }
}

/**
 * Start server
 */
async function start() {
  console.log('🤖 Starting GuruBet Server...\n');
  
  // Setup webhook if URL provided
  if (WEBHOOK_URL) {
    await setupWebhook();
  } else {
    console.log('⚠️  WEBHOOK_URL not set - webhook not configured');
    console.log('   Set WEBHOOK_URL=https://your-app.onrender.com in Render\n');
  }
  
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 Admin Group: ${config.telegram.adminGroupId}`);
    console.log(`📍 Public Group: ${config.telegram.publicGroupId}`);
    console.log('\n🔗 Endpoints:');
    console.log(`   GET  /health - Health check`);
    console.log(`   POST /webhook/*** - Telegram webhook\n`);
  });
}

start().catch(err => {
  console.error('❌ Failed to start:', err.message);
  process.exit(1);
});

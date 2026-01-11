/**
 * Bot Web Server (Webhook Mode)
 *
 * This is the main entry point for the Telegram bot in WEBHOOK mode.
 * Use this for production on Render. For local development, use index.js instead.
 *
 * Render free tier spins down after 15min of inactivity,
 * but Telegram webhooks will wake it up when messages arrive.
 *
 * Usage: node bot/server.js
 *
 * Environment:
 *   PORT - Server port (Render sets this automatically)
 *   WEBHOOK_URL - Your Render URL (e.g., https://bets-bot.onrender.com)
 */
require('dotenv').config();

const express = require('express');
const { config, validateConfig } = require('../lib/config');
const logger = require('../lib/logger');
const { initBot, getBot, setWebhook, testConnection } = require('./telegram');
const { handleAdminMessage } = require('./handlers/adminGroup');

// Validate config
validateConfig();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Render fornece RENDER_EXTERNAL_URL automaticamente
// Ou você pode definir WEBHOOK_URL manualmente
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL;

// Initialize bot in webhook mode (no polling)
initBot('webhook');

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'GuruBet',
    mode: 'webhook',
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
    const bot = getBot();

    // Process message
    if (update.message) {
      const msg = update.message;

      // Only process admin group messages
      if (msg.chat.id.toString() === config.telegram.adminGroupId) {
        await handleAdminMessage(bot, msg);
      }

      // Handle commands
      if (msg.text?.startsWith('/status')) {
        await handleStatusCommand(bot, msg);
      } else if (msg.text?.startsWith('/help')) {
        await handleHelpCommand(bot, msg);
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
async function handleStatusCommand(bot, msg) {
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
async function handleHelpCommand(bot, msg) {
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
  const result = await setWebhook(webhookUrl);
  return result.success;
}

/**
 * Setup internal scheduler (node-cron)
 * This runs inside the web service to avoid paid cron jobs
 */
function setupScheduler() {
  const cron = require('node-cron');
  const { runEnrichment } = require('./jobs/enrichOdds');
  const { runRequestLinks } = require('./jobs/requestLinks');
  const { runPostBets } = require('./jobs/postBets');

  const TZ = 'America/Sao_Paulo';

  // Morning prep - 08:00 São Paulo
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running morning-prep job');
    try {
      await runEnrichment();
      await runRequestLinks('morning');
    } catch (err) {
      logger.error('morning-prep failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Morning post - 10:00 São Paulo
  cron.schedule('0 10 * * *', async () => {
    logger.info('Running morning-post job');
    try {
      await runPostBets('morning');
    } catch (err) {
      logger.error('morning-post failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Afternoon prep - 13:00 São Paulo
  cron.schedule('0 13 * * *', async () => {
    logger.info('Running afternoon-prep job');
    try {
      await runEnrichment();
      await runRequestLinks('afternoon');
    } catch (err) {
      logger.error('afternoon-prep failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Afternoon post - 15:00 São Paulo
  cron.schedule('0 15 * * *', async () => {
    logger.info('Running afternoon-post job');
    try {
      await runPostBets('afternoon');
    } catch (err) {
      logger.error('afternoon-post failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Night prep - 20:00 São Paulo
  cron.schedule('0 20 * * *', async () => {
    logger.info('Running night-prep job');
    try {
      await runEnrichment();
      await runRequestLinks('night');
    } catch (err) {
      logger.error('night-prep failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Night post - 22:00 São Paulo
  cron.schedule('0 22 * * *', async () => {
    logger.info('Running night-post job');
    try {
      await runPostBets('night');
    } catch (err) {
      logger.error('night-post failed', { error: err.message });
    }
  }, { timezone: TZ });

  logger.info('Internal scheduler started');
  console.log('⏰ Scheduler jobs:');
  console.log('   08:00 - Enrich + Request links');
  console.log('   10:00 - Post bets (morning)');
  console.log('   13:00 - Enrich + Request links');
  console.log('   15:00 - Post bets (afternoon)');
  console.log('   20:00 - Enrich + Request links');
  console.log('   22:00 - Post bets (night)');
}

/**
 * Start server
 */
async function start() {
  console.log('🤖 Starting GuruBet Server in WEBHOOK mode...\n');

  // Test connection first
  const connResult = await testConnection();
  if (!connResult.success) {
    console.error('❌ Failed to connect to Telegram:', connResult.error.message);
    process.exit(1);
  }

  // Setup webhook if URL provided
  if (WEBHOOK_URL) {
    await setupWebhook();
  } else {
    console.log('⚠️  WEBHOOK_URL not set - webhook not configured');
    console.log('   Render provides RENDER_EXTERNAL_URL automatically\n');
  }

  // Setup internal scheduler
  setupScheduler();

  app.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`🤖 Bot: @${connResult.data.username}`);
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

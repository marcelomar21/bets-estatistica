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
const { handleNewChatMembers } = require('./handlers/memberEvents');

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
 * Reset webhook endpoint (useful when local polling breaks it)
 */
app.get('/reset-webhook', async (req, res) => {
  if (!WEBHOOK_URL) {
    return res.json({ success: false, error: 'WEBHOOK_URL not configured' });
  }
  
  const webhookUrl = `${WEBHOOK_URL}/webhook/${config.telegram.botToken}`;
  const result = await setWebhook(webhookUrl);
  
  if (result.success) {
    logger.info('Webhook reset via endpoint');
    res.json({ success: true, message: 'Webhook configured' });
  } else {
    res.json({ success: false, error: result.error?.message });
  }
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

      // Story 16.4: Detect new members joining the PUBLIC group (5.1, 5.2, 5.3)
      if (msg.new_chat_members && msg.chat.id.toString() === config.telegram.publicGroupId) {
        await handleNewChatMembers(msg);
      }

      // All admin group messages handled by adminGroup.js (includes /help, /status, etc)
      if (msg.chat.id.toString() === config.telegram.adminGroupId) {
        await handleAdminMessage(bot, msg);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error('Webhook error', { error: err.message });
    res.sendStatus(200); // Always respond 200 to avoid retries
  }
});

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
  const { runHealthCheck } = require('./jobs/healthCheck');
  const { runProcessWebhooks } = require('./jobs/membership/process-webhooks');
  const { runTrialReminders } = require('./jobs/membership/trial-reminders');
  const { runRenewalReminders } = require('./jobs/membership/renewal-reminders');
  const { runKickExpired } = require('./jobs/membership/kick-expired');

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

  // Trial reminders - 09:00 São Paulo (Story 16.5)
  cron.schedule('0 9 * * *', async () => {
    logger.info('[scheduler] Running trial-reminders job');
    try {
      const result = await runTrialReminders();
      logger.info('[scheduler] trial-reminders complete', result);
    } catch (err) {
      logger.error('[scheduler] trial-reminders failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Morning post + Renewal reminders - 10:00 São Paulo
  cron.schedule('0 10 * * *', async () => {
    // Story 16.5: Renewal reminders first
    logger.info('[scheduler] Running renewal-reminders job');
    try {
      const result = await runRenewalReminders();
      logger.info('[scheduler] renewal-reminders complete', result);
    } catch (err) {
      logger.error('[scheduler] renewal-reminders failed', { error: err.message });
    }

    // Then post bets
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

  // Health check - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Running health-check job');
    try {
      await runHealthCheck();
    } catch (err) {
      logger.error('health-check failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Webhook processing - every 30 seconds (Story 16.3)
  // Using setInterval instead of cron - node-cron doesn't support sub-minute intervals
  setInterval(async () => {
    try {
      await runProcessWebhooks();
    } catch (err) {
      logger.error('[membership:process-webhooks] Interval error', { error: err.message });
    }
  }, 30000);
  logger.info('[membership:process-webhooks] Interval started (every 30s)');

  // Kick expired members - 00:01 São Paulo (Story 16.6)
  cron.schedule('1 0 * * *', async () => {
    logger.info('[scheduler] Running kick-expired job');
    try {
      const result = await runKickExpired();
      logger.info('[scheduler] kick-expired complete', result);
    } catch (err) {
      logger.error('[scheduler] kick-expired failed', { error: err.message });
    }
  }, { timezone: TZ });

  logger.info('Internal scheduler started');
  console.log('⏰ Scheduler jobs:');
  console.log('   00:01 - Kick expired members (membership)');
  console.log('   08:00 - Enrich + Request links');
  console.log('   09:00 - Trial reminders (membership)');
  console.log('   10:00 - Renewal reminders + Post bets (morning)');
  console.log('   13:00 - Enrich + Request links');
  console.log('   15:00 - Post bets (afternoon)');
  console.log('   20:00 - Enrich + Request links');
  console.log('   22:00 - Post bets (night)');
  console.log('   */5   - Health check');
  console.log('   */30s - Process webhooks (membership)');
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

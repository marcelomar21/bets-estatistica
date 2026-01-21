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
const { handleAdminMessage, handleRemovalCallback } = require('./handlers/adminGroup');
const { handleNewChatMembers } = require('./handlers/memberEvents');
const { handleStartCommand, handleStatusCommand, handleEmailInput, shouldHandleAsEmailInput } = require('./handlers/startCommand');

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

      // DEBUG: Log all messages from public group to diagnose new_chat_members issue
      if (msg.chat.id.toString() === config.telegram.publicGroupId) {
        logger.info('[webhook:debug] Message from public group', {
          chatId: msg.chat.id,
          hasNewChatMembers: !!msg.new_chat_members,
          newChatMembersCount: msg.new_chat_members?.length || 0,
          messageType: msg.new_chat_members ? 'new_chat_members' : (msg.text ? 'text' : 'other'),
          configuredPublicGroupId: config.telegram.publicGroupId
        });
      }

      // DEBUG: Log new_chat_members from ANY chat to see if event arrives at all
      if (msg.new_chat_members) {
        logger.info('[webhook:debug] new_chat_members event received', {
          chatId: msg.chat.id,
          chatTitle: msg.chat.title,
          configuredPublicGroupId: config.telegram.publicGroupId,
          match: msg.chat.id.toString() === config.telegram.publicGroupId,
          members: msg.new_chat_members.map(u => ({ id: u.id, username: u.username, is_bot: u.is_bot }))
        });
      }

      // Story 16.4: Detect new members joining the PUBLIC group (5.1, 5.2, 5.3)
      if (msg.new_chat_members && msg.chat.id.toString() === config.telegram.publicGroupId) {
        await handleNewChatMembers(msg);
      }

      // Story 16.9: Handle /start command in private chats (Gate Entry)
      if (msg.chat.type === 'private' && msg.text) {
        if (msg.text.startsWith('/start')) {
          await handleStartCommand(msg);
        } else if (msg.text === '/status') {
          await handleStatusCommand(msg);
        } else if (shouldHandleAsEmailInput(msg)) {
          // Handle email verification flow (MP payment before /start)
          await handleEmailInput(msg);
        }
      }

      // All admin group messages handled by adminGroup.js (includes /help, /status, etc)
      if (msg.chat.id.toString() === config.telegram.adminGroupId) {
        await handleAdminMessage(bot, msg);
      }
    }

    // Story 16.7: Process callback queries (inline keyboard buttons)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      // Only handle from admin group
      if (callbackQuery.message?.chat?.id?.toString() === config.telegram.adminGroupId) {
        await handleRemovalCallback(bot, callbackQuery);
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
  const { runTrackResults } = require('./jobs/trackResults');
  const { runReminders } = require('./jobs/reminders');
  const { runProcessWebhooks } = require('./jobs/membership/process-webhooks');
  // DISABLED: Trial reminders não fazem sentido no fluxo MP (usuário já assinou)
  // const { runTrialReminders } = require('./jobs/membership/trial-reminders');
  const { runRenewalReminders } = require('./jobs/membership/renewal-reminders');
  const { runKickExpired } = require('./jobs/membership/kick-expired');
  const { runReconciliation } = require('./jobs/membership/reconciliation');
  const { runCheckAffiliateExpiration } = require('./jobs/membership/check-affiliate-expiration');
  const { withExecutionLogging, cleanupStuckJobs } = require('./services/jobExecutionService');

  const TZ = 'America/Sao_Paulo';

  // Track results - 02:00 São Paulo (pega jogos noturnos que terminam após meia-noite)
  cron.schedule('0 2 * * *', async () => {
    logger.info('[scheduler] Running track-results job');
    try {
      await withExecutionLogging('track-results', runTrackResults);
      logger.info('[scheduler] track-results complete');
    } catch (err) {
      logger.error('[scheduler] track-results failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Morning prep - 08:00 São Paulo
  cron.schedule('0 8 * * *', async () => {
    logger.info('[scheduler] Running morning-prep jobs');
    try {
      await withExecutionLogging('enrich-odds', runEnrichment);
      await withExecutionLogging('request-links', () => runRequestLinks('morning'));
      logger.info('[scheduler] morning-prep complete');
    } catch (err) {
      logger.error('[scheduler] morning-prep failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Link reminders - 09:00 São Paulo
  cron.schedule('0 9 * * *', async () => {
    // DISABLED: Trial reminders não fazem sentido no fluxo MP (usuário já assinou)
    // logger.info('[scheduler] Running trial-reminders job');
    // try {
    //   await withExecutionLogging('trial-reminders', runTrialReminders);
    //   logger.info('[scheduler] trial-reminders complete');
    // } catch (err) {
    //   logger.error('[scheduler] trial-reminders failed', { error: err.message });
    // }

    // Link reminders (follow-up após requestLinks das 08:00)
    logger.info('[scheduler] Running reminders job');
    try {
      await withExecutionLogging('reminders', runReminders);
      logger.info('[scheduler] reminders complete');
    } catch (err) {
      logger.error('[scheduler] reminders failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Morning post + Renewal reminders - 10:00 São Paulo
  cron.schedule('0 10 * * *', async () => {
    // Story 16.5: Renewal reminders first
    logger.info('[scheduler] Running renewal-reminders job');
    try {
      await withExecutionLogging('renewal-reminders', runRenewalReminders);
      logger.info('[scheduler] renewal-reminders complete');
    } catch (err) {
      logger.error('[scheduler] renewal-reminders failed', { error: err.message });
    }

    // Then post bets
    logger.info('[scheduler] Running morning-post job');
    try {
      await withExecutionLogging('post-bets', () => runPostBets('morning'));
      logger.info('[scheduler] morning-post complete');
    } catch (err) {
      logger.error('[scheduler] morning-post failed', { error: err.message });
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
      await withExecutionLogging('kick-expired', runKickExpired);
      logger.info('[scheduler] kick-expired complete');
    } catch (err) {
      logger.error('[scheduler] kick-expired failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Check affiliate expiration - 00:30 São Paulo (Story 18.2)
  cron.schedule('30 0 * * *', async () => {
    logger.info('[scheduler] Running check-affiliate-expiration job');
    try {
      await withExecutionLogging('check-affiliate-expiration', runCheckAffiliateExpiration);
      logger.info('[scheduler] check-affiliate-expiration complete');
    } catch (err) {
      logger.error('[scheduler] check-affiliate-expiration failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Cakto reconciliation - 03:00 São Paulo (Story 16.8)
  cron.schedule('0 3 * * *', async () => {
    logger.info('[scheduler] Running reconciliation job');
    try {
      await withExecutionLogging('reconciliation', runReconciliation);
      logger.info('[scheduler] reconciliation complete');
    } catch (err) {
      logger.error('[scheduler] reconciliation failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Cleanup stuck job executions - every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    logger.debug('[scheduler] Running cleanup-stuck-jobs');
    try {
      const result = await cleanupStuckJobs();
      if (result.success && result.data.cleaned > 0) {
        logger.info('[scheduler] cleanup-stuck-jobs complete', { cleaned: result.data.cleaned });
      }
    } catch (err) {
      logger.error('[scheduler] cleanup-stuck-jobs failed', { error: err.message });
    }
  }, { timezone: TZ });

  logger.info('Internal scheduler started');
  console.log('⏰ Scheduler jobs:');
  console.log('   00:01 - Kick expired members (membership)');
  console.log('   00:30 - Check affiliate expiration (membership)');
  console.log('   02:00 - Track results');
  console.log('   03:00 - Cakto reconciliation (membership)');
  console.log('   08:00 - Enrich odds + Request links');
  console.log('   09:00 - Trial reminders + Link reminders');
  console.log('   10:00 - Renewal reminders + Post bets');
  console.log('   */5   - Health check');
  console.log('   */30s - Process webhooks (membership)');
  console.log('   */1h  - Cleanup stuck jobs');
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

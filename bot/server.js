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
const { handlePostConfirmation } = require('./jobs/postBets');
const { handleNewChatMembers } = require('./handlers/memberEvents');
const { handleStartCommand, handleStatusCommand, handleEmailInput, shouldHandleAsEmailInput } = require('./handlers/startCommand');
const { supabase } = require('../lib/supabase');

// Validate config
validateConfig();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Story 3.1: Cached group chat ID for multi-tenant mode
let cachedGroupChatId = null;

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
 * IMPORTANT: Responds 200 immediately to prevent Telegram retries,
 * then processes the update asynchronously.
 */
app.post(`/webhook/${config.telegram.botToken}`, (req, res) => {
  // Respond immediately to prevent Telegram webhook retries (60s timeout)
  res.sendStatus(200);

  // Process update asynchronously
  processWebhookUpdate(req.body).catch(err => {
    logger.error('Webhook processing error', { error: err.message });
  });
});

/**
 * Process webhook update asynchronously
 * Extracted to allow immediate 200 response
 */
async function processWebhookUpdate(update) {
  const bot = getBot();

  // Process message
  if (update.message) {
    const msg = update.message;

    // DEBUG: Log all messages from public group to diagnose new_chat_members issue
    const debugGroupId = cachedGroupChatId || config.telegram.publicGroupId;
    if (msg.chat.id.toString() === debugGroupId) {
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
    // Story 3.1: Use cached group chat ID for multi-tenant, fallback to config
    const expectedGroupChatId = cachedGroupChatId || config.telegram.publicGroupId;
    if (msg.new_chat_members && msg.chat.id.toString() === expectedGroupChatId) {
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
      const data = callbackQuery.data || '';

      // Handle post confirmation callbacks
      if (data.startsWith('postbets_confirm:') || data.startsWith('postbets_cancel:')) {
        const [actionFull, confirmationId] = data.split(':');
        const action = actionFull.replace('postbets_', ''); // 'confirm' or 'cancel'
        await handlePostConfirmation(action, confirmationId, callbackQuery);
      } else {
        // Handle removal callbacks (existing)
        await handleRemovalCallback(bot, callbackQuery);
      }
    }
  }
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
 * Story 5.5: Posting/distribution jobs are now DYNAMIC — managed by server.scheduler.js
 * Only non-posting jobs remain hardcoded here.
 */
async function setupScheduler() {
  const cron = require('node-cron');
  const { runEnrichment } = require('./jobs/enrichOdds');
  const { runHealthCheck } = require('./jobs/healthCheck');
  const { runTrackResults } = require('./jobs/trackResults');
  const { runProcessWebhooks } = require('./jobs/membership/process-webhooks');
  const { runRenewalReminders } = require('./jobs/membership/renewal-reminders');
  const { runKickExpired } = require('./jobs/membership/kick-expired');
  const { runReconciliation } = require('./jobs/membership/reconciliation');
  const { runCheckAffiliateExpiration } = require('./jobs/membership/check-affiliate-expiration');
  const { withExecutionLogging, cleanupStuckJobs } = require('./services/jobExecutionService');
  const {
    loadPostingSchedule,
    setupDynamicScheduler,
    reloadPostingSchedule,
    checkPostNow,
  } = require('./server.scheduler');

  const TZ = 'America/Sao_Paulo';

  // =========================================================
  // Story 5.5: Dynamic posting scheduler (replaces hardcoded)
  // =========================================================
  if (config.membership.groupId) {
    const schedule = await loadPostingSchedule();
    setupDynamicScheduler(schedule);

    // Reload posting schedule every 5 minutes
    setInterval(async () => {
      try {
        await reloadPostingSchedule();
      } catch (err) {
        logger.error('[scheduler] reloadPostingSchedule interval error', { error: err.message });
      }
    }, 5 * 60 * 1000);
    logger.info('[scheduler] Posting schedule reload interval started (every 5min)');

    // Story 5.5: Post-now polling every 30 seconds
    setInterval(async () => {
      try {
        await checkPostNow();
      } catch (err) {
        logger.error('[scheduler] checkPostNow interval error', { error: err.message });
      }
    }, 30000);
    logger.info('[scheduler] Post-now polling started (every 30s)');
  }

  // =========================================================
  // Non-posting jobs (UNCHANGED — remain hardcoded)
  // =========================================================

  // Track results - every hour between 13h and 23h (São Paulo time)
  cron.schedule('0 13-23 * * *', async () => {
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
      logger.info('[scheduler] morning-prep complete');
    } catch (err) {
      logger.error('[scheduler] morning-prep failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Story 5.5: Renewal reminders SEPARATED from posting — stays hardcoded at 10:00
  cron.schedule('0 10 * * *', async () => {
    logger.info('[scheduler] Running renewal-reminders job');
    try {
      await withExecutionLogging('renewal-reminders', runRenewalReminders);
      logger.info('[scheduler] renewal-reminders complete');
    } catch (err) {
      logger.error('[scheduler] renewal-reminders failed', { error: err.message });
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
  console.log('⏰ Scheduler jobs (non-posting):');
  console.log('   00:01 - Kick expired members (membership)');
  console.log('   00:30 - Check affiliate expiration (membership)');
  console.log('   03:00 - Cakto reconciliation (membership)');
  console.log('   08:00 - Enrich odds');
  console.log('   10:00 - Renewal reminders');
  console.log('   13-23 - Track results (hourly)');
  console.log('   */5   - Health check');
  console.log('   */30s - Process webhooks (membership)');
  console.log('   */30s - Post-now polling (story 5.5)');
  console.log('   */5m  - Posting schedule reload (story 5.5)');
  console.log('   */1h  - Cleanup stuck jobs');
  console.log('   [dynamic] - Posting + distribution (story 5.5)');
}

/**
 * Start server
 */
async function start() {
  console.log('🤖 Starting GuruBet Server in WEBHOOK mode...\n');

  logger.info('[server] Tenant mode', {
    mode: config.membership.groupId ? 'multi-tenant' : 'single-tenant',
    groupId: config.membership.groupId || null
  });

  // Test connection first
  const connResult = await testConnection();
  if (!connResult.success) {
    console.error('❌ Failed to connect to Telegram:', connResult.error.message);
    process.exit(1);
  }

  // Story 3.1: Cache telegram_group_id from groups table if multi-tenant
  if (config.membership.groupId) {
    try {
      const { data: group, error } = await supabase
        .from('groups')
        .select('telegram_group_id')
        .eq('id', config.membership.groupId)
        .single();

      if (error) {
        logger.error('[server] Failed to load group for multi-tenant', {
          groupId: config.membership.groupId,
          error: error.message
        });
      } else if (group && group.telegram_group_id) {
        cachedGroupChatId = group.telegram_group_id.toString();
        logger.info('[server] Multi-tenant: cached group chat ID', {
          groupId: config.membership.groupId,
          telegramGroupId: cachedGroupChatId
        });
      } else {
        logger.warn('[server] Multi-tenant: group has no telegram_group_id', {
          groupId: config.membership.groupId
        });
      }
    } catch (err) {
      logger.error('[server] Multi-tenant initialization error', { error: err.message });
    }
  }

  // Story 5.4: Log pending ready bets on startup (AC4)
  if (config.membership.groupId) {
    try {
      const { data: pendingBets, error: pendingErr } = await supabase
        .from('suggested_bets')
        .select(`
          id,
          league_matches (
            kickoff_time
          )
        `)
        .eq('bet_status', 'ready')
        .eq('group_id', config.membership.groupId);

      if (pendingErr) {
        logger.warn('[server] Failed to check pending bets on startup', {
          groupId: config.membership.groupId,
          error: pendingErr.message
        });
      } else if (pendingBets) {
        const pendingCount = pendingBets.length;
        const now = new Date();
        const expired = pendingBets.filter((b) => {
          const kickoff = b.league_matches?.kickoff_time;
          return kickoff && new Date(kickoff) <= now;
        });

        // Compute next post time (10h, 15h, 22h BRT)
        const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const h = brTime.getHours();
        const nextPostHour = h < 10 ? '10:00' : h < 15 ? '15:00' : h < 22 ? '22:00' : '10:00 (tomorrow)';

        if (pendingCount > 0) {
          logger.info('[server] Bot started with pending ready bets', {
            groupId: config.membership.groupId,
            pendingCount,
            nextPostTime: nextPostHour
          });
        }

        if (expired.length > 0) {
          logger.warn('[server] Found ready bets with expired kickoff', {
            groupId: config.membership.groupId,
            count: expired.length,
            expiredIds: expired.map(b => b.id)
          });
        }
      }
    } catch (err) {
      logger.warn('[server] Failed to check pending bets on startup', { error: err.message });
    }
  }

  // Setup webhook if URL provided
  if (WEBHOOK_URL) {
    await setupWebhook();
  } else {
    console.log('⚠️  WEBHOOK_URL not set - webhook not configured');
    console.log('   Render provides RENDER_EXTERNAL_URL automatically\n');
  }

  // Setup internal scheduler (async for dynamic scheduler init)
  await setupScheduler();

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

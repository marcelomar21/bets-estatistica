const express = require('express');
const logger = require('../lib/logger');
const { config } = require('../lib/config');
const { supabase } = require('../lib/supabase');
const { BaileyClient } = require('./client/baileyClient');
const {
  listNumbers,
  addNumber,
  getGroupNumbers,
  allocateToGroup,
  deallocateFromGroup,
  checkPoolHealth,
} = require('./pool/numberPoolService');
const { createWhatsAppGroup } = require('./services/groupService');
const { generateInviteLink, revokeInviteLink } = require('./services/inviteLinkService');
const { addWhatsAppChannel } = require('./services/addChannelService');
const { handleGroupParticipantsUpdate } = require('./handlers/memberEvents');

const { clients } = require('./clientRegistry');

const PORT = process.env.WHATSAPP_PORT || 3100;
const SHUTDOWN_TIMEOUT_MS = config.whatsapp?.shutdownTimeoutMs ?? 30000;

/**
 * Check if a number has valid auth state (creds exist in whatsapp_sessions).
 */
async function hasValidAuthState(numberId) {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('creds')
    .eq('number_id', numberId)
    .single();

  if (error || !data) return false;
  return data.creds !== null;
}

/**
 * Initialize and connect all active WhatsApp numbers from the database.
 * Uses Promise.allSettled for parallel startup (NFR4: <60s per number).
 */
async function initClients() {
  const result = await listNumbers();
  if (!result.success) {
    logger.error('Failed to load WhatsApp numbers', { error: result.error });
    return;
  }

  // Filter to reconnectable statuses (skip banned)
  const candidates = result.data.filter((n) =>
    ['available', 'active', 'backup', 'connecting'].includes(n.status)
  );

  // Only reconnect numbers with valid auth state (skip numbers that never completed QR)
  const authChecks = await Promise.allSettled(
    candidates.map(async (n) => ({ number: n, hasAuth: await hasValidAuthState(n.id) }))
  );

  const numbers = authChecks
    .filter((r) => r.status === 'fulfilled' && r.value.hasAuth)
    .map((r) => r.value.number);

  logger.info(`Initializing ${numbers.length} WhatsApp client(s) (${candidates.length - numbers.length} skipped — no auth state)`);

  const startTime = Date.now();

  // Parallel connect with timing
  const connectResults = await Promise.allSettled(
    numbers.map(async (number) => {
      const t0 = Date.now();
      const client = new BaileyClient(number.id, number.phone_number);
      // Story 15-1: Register group participants handler for member detection
      client.setGroupParticipantsHandler(handleGroupParticipantsUpdate);
      clients.set(number.id, client);
      try {
        await client.connect();
      } catch (err) {
        clients.delete(number.id); // Remove failed client from Map
        throw err;
      }
      const elapsed = Date.now() - t0;
      logger.info('Client connected', { numberId: number.id, phone: number.phone_number, elapsedMs: elapsed });
      return { numberId: number.id, elapsedMs: elapsed };
    })
  );

  // Log failures
  for (let i = 0; i < connectResults.length; i++) {
    const r = connectResults[i];
    if (r.status === 'rejected') {
      logger.error('Failed to init WhatsApp client', {
        numberId: numbers[i].id,
        phone: numbers[i].phone_number,
        error: r.reason?.message || String(r.reason),
      });
    }
  }

  const totalElapsed = Date.now() - startTime;
  logger.info('All clients initialized', { totalMs: totalElapsed, connected: clients.size });
}

/**
 * Graceful shutdown: save auth state and close all WebSockets.
 * Enforces a maximum timeout to prevent hanging.
 */
async function shutdown() {
  logger.info('WhatsApp server shutting down...');

  const disconnectPromises = [];
  for (const [numberId, client] of clients) {
    disconnectPromises.push(
      client.disconnect().catch((err) => {
        logger.error('Error disconnecting client', { numberId, error: err.message });
      })
    );
  }

  // Race disconnect against timeout to prevent hanging
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      logger.warn('Shutdown timeout reached, forcing exit', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
  });

  await Promise.race([
    Promise.all(disconnectPromises),
    timeoutPromise,
  ]);
  clearTimeout(timeoutId);

  clients.clear();
  logger.info('All WhatsApp clients disconnected');
}

/**
 * Create Express app with health check endpoint.
 */
function createApp() {
  const app = express();
  app.use(express.json());

  // Health check with reconnect stats
  app.get('/health', (req, res) => {
    const clientStatuses = {};
    for (const [, client] of clients) {
      const stats = client.getStats();
      clientStatuses[stats.numberId] = stats;
    }

    res.json({
      status: 'ok',
      service: 'whatsapp',
      clients: clients.size,
      details: clientStatuses,
    });
  });

  // Pool management routes

  // List all numbers
  app.get('/api/whatsapp/numbers', async (req, res) => {
    const result = await listNumbers({ status: req.query.status });
    res.json(result);
  });

  // Add a new number
  app.post('/api/whatsapp/numbers', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PHONE', message: 'phoneNumber is required' } });
    }
    const result = await addNumber(phoneNumber);
    res.status(result.success ? 201 : 400).json(result);
  });

  // Get numbers for a group
  app.get('/api/whatsapp/numbers/group/:groupId', async (req, res) => {
    const result = await getGroupNumbers(req.params.groupId);
    res.json(result);
  });

  // Allocate numbers to a group
  app.post('/api/whatsapp/numbers/group/:groupId/allocate', async (req, res) => {
    const result = await allocateToGroup(req.params.groupId);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Deallocate a number from its group
  app.delete('/api/whatsapp/numbers/:numberId/deallocate', async (req, res) => {
    const result = await deallocateFromGroup(req.params.numberId);
    res.json(result);
  });

  // Pool health check
  app.get('/api/whatsapp/pool/health', async (req, res) => {
    const result = await checkPoolHealth();
    res.json(result);
  });

  // Create WhatsApp group for a platform group
  app.post('/api/whatsapp/groups/:groupId/create', async (req, res) => {
    const { groupName } = req.body;
    const result = await createWhatsAppGroup(req.params.groupId, groupName);
    if (result.success) return res.status(201).json(result);
    const statusMap = { GROUP_NOT_FOUND: 404, ALREADY_EXISTS: 409 };
    const status = statusMap[result.error?.code] || 400;
    res.status(status).json(result);
  });

  // Add WhatsApp channel to an existing group (1-click orchestration)
  app.post('/api/whatsapp/groups/:groupId/add-channel', async (req, res) => {
    const result = await addWhatsAppChannel(req.params.groupId);
    if (result.success) return res.status(201).json(result);
    const statusMap = { GROUP_NOT_FOUND: 404, ALREADY_EXISTS: 409 };
    res.status(statusMap[result.error?.code] || 400).json(result);
  });

  // Generate invite link for a WhatsApp group
  app.post('/api/whatsapp/groups/:groupId/invite-link', async (req, res) => {
    const result = await generateInviteLink(req.params.groupId);
    if (result.success) return res.json(result);
    const statusMap = { GROUP_NOT_FOUND: 404, NO_WHATSAPP_GROUP: 400 };
    res.status(statusMap[result.error?.code] || 400).json(result);
  });

  // Revoke invite link and generate new one
  app.delete('/api/whatsapp/groups/:groupId/invite-link', async (req, res) => {
    const result = await revokeInviteLink(req.params.groupId);
    if (result.success) return res.json(result);
    const statusMap = { GROUP_NOT_FOUND: 404, NO_WHATSAPP_GROUP: 400 };
    res.status(statusMap[result.error?.code] || 400).json(result);
  });

  return app;
}

/**
 * Start the WhatsApp server.
 */
async function start() {
  const app = createApp();

  // Initialize WhatsApp clients
  await initClients();

  // Start Express
  const server = app.listen(PORT, () => {
    logger.info(`WhatsApp server listening on port ${PORT}`);
  });

  // Graceful shutdown handlers
  const handleShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down...`);
    await shutdown();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return { app, server };
}

// Run if executed directly
if (require.main === module) {
  start().catch((err) => {
    logger.error('Failed to start WhatsApp server', { error: err.message });
    process.exit(1);
  });
}

module.exports = { createApp, start, initClients, shutdown };

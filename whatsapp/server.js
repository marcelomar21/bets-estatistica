const express = require('express');
const logger = require('../lib/logger');
const { BaileyClient } = require('./client/baileyClient');
const { listNumbers } = require('./pool/numberPoolService');

const PORT = process.env.WHATSAPP_PORT || 3100;

// Active client instances keyed by numberId
const clients = new Map();

/**
 * Initialize and connect all active WhatsApp numbers from the database.
 */
async function initClients() {
  const result = await listNumbers();
  if (!result.success) {
    logger.error('Failed to load WhatsApp numbers', { error: result.error });
    return;
  }

  const numbers = result.data.filter((n) =>
    ['available', 'active', 'backup', 'connecting'].includes(n.status)
  );

  logger.info(`Initializing ${numbers.length} WhatsApp client(s)`);

  for (const number of numbers) {
    try {
      const client = new BaileyClient(number.id, number.phone_number);
      clients.set(number.id, client);
      await client.connect();
    } catch (err) {
      logger.error('Failed to init WhatsApp client', {
        numberId: number.id,
        phone: number.phone_number,
        error: err.message,
      });
    }
  }
}

/**
 * Graceful shutdown: save auth state and close all WebSockets.
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

  await Promise.all(disconnectPromises);
  clients.clear();
  logger.info('All WhatsApp clients disconnected');
}

/**
 * Create Express app with health check endpoint.
 */
function createApp() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    const clientStatuses = {};
    for (const [numberId, client] of clients) {
      clientStatuses[numberId] = {
        phone: client.phoneNumber,
        connected: client.socket !== null,
      };
    }

    res.json({
      status: 'ok',
      service: 'whatsapp',
      clients: clients.size,
      details: clientStatuses,
    });
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

module.exports = { createApp, start, initClients, shutdown, clients };

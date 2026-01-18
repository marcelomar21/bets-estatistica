/**
 * Cakto Webhook Server
 * Story 16.2: Criar Webhook Server com Event Sourcing
 *
 * Server Express separado para receber webhooks do Cakto.
 * Roda na porta 3001 (separado do bot Telegram na 3000).
 *
 * Características:
 * - Rate limiting (100 req/min por IP)
 * - Security headers via helmet
 * - Payload limit 1MB
 * - HMAC signature validation
 * - Event sourcing assíncrono
 *
 * Usage: node bot/webhook-server.js
 */
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('../lib/logger');
const { validateHmacSignature, handleCaktoWebhook } = require('./handlers/caktoWebhook');

const app = express();

// Security headers
app.use(helmet());

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
  handler: (req, res) => {
    logger.warn('[cakto:webhook] Rate limit exceeded', { ip: req.ip });
    res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' });
  }
});

app.use(limiter);

// JSON body parser with 1MB limit
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    // Store raw body for HMAC validation
    req.rawBody = buf.toString();
  }
}));

// Handle payload too large
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    logger.warn('[cakto:webhook] Payload too large', { size: req.headers['content-length'] });
    return res.status(413).json({ error: 'WEBHOOK_PAYLOAD_TOO_LARGE', message: 'Payload exceeds 1MB limit' });
  }
  next(err);
});

// Port configuration (ensure numeric for consistent response type)
const PORT = parseInt(process.env.CAKTO_WEBHOOK_PORT, 10) || 3001;

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

/**
 * Cakto webhook endpoint
 * - Validates HMAC signature
 * - Saves event to webhook_events table
 * - Responds 200 immediately (async processing via job)
 */
app.post('/webhooks/cakto', validateHmacSignature, handleCaktoWebhook);

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  logger.error('[cakto:webhook] Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
});

/**
 * Start server
 */
function startServer() {
  app.listen(PORT, () => {
    logger.info('[cakto:webhook] Server started', { port: PORT });
  });
}

// Start if run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

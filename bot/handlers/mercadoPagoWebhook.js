/**
 * Mercado Pago Webhook Handler
 * Tech-Spec: Migração Cakto → Mercado Pago
 *
 * Recebe e valida webhooks do Mercado Pago.
 * Salva eventos para processamento assíncrono via job.
 *
 * Documentação MP: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
const crypto = require('crypto');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Validate Mercado Pago webhook signature (HMAC)
 *
 * MP envia:
 * - Header x-signature: ts=timestamp,v1=hmac_hex
 * - Header x-request-id: request identifier
 *
 * Manifest para HMAC: "id:{data.id};request-id:{x-request-id};ts:{ts};"
 *
 * @param {object} req - Express request
 * @returns {boolean} True if signature is valid
 */
function validateSignature(req) {
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('[mercadoPago:webhook] MP_WEBHOOK_SECRET not configured');
    return false;
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  if (!xSignature) {
    logger.warn('[mercadoPago:webhook] Missing x-signature header');
    return false;
  }

  // Parse x-signature: "ts=1234567890,v1=abc123..."
  const parts = xSignature.split(',');
  const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
  const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];

  if (!ts || !v1) {
    logger.warn('[mercadoPago:webhook] Invalid x-signature format');
    return false;
  }

  const dataId = req.body?.data?.id;

  // Build manifest according to MP documentation
  // Format: "id:{id};request-id:{request-id};ts:{ts};"
  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  // Calculate expected HMAC
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(manifest)
    .digest('hex');

  // Timing-safe comparison
  try {
    const v1Buffer = Buffer.from(v1, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (v1Buffer.length !== expectedBuffer.length) {
      logger.warn('[mercadoPago:webhook] Signature length mismatch');
      return false;
    }

    return crypto.timingSafeEqual(v1Buffer, expectedBuffer);
  } catch (err) {
    logger.error('[mercadoPago:webhook] Signature comparison error', { error: err.message });
    return false;
  }
}

/**
 * Middleware to validate webhook signature
 */
function validateSignatureMiddleware(req, res, next) {
  // Skip validation in development if configured
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_WEBHOOK_VALIDATION === 'true') {
    logger.warn('[mercadoPago:webhook] Skipping signature validation (dev mode)');
    return next();
  }

  if (!validateSignature(req)) {
    logger.warn('[mercadoPago:webhook] Invalid signature');
    return res.status(401).json({ error: 'WEBHOOK_INVALID_SIGNATURE', message: 'Invalid signature' });
  }

  logger.debug('[mercadoPago:webhook] Signature validated');
  next();
}

/**
 * Main webhook handler
 * Saves event to webhook_events table and responds 200 immediately.
 * Processing happens async via process-webhooks job.
 */
async function handleWebhook(req, res) {
  const startTime = Date.now();

  try {
    // MP webhook payload structure:
    // { type: "subscription_preapproval", action: "created", data: { id: "xxx" }, ... }
    const { type, action, data } = req.body;

    // Validate required fields
    if (!type || !data?.id) {
      logger.warn('[mercadoPago:webhook] Invalid payload', { type, hasData: !!data });
      return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Missing type or data.id' });
    }

    // Build idempotency key from event type + action + data.id
    const idempotencyKey = `mp_${type}_${action || 'unknown'}_${data.id}`;

    logger.info('[mercadoPago:webhook] Received webhook', {
      type,
      action,
      dataId: data.id,
      idempotencyKey
    });

    // Save event for async processing (upsert with ignoreDuplicates)
    const { data: savedEvent, error } = await supabase
      .from('webhook_events')
      .upsert(
        {
          idempotency_key: idempotencyKey,
          event_type: type,
          payload: req.body,
          status: 'pending'
        },
        {
          onConflict: 'idempotency_key',
          ignoreDuplicates: true
        }
      )
      .select()
      .single();

    if (error) {
      // Handle duplicate (might return error depending on Supabase version)
      if (error.code === 'PGRST116' || error.message?.includes('duplicate')) {
        logger.info('[mercadoPago:webhook] Duplicate webhook ignored', { idempotencyKey });
        return res.status(200).json({ received: true, duplicate: true });
      }

      logger.error('[mercadoPago:webhook] Failed to save event', {
        idempotencyKey,
        error: error.message
      });
      return res.status(500).json({ error: 'DB_ERROR', message: 'Failed to save webhook event' });
    }

    // Check if this was a duplicate (savedEvent will be null if ignored)
    if (!savedEvent) {
      logger.info('[mercadoPago:webhook] Duplicate webhook ignored', { idempotencyKey });
      return res.status(200).json({ received: true, duplicate: true });
    }

    const duration = Date.now() - startTime;
    logger.info('[mercadoPago:webhook] Event saved successfully', {
      idempotencyKey,
      type,
      action,
      dbId: savedEvent.id,
      durationMs: duration
    });

    // Respond 200 immediately - processing happens async via job
    return res.status(200).json({ received: true, eventId: savedEvent.id });

  } catch (err) {
    logger.error('[mercadoPago:webhook] Unexpected error', {
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected error' });
  }
}

module.exports = {
  validateSignature,
  validateSignatureMiddleware,
  handleWebhook
};

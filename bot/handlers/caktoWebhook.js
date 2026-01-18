/**
 * Cakto Webhook Handler
 * Story 16.2: Criar Webhook Server com Event Sourcing
 *
 * Handles incoming webhooks from Cakto payment platform.
 * Validates HMAC signature and saves events for async processing.
 */
const crypto = require('crypto');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Middleware to validate webhook secret from Cakto
 * Cakto sends the secret in the body payload (not header)
 * Uses crypto.timingSafeEqual to prevent timing attacks
 */
function validateHmacSignature(req, res, next) {
  const configuredSecret = process.env.CAKTO_WEBHOOK_SECRET;

  if (!configuredSecret) {
    logger.error('[cakto:webhook] CAKTO_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Webhook secret not configured' });
  }

  // Cakto sends secret in the body, not in header
  const receivedSecret = req.body?.secret;

  if (!receivedSecret) {
    logger.warn('[cakto:webhook] Missing secret in payload');
    return res.status(401).json({ error: 'WEBHOOK_INVALID_SIGNATURE', message: 'Missing secret' });
  }

  try {
    // Use timing-safe comparison to prevent timing attacks
    const receivedBuffer = Buffer.from(String(receivedSecret));
    const expectedBuffer = Buffer.from(String(configuredSecret));

    // If lengths differ, secrets don't match
    if (receivedBuffer.length !== expectedBuffer.length) {
      logger.warn('[cakto:webhook] Secret length mismatch');
      return res.status(401).json({ error: 'WEBHOOK_INVALID_SIGNATURE', message: 'Invalid secret' });
    }

    const isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

    if (!isValid) {
      logger.warn('[cakto:webhook] Invalid secret');
      return res.status(401).json({ error: 'WEBHOOK_INVALID_SIGNATURE', message: 'Invalid secret' });
    }

    logger.debug('[cakto:webhook] Secret validated successfully');
    next();
  } catch (err) {
    logger.error('[cakto:webhook] Secret validation error', { error: err.message });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Secret validation failed' });
  }
}

/**
 * Main webhook handler
 * Saves event to webhook_events table with idempotency
 * Responds 200 immediately - processing happens async via job
 */
async function handleCaktoWebhook(req, res) {
  const startTime = Date.now();

  try {
    // Cakto payload structure: { event, secret, data: { id, refId, ... } }
    const { event, data } = req.body;

    // Map Cakto fields to our internal naming
    const event_type = event;
    // Use data.id as base for idempotency key (unique transaction ID)
    const transaction_id = data?.id || data?.refId;
    // Composite key: event_type + transaction_id (same order can have multiple events)
    const event_id = transaction_id ? `${event_type}_${transaction_id}` : null;

    // Validate required fields
    if (!event_id) {
      logger.warn('[cakto:webhook] Missing event_id (data.id) in payload', { event });
      return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Missing data.id' });
    }

    if (!event_type) {
      logger.warn('[cakto:webhook] Missing event type in payload');
      return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Missing event' });
    }

    logger.info('[cakto:webhook] Received webhook', { eventId: event_id, eventType: event_type });

    // Save event with idempotency (upsert with ignoreDuplicates)
    const { data: savedEvent, error } = await supabase
      .from('webhook_events')
      .upsert(
        {
          idempotency_key: event_id,
          event_type: event_type,
          payload: data,
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
      // Check if it's a duplicate (Supabase may return error for ignored duplicates)
      if (error.code === 'PGRST116' || error.message?.includes('duplicate')) {
        logger.info('[cakto:webhook] Duplicate webhook ignored', { eventId: event_id });
        return res.status(200).json({ received: true, duplicate: true });
      }

      logger.error('[cakto:webhook] Failed to save event', { eventId: event_id, error: error.message });
      return res.status(500).json({ error: 'DB_ERROR', message: 'Failed to save webhook event' });
    }

    // Check if this was a duplicate (savedEvent will be null if ignored)
    if (!savedEvent) {
      logger.info('[cakto:webhook] Duplicate webhook ignored', { eventId: event_id });
      return res.status(200).json({ received: true, duplicate: true });
    }

    const duration = Date.now() - startTime;
    logger.info('[cakto:webhook] Event saved successfully', {
      eventId: event_id,
      eventType: event_type,
      dbId: savedEvent.id,
      durationMs: duration
    });

    // Respond immediately - processing happens async via job (Story 16.3)
    return res.status(200).json({ received: true, eventId: savedEvent.id });

  } catch (err) {
    logger.error('[cakto:webhook] Unexpected error', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected error processing webhook' });
  }
}

module.exports = {
  validateHmacSignature,
  handleCaktoWebhook
};

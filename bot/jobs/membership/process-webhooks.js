/**
 * Job: Process Webhooks - Process pending Cakto webhook events
 * Story 16.3: Implementar Processamento Assíncrono de Webhooks
 *
 * Processes pending webhook events from the webhook_events table.
 * Events are saved by the webhook handler (Story 16.2) and processed here asynchronously.
 *
 * Run: node bot/jobs/membership/process-webhooks.js
 * Schedule: setInterval every 30 seconds (sub-minute, can't use cron)
 */
require('dotenv').config();

const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');
const { processWebhookEvent } = require('../../services/webhookProcessors');
const { webhookProcessingAlert } = require('../../services/alertService');

// Configuration
const CONFIG = {
  BATCH_SIZE: 10,                    // Max events to process per run
  STUCK_TIMEOUT_MINUTES: 5,          // Reset 'processing' events older than this
  MAX_ATTEMPTS: 5,                   // Max retry attempts before marking failed
};

// Lock to prevent concurrent runs (in-memory, same process)
// Pattern from healthCheck.js:38
let processWebhooksRunning = false;

/**
 * Main entry point - runs the webhook processor with lock
 * @returns {Promise<{success: boolean, processed?: number, failed?: number, skipped?: boolean}>}
 */
async function runProcessWebhooks() {
  // Prevent concurrent runs
  if (processWebhooksRunning) {
    logger.debug('[membership:process-webhooks] Already running, skipping');
    return { success: true, skipped: true };
  }
  processWebhooksRunning = true;

  try {
    return await _processWebhooksInternal();
  } finally {
    processWebhooksRunning = false;
  }
}

/**
 * Internal processor - handles the actual webhook processing
 * @returns {Promise<{success: boolean, processed: number, failed: number}>}
 */
async function _processWebhooksInternal() {
  const startTime = Date.now();
  logger.info('[membership:process-webhooks] Starting webhook processing');

  let processed = 0;
  let failed = 0;

  try {
    // Step 1: Recovery - Reset stuck 'processing' events (AC7)
    await recoverStuckEvents();

    // Step 2: Fetch pending events (AC1)
    const { data: events, error: fetchError } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(CONFIG.BATCH_SIZE);

    if (fetchError) {
      logger.error('[membership:process-webhooks] Failed to fetch events', { error: fetchError.message });
      return { success: false, processed: 0, failed: 0, error: fetchError.message };
    }

    if (!events || events.length === 0) {
      logger.debug('[membership:process-webhooks] No pending events');
      return { success: true, processed: 0, failed: 0 };
    }

    logger.info('[membership:process-webhooks] Found pending events', { count: events.length });

    // Step 3: Process each event
    for (const event of events) {
      const result = await processEvent(event);
      if (result.success) {
        processed++;
      } else {
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('[membership:process-webhooks] Processing complete', {
      processed,
      failed,
      durationMs: duration
    });

    return { success: true, processed, failed };

  } catch (err) {
    logger.error('[membership:process-webhooks] Unexpected error', { error: err.message, stack: err.stack });
    return { success: false, processed, failed, error: err.message };
  }
}

/**
 * Recover events stuck in 'processing' status (AC7)
 * Events stuck for more than STUCK_TIMEOUT_MINUTES are reset to 'pending'
 */
async function recoverStuckEvents() {
  const cutoffTime = new Date(Date.now() - CONFIG.STUCK_TIMEOUT_MINUTES * 60 * 1000);

  const { data: stuckEvents, error: fetchError } = await supabase
    .from('webhook_events')
    .select('id, idempotency_key, attempts')
    .eq('status', 'processing')
    .lt('updated_at', cutoffTime.toISOString());

  if (fetchError) {
    logger.warn('[membership:process-webhooks] Failed to check stuck events', { error: fetchError.message });
    return;
  }

  if (!stuckEvents || stuckEvents.length === 0) {
    return;
  }

  logger.warn('[membership:process-webhooks] Found stuck events', { count: stuckEvents.length });

  for (const event of stuckEvents) {
    const newAttempts = event.attempts + 1;

    // Check if max attempts reached
    if (newAttempts >= CONFIG.MAX_ATTEMPTS) {
      // Mark as failed
      await supabase
        .from('webhook_events')
        .update({
          status: 'failed',
          attempts: newAttempts,
          last_error: `Stuck in processing for > ${CONFIG.STUCK_TIMEOUT_MINUTES} minutes, max attempts reached`
        })
        .eq('id', event.id);

      logger.error('[membership:process-webhooks] Stuck event marked as failed', {
        eventId: event.id,
        idempotencyKey: event.idempotency_key,
        attempts: newAttempts
      });
    } else {
      // Reset to pending with incremented attempts
      await supabase
        .from('webhook_events')
        .update({
          status: 'pending',
          attempts: newAttempts,
          last_error: `Reset from stuck processing state after ${CONFIG.STUCK_TIMEOUT_MINUTES} minutes`
        })
        .eq('id', event.id);

      logger.warn('[membership:process-webhooks] Stuck event reset to pending', {
        eventId: event.id,
        idempotencyKey: event.idempotency_key,
        attempts: newAttempts
      });
    }
  }
}

/**
 * Process a single webhook event
 * @param {object} event - Webhook event from database
 * @returns {Promise<{success: boolean}>}
 */
async function processEvent(event) {
  const { id, idempotency_key, event_type, payload, attempts } = event;

  logger.info('[membership:process-webhooks] Processing event', {
    eventId: id,
    idempotencyKey: idempotency_key,
    eventType: event_type,
    attempt: attempts + 1
  });

  try {
    // Step 1: Mark as processing (optimistic locking)
    const { error: updateError } = await supabase
      .from('webhook_events')
      .update({ status: 'processing' })
      .eq('id', id)
      .eq('status', 'pending'); // Optimistic lock

    if (updateError) {
      logger.warn('[membership:process-webhooks] Failed to mark as processing', {
        eventId: id,
        error: updateError.message
      });
      return { success: false };
    }

    // Step 2: Call the appropriate handler
    const result = await processWebhookEvent({ event_type, payload });

    // Step 3: Update based on result
    if (result.success) {
      // Mark as completed
      await supabase
        .from('webhook_events')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', id);

      logger.info('[membership:process-webhooks] Event processed successfully', {
        eventId: id,
        eventType: event_type
      });

      return { success: true };

    } else {
      // Increment attempts and record error
      const newAttempts = attempts + 1;
      const errorMessage = result.error?.message || 'Unknown error';

      if (newAttempts >= CONFIG.MAX_ATTEMPTS) {
        // Mark as failed (AC5)
        await supabase
          .from('webhook_events')
          .update({
            status: 'failed',
            attempts: newAttempts,
            last_error: errorMessage
          })
          .eq('id', id);

        logger.error('[membership:process-webhooks] Event failed permanently', {
          eventId: id,
          eventType: event_type,
          attempts: newAttempts,
          error: errorMessage
        });

        // Send alert to admin
        try {
          await webhookProcessingAlert(idempotency_key, event_type, errorMessage, newAttempts);
        } catch (alertErr) {
          logger.error('[membership:process-webhooks] Failed to send alert', { error: alertErr.message });
        }

      } else {
        // Reset to pending for retry
        await supabase
          .from('webhook_events')
          .update({
            status: 'pending',
            attempts: newAttempts,
            last_error: errorMessage
          })
          .eq('id', id);

        logger.warn('[membership:process-webhooks] Event failed, will retry', {
          eventId: id,
          eventType: event_type,
          attempts: newAttempts,
          error: errorMessage
        });
      }

      return { success: false };
    }

  } catch (err) {
    // Unexpected error - reset to pending
    const newAttempts = attempts + 1;

    await supabase
      .from('webhook_events')
      .update({
        status: 'pending',
        attempts: newAttempts,
        last_error: err.message
      })
      .eq('id', id);

    logger.error('[membership:process-webhooks] Unexpected error processing event', {
      eventId: id,
      eventType: event_type,
      error: err.message
    });

    return { success: false };
  }
}

// Run if called directly
if (require.main === module) {
  runProcessWebhooks()
    .then(result => {
      console.log('Process webhooks result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Process webhooks failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  runProcessWebhooks,
  CONFIG,
};

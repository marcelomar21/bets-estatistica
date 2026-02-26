/**
 * Send Scheduled Messages Job
 * Stories covered: 5.3
 *
 * Fetches pending messages whose scheduled_at <= NOW() and sends them
 * via the Telegram Bot API to the corresponding public group.
 *
 * Retry: attempts < 3 → retry next cycle; attempts >= 3 → mark failed.
 * Run: node bot/jobs/sendScheduledMessages.js
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { getBotForGroup, sendToPublic, sendMediaToPublic, sendToAdmin } = require('../telegram');

/**
 * Main job function — sends scheduled messages that are due
 * @param {object} [options={}]
 * @returns {Promise<{sent: number, failed: number, retried: number}>}
 */
async function runSendScheduledMessages(options = {}) {
  logger.info('[sendScheduledMessages] Starting job');

  const now = new Date().toISOString();

  // Fetch pending messages whose scheduled time has arrived
  const { data: messages, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (error) {
    logger.error('[sendScheduledMessages] Failed to fetch messages', { error: error.message });
    throw new Error(`DB query failed: ${error.message}`);
  }

  if (!messages || messages.length === 0) {
    logger.info('[sendScheduledMessages] No pending messages to send');
    return { sent: 0, failed: 0, retried: 0 };
  }

  logger.info('[sendScheduledMessages] Found pending messages', { count: messages.length });

  let sent = 0;
  let failed = 0;
  let retried = 0;

  // Process sequentially — failure in one must not block others
  for (const msg of messages) {
    try {
      const botCtx = getBotForGroup(msg.group_id);

      if (!botCtx) {
        logger.warn('[sendScheduledMessages] No bot registered for group', {
          groupId: msg.group_id,
          messageId: msg.id,
        });

        // Mark as failed — no bot means can't send
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            attempts: msg.attempts + 1,
          })
          .eq('id', msg.id);

        failed++;
        continue;
      }

      // Send via Telegram — media or text-only
      let result;

      if (msg.media_storage_path && msg.media_type) {
        // Generate signed URL for the media file
        const { data: signedData, error: signError } = await supabase.storage
          .from('message-media')
          .createSignedUrl(msg.media_storage_path, 300); // 5-min expiry

        if (signError || !signedData?.signedUrl) {
          logger.error('[sendScheduledMessages] Failed to generate signed URL', {
            messageId: msg.id,
            path: msg.media_storage_path,
            error: signError?.message,
          });
          result = { success: false, error: { code: 'STORAGE_ERROR', message: 'Failed to generate signed URL' } };
        } else {
          result = await sendMediaToPublic(
            msg.media_type,
            signedData.signedUrl,
            msg.message_text || null,
            botCtx,
          );
        }
      } else {
        // Text-only message (original behavior)
        result = await sendToPublic(msg.message_text, botCtx);
      }

      if (result.success) {
        // Update to sent
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            telegram_message_id: result.data.messageId,
            attempts: msg.attempts + 1,
          })
          .eq('id', msg.id);

        sent++;
        logger.info('[sendScheduledMessages] Message sent', {
          messageId: msg.id,
          groupId: msg.group_id,
          telegramMessageId: result.data.messageId,
        });
      } else {
        // Send failed — apply retry logic
        const newAttempts = msg.attempts + 1;

        if (newAttempts >= 3) {
          // Max retries reached — mark failed
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'failed',
              attempts: newAttempts,
            })
            .eq('id', msg.id);

          failed++;
          logger.error('[sendScheduledMessages] Message permanently failed after 3 attempts', {
            messageId: msg.id,
            groupId: msg.group_id,
            error: result.error?.message,
          });
        } else {
          // Retry next cycle — just increment attempts
          await supabase
            .from('scheduled_messages')
            .update({ attempts: newAttempts })
            .eq('id', msg.id);

          retried++;
          logger.warn('[sendScheduledMessages] Message will retry', {
            messageId: msg.id,
            groupId: msg.group_id,
            attempt: newAttempts,
            error: result.error?.message,
          });
        }
      }
    } catch (err) {
      // Unexpected error for this message — apply retry logic
      const newAttempts = (msg.attempts || 0) + 1;

      try {
        if (newAttempts >= 3) {
          await supabase
            .from('scheduled_messages')
            .update({ status: 'failed', attempts: newAttempts })
            .eq('id', msg.id);
          failed++;
        } else {
          await supabase
            .from('scheduled_messages')
            .update({ attempts: newAttempts })
            .eq('id', msg.id);
          retried++;
        }
      } catch (updateErr) {
        logger.error('[sendScheduledMessages] Failed to update message status', {
          messageId: msg.id,
          error: updateErr.message,
        });
        failed++;
      }

      logger.error('[sendScheduledMessages] Unexpected error processing message', {
        messageId: msg.id,
        groupId: msg.group_id,
        attempt: newAttempts,
        error: err.message,
      });
    }
  }

  const summary = { sent, failed, retried };
  logger.info('[sendScheduledMessages] Job complete', summary);
  return summary;
}

// CLI runner
if (require.main === module) {
  runSendScheduledMessages()
    .then((result) => {
      console.log('✅ sendScheduledMessages complete:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ sendScheduledMessages failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runSendScheduledMessages };

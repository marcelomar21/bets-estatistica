/**
 * Helper for inserting admin panel notifications from the bot.
 * Fire-and-forget — never blocks the calling flow.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Insert a notification into the admin panel notifications table.
 * No dedup/throttling — each event is distinct (different member each time).
 * For high-volume scenarios, consider batching at the caller level.
 * @param {Object} params
 * @param {string} params.type - Notification type (e.g. 'new_trial', 'payment_received')
 * @param {string} params.severity - 'info' | 'warning' | 'error' | 'success'
 * @param {string} params.title - Short title
 * @param {string} params.message - Descriptive message
 * @param {string|null} params.groupId - Group UUID (nullable)
 * @param {Object} [params.metadata] - Additional metadata
 */
async function insertAdminNotification({ type, severity, title, message, groupId, metadata }) {
  try {
    const { error } = await supabase.from('notifications').insert({
      type,
      severity,
      title,
      message,
      group_id: groupId || null,
      metadata: metadata || {},
    });
    if (error) {
      logger.warn('[notificationHelper] Failed to insert notification', { type, error: error.message });
    }
  } catch (err) {
    logger.warn('[notificationHelper] Error inserting notification', { type, error: err.message });
  }
}

module.exports = { insertAdminNotification };

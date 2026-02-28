/**
 * Heartbeat Service — Story 16-2
 * Periodic health monitoring for WhatsApp number connections.
 *
 * Runs every 60 seconds:
 * 1. Check each client's WebSocket connection state
 * 2. Log heartbeat to bot_health table
 * 3. Track consecutive failures — 3+ cycles → mark unhealthy, 5+ → trigger failover
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { clients } = require('../clientRegistry');
const { alertAdmin } = require('../../bot/services/alertService');

// In-memory consecutive failure counters per numberId
const failureCounts = new Map();

// Threshold constants
const UNHEALTHY_THRESHOLD = 3;  // 3 consecutive failures → mark unhealthy
const FAILOVER_THRESHOLD = 5;   // 5 consecutive failures → trigger failover

/**
 * Run a single heartbeat cycle for all connected clients.
 * @returns {Promise<{checked: number, healthy: number, unhealthy: number, failovers: number}>}
 */
async function runHeartbeatCycle() {
  const results = { checked: 0, healthy: 0, unhealthy: 0, failovers: 0 };

  if (clients.size === 0) {
    logger.debug('[heartbeat] No clients to check');
    return results;
  }

  for (const [numberId, client] of clients) {
    results.checked++;
    const stats = client.getStats();
    const isConnected = stats.connected;

    if (isConnected) {
      // Reset failure counter on successful heartbeat
      failureCounts.delete(numberId);
      results.healthy++;

      await _recordHeartbeat(numberId, 'online');
      await _updateNumberHeartbeat(numberId);
    } else {
      // Increment failure counter
      const count = (failureCounts.get(numberId) || 0) + 1;
      failureCounts.set(numberId, count);
      results.unhealthy++;

      await _recordHeartbeat(numberId, 'offline', `Disconnected for ${count} cycle(s)`);

      if (count === UNHEALTHY_THRESHOLD) {
        logger.warn('[heartbeat] Number unhealthy — 3 consecutive failures', { numberId, consecutiveFailures: count });
        await _markUnhealthy(numberId);
        await _alertConnectionLost(numberId, stats.phone, count);
      }

      if (count === FAILOVER_THRESHOLD) {
        logger.error('[heartbeat] Triggering failover — 5 consecutive failures', { numberId, consecutiveFailures: count });
        results.failovers++;
        await _triggerUnhealthyFailover(numberId);
      }
    }
  }

  logger.debug('[heartbeat] Cycle complete', results);
  return results;
}

/**
 * Record heartbeat result in bot_health table.
 * Uses select + update/insert pattern because the unique index uses COALESCE expression.
 */
async function _recordHeartbeat(numberId, status, errorMessage = null) {
  const now = new Date().toISOString();

  // Resolve group_id for this number
  const { data: numData } = await supabase
    .from('whatsapp_numbers')
    .select('group_id')
    .eq('id', numberId)
    .single();

  const groupId = numData?.group_id || null;

  // Check if row exists
  const { data: existing } = await supabase
    .from('bot_health')
    .select('id')
    .eq('channel', 'whatsapp')
    .eq('number_id', numberId)
    .limit(1);

  const payload = {
    group_id: groupId,
    channel: 'whatsapp',
    number_id: numberId,
    status,
    last_heartbeat: now,
    error_message: errorMessage,
    updated_at: now,
  };

  let error;
  if (existing && existing.length > 0) {
    ({ error } = await supabase
      .from('bot_health')
      .update(payload)
      .eq('id', existing[0].id));
  } else {
    ({ error } = await supabase
      .from('bot_health')
      .insert(payload));
  }

  if (error) {
    logger.warn('[heartbeat] Failed to record heartbeat', { numberId, error: error.message });
  }
}

/**
 * Update last_heartbeat in whatsapp_numbers.
 */
async function _updateNumberHeartbeat(numberId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('whatsapp_numbers')
    .update({ last_heartbeat: now, updated_at: now })
    .eq('id', numberId);

  if (error) {
    logger.warn('[heartbeat] Failed to update number heartbeat', { numberId, error: error.message });
  }
}

/**
 * Mark a number as unhealthy in whatsapp_numbers.
 */
async function _markUnhealthy(numberId) {
  const { error } = await supabase
    .from('whatsapp_numbers')
    .update({ status: 'cooldown', updated_at: new Date().toISOString() })
    .eq('id', numberId);

  if (error) {
    logger.warn('[heartbeat] Failed to mark number as unhealthy', { numberId, error: error.message });
  }
}

/**
 * Trigger failover for an unhealthy number.
 */
async function _triggerUnhealthyFailover(numberId) {
  // Resolve group_id
  const { data: numData, error: queryErr } = await supabase
    .from('whatsapp_numbers')
    .select('group_id, phone_number')
    .eq('id', numberId)
    .single();

  if (queryErr || !numData?.group_id) {
    logger.warn('[heartbeat] Cannot trigger failover — no group_id', { numberId });
    return;
  }

  try {
    const { handleFailover } = require('./failoverService');
    const result = await handleFailover(numberId, numData.group_id, 'unhealthy');
    if (result.success) {
      logger.info('[heartbeat] Unhealthy failover completed', { numberId, data: result.data });
      // Remove from failure tracking
      failureCounts.delete(numberId);
    } else {
      logger.error('[heartbeat] Unhealthy failover failed', { numberId, error: result.error });
    }
  } catch (err) {
    logger.error('[heartbeat] Failover error', { numberId, error: err.message });
  }
}

/**
 * Alert admin about connection loss.
 */
async function _alertConnectionLost(numberId, phone, consecutiveFailures) {
  const msg = `ALERTA: Numero WhatsApp perdeu conexao\n\nNumero: ${phone || numberId}\nFalhas consecutivas: ${consecutiveFailures}\nStatus: unhealthy\n\nSistema tentara failover se nao reconectar em 2 minutos.`;
  try {
    await alertAdmin(msg);
  } catch (err) {
    logger.warn('[heartbeat] Failed to send connection loss alert', { error: err.message });
  }
}

/**
 * Reset failure tracking (used on shutdown or when client reconnects externally).
 */
function resetFailureCounts() {
  failureCounts.clear();
}

/**
 * Get current failure counts (for testing/debugging).
 */
function getFailureCounts() {
  return new Map(failureCounts);
}

module.exports = {
  runHeartbeatCycle,
  resetFailureCounts,
  getFailureCounts,
  UNHEALTHY_THRESHOLD,
  FAILOVER_THRESHOLD,
};

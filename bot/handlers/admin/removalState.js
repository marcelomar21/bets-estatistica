/**
 * Removal State Management
 * Story 17.1: Extraído para resolver dependência circular entre memberCommands e callbackHandlers
 *
 * Gerencia o estado de remoções pendentes (confirmações com botões inline)
 *
 * ⚠️ NOTA: Este state é mantido em memória. Se o bot reiniciar enquanto há
 * confirmações pendentes, elas serão perdidas. O TTL de 60s minimiza o impacto,
 * mas usuários podem ficar com botões órfãos após restart.
 */
const logger = require('../../../lib/logger');

// Story 16.7: ADR-003 - Pending removals with auto-cleanup 60s
// NOTE: In-memory state - lost on restart. TTL of 60s mitigates impact.
const pendingRemovals = new Map();
const REMOVAL_TIMEOUT_MS = 60000;

/**
 * Get pending removals map
 * @returns {Map} - The pending removals Map
 */
function getPendingRemovals() {
  return pendingRemovals;
}

/**
 * Get removal timeout constant
 * @returns {number} - Timeout in milliseconds
 */
function getRemovalTimeoutMs() {
  return REMOVAL_TIMEOUT_MS;
}

/**
 * Add a pending removal with auto-cleanup timeout
 * @param {string} callbackId - Unique callback ID
 * @param {object} data - Removal data
 * @returns {NodeJS.Timeout} - The timeout ID
 */
function addPendingRemoval(callbackId, data) {
  const timeoutId = setTimeout(() => {
    if (pendingRemovals.has(callbackId)) {
      pendingRemovals.delete(callbackId);
      logger.debug('[admin:removal-state] Pending removal expired', { callbackId });
    }
  }, REMOVAL_TIMEOUT_MS);

  pendingRemovals.set(callbackId, { ...data, timeoutId });

  // Warn if there are many pending removals (possible memory leak or stuck confirmations)
  if (pendingRemovals.size > 10) {
    logger.warn('[admin:removal-state] High number of pending removals', {
      count: pendingRemovals.size,
      note: 'In-memory state - will be lost on restart'
    });
  }

  return timeoutId;
}

/**
 * Get and remove a pending removal (atomic operation)
 * @param {string} callbackId - Callback ID to retrieve
 * @returns {object|null} - The pending data or null if not found/expired
 */
function consumePendingRemoval(callbackId) {
  const data = pendingRemovals.get(callbackId);
  if (!data) return null;

  // Clear timeout and remove from map
  clearTimeout(data.timeoutId);
  pendingRemovals.delete(callbackId);

  return data;
}

/**
 * Check if a pending removal exists
 * @param {string} callbackId - Callback ID to check
 * @returns {boolean}
 */
function hasPendingRemoval(callbackId) {
  return pendingRemovals.has(callbackId);
}

/**
 * Get count of pending removals (for debugging)
 * @returns {number}
 */
function getPendingRemovalCount() {
  return pendingRemovals.size;
}

module.exports = {
  getPendingRemovals,
  getRemovalTimeoutMs,
  addPendingRemoval,
  consumePendingRemoval,
  hasPendingRemoval,
  getPendingRemovalCount,
  REMOVAL_TIMEOUT_MS
};

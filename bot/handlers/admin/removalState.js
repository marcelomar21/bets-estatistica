/**
 * Removal State Management
 * Story 17.1: Extraído para resolver dependência circular entre memberCommands e callbackHandlers
 *
 * Gerencia o estado de remoções pendentes (confirmações com botões inline)
 */
const logger = require('../../../lib/logger');

// Story 16.7: ADR-003 - Pending removals with auto-cleanup 60s
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

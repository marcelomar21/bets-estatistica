/**
 * Shared utility functions
 * M1 FIX: Extract common utilities to avoid duplication
 */

/**
 * Sleep utility for delays and rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  sleep,
};

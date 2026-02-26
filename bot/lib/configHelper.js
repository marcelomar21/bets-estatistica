/**
 * Centralized config helper for reading system_config values
 * Story 2.1: Feature Flag TRIAL_MODE e Helper getConfig
 *
 * Pattern P2 (Architecture): Read via centralized helper with in-memory cache.
 * NEVER read system_config directly in each request.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/** Default cache TTL: 5 minutes */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** In-memory cache: key -> { value, expiresAt } */
const cache = new Map();

/**
 * Get a configuration value from system_config with caching.
 *
 * @param {string} key - The config key to look up
 * @param {string} defaultValue - Value to return if key not found
 * @param {object} [options] - Options
 * @param {number} [options.ttlMs] - Cache TTL in milliseconds (default: 5 min)
 * @returns {Promise<string>} The config value or defaultValue
 */
async function getConfig(key, defaultValue, options = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  // Check cache first
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    logger.debug('[configHelper] cache hit', { key });
    return cached.value;
  }

  // Cache miss or expired — query DB
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', key)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error for us)
      logger.error('[configHelper] DB error reading config', { key, error: error.message });
      return defaultValue;
    }

    if (data) {
      const value = data.value;
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      logger.debug('[configHelper] cache miss, loaded from DB', { key, value });
      return value;
    }

    // Key not found in DB — return default
    logger.debug('[configHelper] key not found, using default', { key, defaultValue });
    return defaultValue;
  } catch (err) {
    logger.error('[configHelper] unexpected error', { key, error: err.message });
    return defaultValue;
  }
}

/**
 * Reload (invalidate) the entire config cache.
 * Call on bot startup and during health checks to pick up changes.
 */
function reloadConfig() {
  const size = cache.size;
  cache.clear();
  logger.info('[configHelper] cache cleared', { previousSize: size });
}

module.exports = { getConfig, reloadConfig };

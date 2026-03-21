/**
 * Team Display Names Resolver
 * Resolves API team names to custom display names via in-memory cache.
 * Cache TTL: 5 minutes (F13: tradeoff aceito — após editar display_name,
 * leva no máximo 5min para o bot usar o novo nome).
 * Only loads overrides (is_override = true) to keep the map small.
 */
const { supabase } = require('./supabase');
const logger = require('./logger');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cache = null; // Map<string, string> | null
let _cacheExpiry = 0;
let _pendingPromise = null; // F7: dedup concurrent cache refreshes

/**
 * Load display name overrides from DB.
 * Uses generated column is_override for correct column-to-column filtering (F1).
 * @returns {Promise<Map<string, string>>}
 */
async function loadDisplayNamesMap() {
  const { data, error } = await supabase
    .from('team_display_names')
    .select('api_name, display_name')
    .eq('is_override', true);

  if (error) {
    logger.error('[teamDisplayNames] Failed to load display names', { error: error.message });
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(row.api_name, row.display_name);
  }

  logger.info('[teamDisplayNames] Cache loaded', { overrides: map.size });
  return map;
}

/**
 * Ensure cache is loaded and not expired.
 * F7: Uses promise dedup to prevent concurrent DB queries on cache expiry.
 * @returns {Promise<Map<string, string>>}
 */
async function ensureCache() {
  if (_cache && Date.now() < _cacheExpiry) {
    return _cache;
  }

  // F7: If a refresh is already in-flight, wait for it
  if (_pendingPromise) {
    return _pendingPromise;
  }

  _pendingPromise = (async () => {
    try {
      _cache = await loadDisplayNamesMap();
      _cacheExpiry = Date.now() + CACHE_TTL_MS;
    } catch (err) {
      logger.error('[teamDisplayNames] Cache refresh failed, using stale or empty', { error: err.message });
      if (!_cache) {
        _cache = new Map();
        _cacheExpiry = Date.now() + CACHE_TTL_MS;
      }
    } finally {
      _pendingPromise = null;
    }
    return _cache;
  })();

  return _pendingPromise;
}

/**
 * Resolve a single team name to its display name.
 * Falls back to the original apiName if no override exists.
 * @param {string} apiName
 * @returns {Promise<string>}
 */
async function resolveTeamName(apiName) {
  if (!apiName) return apiName;

  try {
    const cache = await ensureCache();
    return cache.get(apiName) || apiName;
  } catch {
    return apiName;
  }
}

/**
 * Convenience: resolve both home and away team names at once.
 * @param {string} homeApiName
 * @param {string} awayApiName
 * @returns {Promise<{home: string, away: string}>}
 */
async function resolveTeamNames(homeApiName, awayApiName) {
  try {
    const cache = await ensureCache();
    return {
      home: cache.get(homeApiName) || homeApiName,
      away: cache.get(awayApiName) || awayApiName,
    };
  } catch {
    return { home: homeApiName, away: awayApiName };
  }
}

/**
 * Invalidate the cache (for use in tests).
 */
function invalidateCache() {
  _cache = null;
  _cacheExpiry = 0;
  _pendingPromise = null;
}

module.exports = {
  resolveTeamName,
  resolveTeamNames,
  invalidateCache,
  loadDisplayNamesMap,
  ensureCache,
};

/**
 * Shared utility functions
 * Story 17.5: Consolidar Utilitários Compartilhados
 *
 * Utilities:
 * - sleep(ms) - Delay/rate limiting
 * - truncate(str, maxLength, suffix) - Truncate strings with ellipsis
 * - formatDateBR(date) - Format date as DD/MM
 * - formatDateTimeBR(date) - Format date as DD/MM HH:MM
 * - formatTime(date) - Format time as HH:MM
 * - getDateKey(date, timezone) - Get YYYY-MM-DD key for grouping
 * - parseNumericId(id) - Parse string/number to valid numeric ID
 * - isValidUUID(id) - Check if string is valid UUID
 */

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Sleep utility for delays and rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length including suffix
 * @param {string} suffix - Suffix to add when truncated (default: '...')
 * @returns {string}
 */
function truncate(str, maxLength, suffix = '...') {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Format date as DD/MM (Brazilian format)
 * @param {Date|string} date - Date to format
 * @param {string} timezone - Timezone (default: America/Sao_Paulo)
 * @returns {string}
 */
function formatDateBR(date, timezone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
  });
}

/**
 * Format date as DD/MM HH:MM (Brazilian format)
 * @param {Date|string} date - Date to format
 * @param {string} timezone - Timezone (default: America/Sao_Paulo)
 * @returns {string}
 */
function formatDateTimeBR(date, timezone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const dateStr = d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
  });

  const timeStr = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });

  return `${dateStr} ${timeStr}`;
}

/**
 * Format time as HH:MM
 * @param {Date|string} date - Date to format
 * @param {string} timezone - Timezone (default: America/Sao_Paulo)
 * @returns {string}
 */
function formatTime(date, timezone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });
}

/**
 * Get date key in YYYY-MM-DD format for grouping/comparison
 * Uses Swedish locale (sv-SE) which outputs ISO format
 * @param {Date|string} date - Date to format
 * @param {string} timezone - Timezone (default: America/Sao_Paulo)
 * @returns {string}
 */
function getDateKey(date, timezone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('sv-SE', { timeZone: timezone });
}

/**
 * Get today's date key in YYYY-MM-DD format
 * @param {string} timezone - Timezone (default: America/Sao_Paulo)
 * @returns {string}
 */
function getTodayKey(timezone = DEFAULT_TIMEZONE) {
  return getDateKey(new Date(), timezone);
}

/**
 * Get tomorrow's date key in YYYY-MM-DD format
 * @param {string} timezone - Timezone (default: America/Sao_Paulo)
 * @returns {string}
 */
function getTomorrowKey(timezone = DEFAULT_TIMEZONE) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getDateKey(tomorrow, timezone);
}

/**
 * Parse string or number to valid numeric ID
 * @param {string|number} id - ID to parse
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function parseNumericId(id) {
  if (id === null || id === undefined) {
    return { valid: false, error: 'ID is required' };
  }

  const numId = typeof id === 'string' ? parseInt(id, 10) : id;

  if (isNaN(numId)) {
    return { valid: false, error: 'ID must be a number' };
  }

  if (numId <= 0) {
    return { valid: false, error: 'ID must be positive' };
  }

  return { valid: true, value: numId };
}

/**
 * Check if string is valid UUID v4 format
 * @param {string} id - String to check
 * @returns {boolean}
 */
function isValidUUID(id) {
  if (!id || typeof id !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Safely stringify object for logging (truncated)
 * @param {*} obj - Object to stringify
 * @param {number} maxLength - Max length of output
 * @returns {string}
 */
function safeStringify(obj, maxLength = 200) {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj === 'string') return truncate(obj, maxLength);

  try {
    return truncate(JSON.stringify(obj), maxLength);
  } catch {
    return truncate(String(obj), maxLength);
  }
}

/**
 * Valid bookmaker domains for URL validation
 * Used by isValidBookmakerUrl to validate betting links
 */
const VALID_BOOKMAKER_DOMAINS = [
  'bet365',
  'betano',
  'sportingbet',
  'betfair',
  'pinnacle',
  'betway',
  '1xbet',
  'novibet',
  'superbet',
  'parimatch',
  'estrelabet',
  'kto',
  'galera.bet',
  'betnacional',
];

/**
 * Validate if URL is from a valid bookmaker
 * @param {string} url - URL to validate
 * @param {string[]} validDomains - Optional custom list of valid domains
 * @returns {boolean}
 */
function isValidBookmakerUrl(url, validDomains = VALID_BOOKMAKER_DOMAINS) {
  try {
    const parsed = new URL(url);
    return validDomains.some(domain => parsed.hostname.includes(domain));
  } catch {
    return false;
  }
}

module.exports = {
  sleep,
  truncate,
  formatDateBR,
  formatDateTimeBR,
  formatTime,
  getDateKey,
  getTodayKey,
  getTomorrowKey,
  parseNumericId,
  isValidUUID,
  safeStringify,
  isValidBookmakerUrl,
  VALID_BOOKMAKER_DOMAINS,
  DEFAULT_TIMEZONE,
};

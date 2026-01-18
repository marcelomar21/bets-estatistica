/**
 * Cakto Service - Integration with Cakto payment platform API
 * Story 16.8: Implementar Reconciliacao com Cakto
 *
 * Handles OAuth authentication and subscription status queries.
 * Uses retry with exponential backoff for transient failures.
 */
const axios = require('axios');
const logger = require('../../lib/logger');
const { sleep } = require('../../lib/utils');

const CAKTO_API_URL = process.env.CAKTO_API_URL;
const CAKTO_CLIENT_ID = process.env.CAKTO_CLIENT_ID;
const CAKTO_CLIENT_SECRET = process.env.CAKTO_CLIENT_SECRET;

// H2 FIX: Validate required environment variables at module load
if (!CAKTO_API_URL || !CAKTO_CLIENT_ID || !CAKTO_CLIENT_SECRET) {
  const missing = [];
  if (!CAKTO_API_URL) missing.push('CAKTO_API_URL');
  if (!CAKTO_CLIENT_ID) missing.push('CAKTO_CLIENT_ID');
  if (!CAKTO_CLIENT_SECRET) missing.push('CAKTO_CLIENT_SECRET');
  console.error(`[caktoService] FATAL: Missing required env vars: ${missing.join(', ')}`);
  // Don't throw in module load - will fail gracefully on first call
}

const API_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// Token cache
let accessToken = null;
let tokenExpiresAt = null;

/**
 * Reset token cache (for testing)
 * @private
 */
function _resetTokenCache() {
  accessToken = null;
  tokenExpiresAt = null;
}

/**
 * Get OAuth access token (cached)
 * Uses client_credentials flow to authenticate with Cakto API.
 * Token is cached until 60 seconds before expiration.
 *
 * @returns {Promise<{success: boolean, data?: {token: string}, error?: {code: string, message: string}}>}
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiresAt > Date.now()) {
    return { success: true, data: { token: accessToken } };
  }

  try {
    const response = await axios.post(`${CAKTO_API_URL}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: CAKTO_CLIENT_ID,
      client_secret: CAKTO_CLIENT_SECRET
    }, { timeout: API_TIMEOUT_MS });

    accessToken = response.data.access_token;
    // Expire 60s early for safety margin
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;

    logger.info('[caktoService] getAccessToken: token refreshed', {
      expiresIn: response.data.expires_in
    });

    return { success: true, data: { token: accessToken } };
  } catch (err) {
    logger.error('[caktoService] getAccessToken: failed', { error: err.message });
    return { success: false, error: { code: 'CAKTO_AUTH_ERROR', message: err.message } };
  }
}

/**
 * Get subscription details from Cakto API (single attempt)
 * @param {string} subscriptionId - Cakto subscription ID
 * @returns {Promise<{success: boolean, data?: object, error?: {code: string, message: string}}>}
 * @private
 */
async function getSubscriptionOnce(subscriptionId) {
  const tokenResult = await getAccessToken();
  if (!tokenResult.success) {
    return tokenResult;
  }

  try {
    const response = await axios.get(
      `${CAKTO_API_URL}/subscriptions/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${tokenResult.data.token}` },
        timeout: API_TIMEOUT_MS
      }
    );

    logger.debug('[caktoService] getSubscription: success', { subscriptionId });
    return { success: true, data: response.data };
  } catch (err) {
    // 404 = subscription not found (don't retry)
    if (err.response?.status === 404) {
      logger.warn('[caktoService] getSubscription: not found', { subscriptionId });
      return { success: false, error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found in Cakto' } };
    }

    logger.error('[caktoService] getSubscription: failed', { subscriptionId, error: err.message });
    return { success: false, error: { code: 'CAKTO_API_ERROR', message: err.message } };
  }
}

/**
 * Get subscription with retry and exponential backoff
 * Retries up to MAX_RETRIES times for transient failures.
 * Does NOT retry for 404 (SUBSCRIPTION_NOT_FOUND) - this is a definitive error.
 *
 * @param {string} subscriptionId - Cakto subscription ID
 * @returns {Promise<{success: boolean, data?: object, error?: {code: string, message: string}}>}
 */
async function getSubscription(subscriptionId) {
  // C1 FIX: Validate subscriptionId before API call
  if (!subscriptionId) {
    logger.warn('[caktoService] getSubscription: subscriptionId is required');
    return { success: false, error: { code: 'INVALID_SUBSCRIPTION_ID', message: 'subscriptionId is required' } };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await getSubscriptionOnce(subscriptionId);

    // Success or definitive error (404) - don't retry
    if (result.success || result.error?.code === 'SUBSCRIPTION_NOT_FOUND') {
      return result;
    }

    // Auth error - don't retry (credentials won't change)
    if (result.error?.code === 'CAKTO_AUTH_ERROR') {
      return result;
    }

    // Transient error - retry with backoff
    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[attempt];
      logger.warn('[caktoService] getSubscription: retry', {
        subscriptionId,
        attempt: attempt + 1,
        delayMs: delay
      });
      await sleep(delay);
    }
  }

  logger.error('[caktoService] getSubscription: max retries exceeded', { subscriptionId });
  return { success: false, error: { code: 'CAKTO_API_ERROR', message: 'Max retries exceeded' } };
}

module.exports = {
  getAccessToken,
  getSubscription,
  // For testing only
  _resetTokenCache,
};

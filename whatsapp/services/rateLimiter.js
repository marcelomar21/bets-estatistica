const logger = require('../../lib/logger');

/**
 * Token bucket rate limiter.
 * Limits messages per time window per WhatsApp number.
 * Default: 10 messages per 60 seconds (NFR3).
 */
class RateLimiter {
  constructor(maxTokens = 10, windowMs = 60000) {
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Wait for an available slot. Blocks until a token is available.
   * Serializes concurrent callers to prevent race conditions.
   * @returns {Promise<void>}
   */
  async waitForSlot() {
    // Chain on previous waiter to serialize access
    const previous = this._queue || Promise.resolve();
    this._queue = previous.then(() => this._acquireToken());
    return this._queue;
  }

  /**
   * Internal: acquire a single token, waiting if necessary.
   */
  async _acquireToken() {
    this._refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Calculate wait time until next refill
    const elapsed = Date.now() - this.lastRefill;
    const waitMs = Math.max(0, this.windowMs - elapsed);

    logger.debug('Rate limiter waiting', { waitMs, tokens: this.tokens });
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    this._refill();
    this.tokens--;
  }

  /**
   * Check if a slot is available without consuming it.
   * @returns {boolean}
   */
  hasSlot() {
    this._refill();
    return this.tokens > 0;
  }

  /**
   * Get remaining tokens.
   * @returns {number}
   */
  getTokens() {
    this._refill();
    return this.tokens;
  }

  /**
   * Refill tokens if the window has elapsed.
   */
  _refill() {
    const now = Date.now();
    if (now - this.lastRefill >= this.windowMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}

module.exports = { RateLimiter };

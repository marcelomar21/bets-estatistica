jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { RateLimiter } = require('../services/rateLimiter');

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const limiter = new RateLimiter();
      expect(limiter.maxTokens).toBe(10);
      expect(limiter.windowMs).toBe(60000);
      expect(limiter.tokens).toBe(10);
    });

    it('should accept custom values', () => {
      const limiter = new RateLimiter(5, 30000);
      expect(limiter.maxTokens).toBe(5);
      expect(limiter.windowMs).toBe(30000);
      expect(limiter.tokens).toBe(5);
    });
  });

  describe('waitForSlot', () => {
    it('should consume a token immediately when available', async () => {
      const limiter = new RateLimiter(10, 60000);
      await limiter.waitForSlot();
      expect(limiter.tokens).toBe(9);
    });

    it('should consume all tokens', async () => {
      const limiter = new RateLimiter(3, 60000);
      await limiter.waitForSlot();
      await limiter.waitForSlot();
      await limiter.waitForSlot();
      expect(limiter.tokens).toBe(0);
    });

    it('should wait and refill when no tokens available', async () => {
      const limiter = new RateLimiter(1, 1000);
      await limiter.waitForSlot(); // consume the only token
      expect(limiter.tokens).toBe(0);

      const waitPromise = limiter.waitForSlot();

      // Advance time to trigger refill
      jest.advanceTimersByTime(1000);

      await waitPromise;
      // After refill (1 token) minus consumed (1) = 0
      expect(limiter.tokens).toBe(0);
    });
  });

  describe('hasSlot', () => {
    it('should return true when tokens available', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.hasSlot()).toBe(true);
    });

    it('should return false when no tokens available', async () => {
      const limiter = new RateLimiter(1, 60000);
      await limiter.waitForSlot();
      expect(limiter.hasSlot()).toBe(false);
    });

    it('should return true after window refill', async () => {
      const limiter = new RateLimiter(1, 1000);
      await limiter.waitForSlot();
      expect(limiter.hasSlot()).toBe(false);

      jest.advanceTimersByTime(1000);
      expect(limiter.hasSlot()).toBe(true);
    });
  });

  describe('getTokens', () => {
    it('should return current token count', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getTokens()).toBe(10);
    });

    it('should reflect consumed tokens', async () => {
      const limiter = new RateLimiter(5, 60000);
      await limiter.waitForSlot();
      await limiter.waitForSlot();
      expect(limiter.getTokens()).toBe(3);
    });

    it('should reflect refill after window', async () => {
      const limiter = new RateLimiter(5, 1000);
      await limiter.waitForSlot();
      await limiter.waitForSlot();
      expect(limiter.getTokens()).toBe(3);

      jest.advanceTimersByTime(1000);
      expect(limiter.getTokens()).toBe(5);
    });
  });

  describe('_refill', () => {
    it('should not refill before window elapses', async () => {
      const limiter = new RateLimiter(10, 60000);
      await limiter.waitForSlot();
      expect(limiter.tokens).toBe(9);

      jest.advanceTimersByTime(30000); // half window
      limiter._refill();
      expect(limiter.tokens).toBe(9); // no refill yet
    });

    it('should refill to max after window elapses', async () => {
      const limiter = new RateLimiter(10, 60000);
      await limiter.waitForSlot();
      await limiter.waitForSlot();
      await limiter.waitForSlot();
      expect(limiter.tokens).toBe(7);

      jest.advanceTimersByTime(60000);
      limiter._refill();
      expect(limiter.tokens).toBe(10);
    });
  });
});

/**
 * Tests for notificationService
 * Story 16.5: Implementar Notificacoes de Cobranca
 *
 * TODO: Integration Tests (M5)
 * ----------------------------
 * Current tests mock all external dependencies. Consider adding integration tests
 * in a separate file (__tests__/integration/notificationService.integration.test.js):
 * - Test actual Supabase queries with test database
 * - Test Telegram bot message sending with test bot token
 * - End-to-end flow: member -> reminder -> notification -> message
 * Run integration tests separately: npm run test:integration (not in CI by default)
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

// Mock dependencies
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  },
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../bot/telegram', () => ({
  getBot: jest.fn(() => ({
    sendMessage: jest.fn(),
  })),
}));

jest.mock('../../lib/config', () => ({
  config: {
    membership: {
      checkoutUrl: 'https://pay.cakto.com.br/checkout/123',
      operatorUsername: 'operador_test',
      subscriptionPrice: 'R$50/mes',
    },
  },
}));

const {
  hasNotificationToday,
  registerNotification,
  sendPrivateMessage,
  getCheckoutLink,
  getOperatorUsername,
  getSubscriptionPrice,
  formatTrialReminder,
  formatRenewalReminder,
} = require('../../bot/services/notificationService');
const { getBot } = require('../../bot/telegram');

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasNotificationToday', () => {
    it('should return true if notification was sent today', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [{ id: 'notif-123' }],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await hasNotificationToday('member-123', 'trial_reminder');

      expect(result.success).toBe(true);
      expect(result.data.hasNotification).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('member_notifications');
    });

    it('should return false if no notification was sent today', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await hasNotificationToday('member-123', 'trial_reminder');

      expect(result.success).toBe(true);
      expect(result.data.hasNotification).toBe(false);
    });

    it('should return error on database failure', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await hasNotificationToday('member-123', 'trial_reminder');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('registerNotification', () => {
    it('should successfully register a notification', async () => {
      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'notif-new', member_id: 'member-123' },
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await registerNotification('member-123', 'trial_reminder', 'telegram', '12345');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('notif-new');
      expect(supabase.from).toHaveBeenCalledWith('member_notifications');
    });

    it('should handle database insert error', async () => {
      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Insert failed' },
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await registerNotification('member-123', 'trial_reminder', 'telegram', '12345');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('sendPrivateMessage', () => {
    it('should successfully send a private message', async () => {
      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
      };
      getBot.mockReturnValue(mockBot);

      const result = await sendPrivateMessage(123456789, 'Test message');

      expect(result.success).toBe(true);
      expect(result.data.messageId).toBe(999);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        'Test message',
        { parse_mode: 'Markdown' }
      );
    });

    it('should handle 403 error (user blocked bot)', async () => {
      const mockBot = {
        sendMessage: jest.fn().mockRejectedValue({
          response: {
            statusCode: 403,
            body: { description: 'Forbidden: bot was blocked by the user' },
          },
        }),
      };
      getBot.mockReturnValue(mockBot);

      const result = await sendPrivateMessage(123456789, 'Test message');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle generic Telegram error', async () => {
      const mockBot = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      getBot.mockReturnValue(mockBot);

      const result = await sendPrivateMessage(123456789, 'Test message');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TELEGRAM_ERROR');
    });
  });

  describe('getCheckoutLink', () => {
    it('should return checkout URL from config', () => {
      const result = getCheckoutLink();

      expect(result.success).toBe(true);
      expect(result.data.checkoutUrl).toBe('https://pay.cakto.com.br/checkout/123');
    });

    it('should return error when checkout URL is not configured', () => {
      // Temporarily override config
      const { config } = require('../../lib/config');
      const originalUrl = config.membership.checkoutUrl;
      config.membership.checkoutUrl = null;

      const result = getCheckoutLink();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');

      // Restore
      config.membership.checkoutUrl = originalUrl;
    });
  });

  describe('getOperatorUsername', () => {
    it('should return operator username from config', () => {
      const result = getOperatorUsername();
      expect(result).toBe('operador_test');
    });

    it('should return default when not configured', () => {
      const { config } = require('../../lib/config');
      const original = config.membership.operatorUsername;
      config.membership.operatorUsername = null;

      const result = getOperatorUsername();
      expect(result).toBe('operador');

      config.membership.operatorUsername = original;
    });
  });

  describe('getSubscriptionPrice', () => {
    it('should return subscription price from config', () => {
      const result = getSubscriptionPrice();
      expect(result).toBe('R$50/mes');
    });

    it('should return default when not configured', () => {
      const { config } = require('../../lib/config');
      const original = config.membership.subscriptionPrice;
      config.membership.subscriptionPrice = null;

      const result = getSubscriptionPrice();
      expect(result).toBe('R$50/mes');

      config.membership.subscriptionPrice = original;
    });
  });

  describe('formatTrialReminder', () => {
    it('should format reminder for 3 days remaining', () => {
      const member = { telegram_username: 'testuser' };
      const message = formatTrialReminder(member, 3, 'https://pay.cakto.com.br/checkout/123', 75.5);

      expect(message).toContain('*3 dias*');
      expect(message).toContain('75.5%');
      expect(message).toContain('[ASSINAR AGORA]');
      expect(message).toContain('@operador_test');
    });

    it('should format reminder for 2 days remaining', () => {
      const member = { telegram_username: 'testuser' };
      const message = formatTrialReminder(member, 2, 'https://pay.cakto.com.br/checkout/123', 80);

      expect(message).toContain('*2 dias*');
      expect(message).toContain('[ASSINAR AGORA]');
    });

    it('should format reminder for last day (1 day remaining)', () => {
      const member = { telegram_username: 'testuser' };
      const message = formatTrialReminder(member, 1, 'https://pay.cakto.com.br/checkout/123', 80);

      expect(message).toContain('*Ultimo dia*');
      expect(message).toContain('[ASSINAR');
    });
  });

  describe('formatRenewalReminder', () => {
    it('should format reminder for 5 days before renewal', () => {
      const member = { telegram_username: 'testuser' };
      const message = formatRenewalReminder(member, 5, 'https://pay.cakto.com.br/checkout/123');

      expect(message).toContain('*5 dias*');
      expect(message).toContain('[PAGAR AGORA]');
      expect(message).toContain('PIX/Boleto');
    });

    it('should format reminder for 3 days before renewal', () => {
      const member = { telegram_username: 'testuser' };
      const message = formatRenewalReminder(member, 3, 'https://pay.cakto.com.br/checkout/123');

      expect(message).toContain('*3 dias*');
      expect(message).toContain('[PAGAR AGORA]');
    });

    it('should format reminder for last day (1 day before)', () => {
      const member = { telegram_username: 'testuser' };
      const message = formatRenewalReminder(member, 1, 'https://pay.cakto.com.br/checkout/123');

      expect(message).toContain('*Amanha*');
      expect(message).toContain('[PAGAR AGORA]');
    });
  });
});

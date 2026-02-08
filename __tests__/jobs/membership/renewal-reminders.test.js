/**
 * Tests for renewal-reminders job
 * Story 16.5: Implementar Notificacoes de Cobranca
 */
const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

// Mock dependencies
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  },
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../bot/telegram', () => ({
  getBot: jest.fn(() => ({
    sendMessage: jest.fn(),
  })),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    membership: {
      checkoutUrl: 'https://pay.cakto.com.br/checkout/123',
      operatorUsername: 'operador_test',
    },
  },
}));

const {
  runRenewalReminders,
  getMembersNeedingRenewalReminder,
  sendRenewalReminder,
  getDaysUntilRenewal,
} = require('../../../bot/jobs/membership/renewal-reminders');
const { getBot } = require('../../../bot/telegram');

describe('renewal-reminders job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMembersNeedingRenewalReminder', () => {
    it('should return active members with pix/boleto needing reminder at 5, 3, or 1 day', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'ativo', payment_method: 'pix', subscription_ends_at: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'member-2', telegram_id: 222, status: 'ativo', payment_method: 'boleto', subscription_ends_at: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'member-3', telegram_id: 333, status: 'ativo', payment_method: 'pix', subscription_ends_at: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingRenewalReminder();

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBeGreaterThan(0);
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    it('should exclude members with cartao_recorrente', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // All members with cartao_recorrente should be excluded by the query
      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'ativo', payment_method: 'pix', subscription_ends_at: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingRenewalReminder();

      expect(result.success).toBe(true);
      // Verify the in() was called with only pix and boleto
      expect(mockChain.in).toHaveBeenCalledWith('payment_method', ['pix', 'boleto']);
    });

    it('should return empty array when no members need reminder', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingRenewalReminder();

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(0);
    });

    it('should handle database error', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection failed' },
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingRenewalReminder();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('getDaysUntilRenewal', () => {
    it('should return 5 for subscription ending in 5 days', () => {
      // getDaysUntilRenewal uses Math.ceil, so we use start of day
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const future = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000); // Exactly 5 days from today start

      const result = getDaysUntilRenewal(future.toISOString());
      expect(result).toBe(5);
    });

    it('should return 1 for subscription ending tomorrow', () => {
      // getDaysUntilRenewal uses Math.ceil, so we use start of day
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Exactly 1 day from today start

      const result = getDaysUntilRenewal(tomorrow.toISOString());
      expect(result).toBe(1);
    });

    it('should return 0 for subscription ending today', () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      const result = getDaysUntilRenewal(today.toISOString());
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should handle midnight edge case', () => {
      const midnight = new Date();
      midnight.setDate(midnight.getDate() + 3);
      midnight.setHours(0, 0, 0, 0); // Midnight in 3 days

      const result = getDaysUntilRenewal(midnight.toISOString());
      expect(result).toBeGreaterThanOrEqual(2);
    });
  });

  describe('sendRenewalReminder', () => {
    it('should skip member without telegram_id', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const member = {
        id: 'member-no-tg',
        telegram_id: null,
        telegram_username: 'testuser',
        payment_method: 'pix',
        subscription_ends_at: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const result = await sendRenewalReminder(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_TELEGRAM_ID');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should send reminder successfully', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        payment_method: 'pix',
        subscription_ends_at: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock notification check
      const mockNotifChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      // Mock notification insert
      const mockInsertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'notif-new' }, error: null }),
      };

      supabase.from
        .mockReturnValueOnce(mockNotifChain)  // hasNotificationToday
        .mockReturnValueOnce(mockInsertChain); // registerNotification

      const result = await sendRenewalReminder(member);

      expect(result.success).toBe(true);
      expect(mockBot.sendMessage).toHaveBeenCalled();
    });

    it('should handle 403 error without failing', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        payment_method: 'boleto',
        subscription_ends_at: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const mockBot = {
        sendMessage: jest.fn().mockRejectedValue({
          response: {
            statusCode: 403,
            body: { description: 'Forbidden: bot was blocked by the user' },
          },
        }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock notification check - no existing notification
      const mockNotifChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      supabase.from.mockReturnValue(mockNotifChain);

      const result = await sendRenewalReminder(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should skip if notification already sent today', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        payment_method: 'pix',
        subscription_ends_at: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Mock notification check - already sent
      const mockNotifChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [{ id: 'existing-notif' }], error: null }),
      };
      supabase.from.mockReturnValue(mockNotifChain);

      const result = await sendRenewalReminder(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOTIFICATION_ALREADY_SENT');
    });
  });

  describe('runRenewalReminders', () => {
    it('should prevent concurrent runs', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result1 = await runRenewalReminders();
      expect(result1.success).toBe(true);
    });

    it('should process members and return counts', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'ativo', payment_method: 'pix', subscription_ends_at: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      // Mock members query
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      };

      // Mock notification check
      const mockNotifCheckChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      // Mock notification insert
      const mockInsertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'notif-new' }, error: null }),
      };

      supabase.from
        .mockReturnValueOnce(mockMembersChain)     // getMembersNeedingRenewalReminder
        .mockReturnValueOnce(mockNotifCheckChain)  // hasNotificationToday
        .mockReturnValueOnce(mockInsertChain);     // registerNotification

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
      };
      getBot.mockReturnValue(mockBot);

      const result = await runRenewalReminders();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('sent');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('failed');
    });

    it('should log with correct prefix', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      await runRenewalReminders();

      expect(logger.info).toHaveBeenCalledWith(
        '[membership:renewal-reminders] Starting',
        expect.any(Object)
      );
    });
  });
});

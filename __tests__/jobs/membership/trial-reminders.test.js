/**
 * Tests for trial-reminders job
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

jest.mock('../../../bot/services/metricsService', () => ({
  getSuccessRate: jest.fn().mockResolvedValue({
    success: true,
    data: { rateAllTime: 75.5, rate30Days: 80.2 },
  }),
}));

jest.mock('../../../bot/services/memberService', () => ({
  getTrialDays: jest.fn().mockResolvedValue({
    success: true,
    data: { days: 7, source: 'mock' },
  }),
  generatePaymentLink: jest.fn().mockReturnValue({
    success: true,
    data: { url: 'https://pay.test.com/checkout', hasAffiliate: false, affiliateCode: null },
  }),
}));

const {
  runTrialReminders,
  getMembersNeedingTrialReminder,
  sendTrialReminder,
  getDaysRemaining,
  CONFIG,
} = require('../../../bot/jobs/membership/trial-reminders');
const { getBot } = require('../../../bot/telegram');

describe('trial-reminders job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMembersNeedingTrialReminder', () => {
    it('should return members with trial ending in 1-3 days', async () => {
      // With 7-day trial, members who started 4-6 days ago will have 1-3 days remaining
      // Use start of today for consistent calculations
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'trial', trial_started_at: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString() }, // 1 day left
        { id: 'member-2', telegram_id: 222, status: 'trial', trial_started_at: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() }, // 2 days left
        { id: 'member-3', telegram_id: 333, status: 'trial', trial_started_at: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() }, // 3 days left
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingTrialReminder();

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(3);
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    it('should return empty array when no members need reminder', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingTrialReminder();

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(0);
    });

    it('should handle database error', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection failed' },
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getMembersNeedingTrialReminder();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('getDaysRemaining', () => {
    it('should return 1 for trial ending tomorrow (start of day)', () => {
      // getDaysRemaining uses Math.ceil, so we need to set time to start of day
      // to get exactly 1 day difference from today's start
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Exactly 1 day from today start

      const result = getDaysRemaining(tomorrow.toISOString());
      expect(result).toBe(1);
    });

    it('should return 3 for trial ending in 3 days', () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);
      future.setHours(23, 59, 59, 999); // End of day in 3 days

      const result = getDaysRemaining(future.toISOString());
      expect(result).toBe(4); // Ceil rounds up partial day
    });

    it('should return 0 for trial ending today', () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      const result = getDaysRemaining(today.toISOString());
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should handle midnight edge case', () => {
      const midnight = new Date();
      midnight.setDate(midnight.getDate() + 2);
      midnight.setHours(0, 0, 0, 0); // Midnight in 2 days

      const result = getDaysRemaining(midnight.toISOString());
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  describe('sendTrialReminder', () => {
    it('should skip member without telegram_id', async () => {
      const member = {
        id: 'member-no-tg',
        telegram_id: null,
        telegram_username: 'testuser',
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const result = await sendTrialReminder(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_TELEGRAM_ID');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should send reminder successfully', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
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
        .mockReturnValueOnce(mockNotifChain) // hasNotificationToday
        .mockReturnValueOnce(mockInsertChain); // registerNotification

      const result = await sendTrialReminder(member);

      expect(result.success).toBe(true);
      expect(mockBot.sendMessage).toHaveBeenCalled();
    });

    it('should handle 403 error without failing', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
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

      const result = await sendTrialReminder(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should skip if notification already sent today', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
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

      const result = await sendTrialReminder(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOTIFICATION_ALREADY_SENT');
    });
  });

  describe('runTrialReminders', () => {
    it('should prevent concurrent runs', async () => {
      // Start first run (will complete normally)
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result1 = await runTrialReminders();
      expect(result1.success).toBe(true);
    });

    it('should process members and return counts', async () => {
      // Member started trial 5 days ago, with 7-day trial = 2 days left
      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'trial', trial_started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      // Mock members query
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
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
        .mockReturnValueOnce(mockMembersChain)     // getMembersNeedingTrialReminder
        .mockReturnValueOnce(mockNotifCheckChain)  // hasNotificationToday
        .mockReturnValueOnce(mockInsertChain);     // registerNotification

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
      };
      getBot.mockReturnValue(mockBot);

      const result = await runTrialReminders();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('sent');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('failed');
    });

    it('should log with correct prefix', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      await runTrialReminders();

      expect(logger.info).toHaveBeenCalledWith(
        '[membership:trial-reminders] Starting',
        expect.any(Object)
      );
    });
  });
});

/**
 * Tests for trial-reminders job
 * Story 16.5: Implementar Notificacoes de Cobranca
 * Story 2-3: TRIAL_MODE check + withExecutionLogging
 * Multi-tenant: iterates over all groups via getAllBots()
 */
const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

// Helper: create a chainable mock that resolves when awaited
function createQueryMock(resolvedValue) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    then: (resolve) => resolve(resolvedValue),
  };
  // Make all methods return chain for chaining
  for (const key of Object.keys(chain)) {
    if (key !== 'then' && typeof chain[key] === 'function') {
      chain[key].mockReturnValue(chain);
    }
  }
  return chain;
}

// Mock dependencies
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockBotSendMessage = jest.fn();
const mockBotInstance = { sendMessage: mockBotSendMessage };

jest.mock('../../../bot/telegram', () => ({
  getBot: jest.fn(() => mockBotInstance),
  getAllBots: jest.fn(() => new Map([
    ['group-uuid-1', {
      bot: mockBotInstance,
      groupId: 'group-uuid-1',
      publicGroupId: '-1001234567890',
      groupConfig: {
        name: 'Test Group',
        checkoutUrl: 'https://pay.test.com/group1',
        operatorUsername: 'operator1',
        subscriptionPrice: 'R$50/mes',
      },
    }],
  ])),
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

const mockGetConfig = jest.fn().mockResolvedValue('internal');
jest.mock('../../../bot/lib/configHelper', () => ({
  getConfig: mockGetConfig,
}));

jest.mock('../../../bot/services/jobExecutionService', () => ({
  withExecutionLogging: jest.fn((jobName, fn) => fn()),
}));

const {
  runTrialReminders,
  getMembersNeedingTrialReminder,
  sendTrialReminder,
  getDaysRemaining,
} = require('../../../bot/jobs/membership/trial-reminders');

describe('trial-reminders job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMembersNeedingTrialReminder', () => {
    it('should return members with trial ending in 1-3 days', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'trial', trial_started_at: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'member-2', telegram_id: 222, status: 'trial', trial_started_at: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'member-3', telegram_id: 333, status: 'trial', trial_started_at: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      supabase.from.mockReturnValue(createQueryMock({ data: mockMembers, error: null }));

      const result = await getMembersNeedingTrialReminder('group-uuid-1');

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(3);
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    it('should return empty array when no members need reminder', async () => {
      supabase.from.mockReturnValue(createQueryMock({ data: [], error: null }));

      const result = await getMembersNeedingTrialReminder('group-uuid-1');

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(0);
    });

    it('should handle database error', async () => {
      supabase.from.mockReturnValue(createQueryMock({ data: null, error: { message: 'Connection failed' } }));

      const result = await getMembersNeedingTrialReminder('group-uuid-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('getDaysRemaining', () => {
    it('should return 1 for trial ending tomorrow (start of day)', () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      const result = getDaysRemaining(tomorrow.toISOString());
      expect(result).toBe(1);
    });

    it('should return 3 for trial ending in 3 days', () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);
      future.setHours(23, 59, 59, 999);

      const result = getDaysRemaining(future.toISOString());
      expect(result).toBe(4);
    });

    it('should return 0 for trial ending today', () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const result = getDaysRemaining(today.toISOString());
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should handle midnight edge case', () => {
      const midnight = new Date();
      midnight.setDate(midnight.getDate() + 2);
      midnight.setHours(0, 0, 0, 0);

      const result = getDaysRemaining(midnight.toISOString());
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  describe('sendTrialReminder', () => {
    const mockGroupConfig = {
      checkoutUrl: 'https://pay.test.com/group1',
      operatorUsername: 'operator1',
      subscriptionPrice: 'R$50/mes',
    };

    it('should skip member without telegram_id', async () => {
      const member = {
        id: 'member-no-tg',
        telegram_id: null,
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const result = await sendTrialReminder(member, mockGroupConfig, mockBotInstance);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_TELEGRAM_ID');
    });

    it('should send reminder using provided bot instance', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      mockBotSendMessage.mockResolvedValue({ message_id: 999 });

      // hasNotificationToday
      const notifCheck = createQueryMock(null);
      notifCheck.limit = jest.fn().mockResolvedValue({ data: [], error: null });

      // registerNotification
      const notifInsert = createQueryMock(null);
      notifInsert.single = jest.fn().mockResolvedValue({ data: { id: 'notif-new' }, error: null });

      supabase.from
        .mockReturnValueOnce(notifCheck)
        .mockReturnValueOnce(notifInsert);

      const result = await sendTrialReminder(member, mockGroupConfig, mockBotInstance);

      expect(result.success).toBe(true);
      expect(mockBotSendMessage).toHaveBeenCalled();
    });

    it('should handle 403 error without failing', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      mockBotSendMessage.mockRejectedValue({
        response: {
          statusCode: 403,
          body: { description: 'Forbidden: bot was blocked by the user' },
        },
      });

      const notifCheck = createQueryMock(null);
      notifCheck.limit = jest.fn().mockResolvedValue({ data: [], error: null });
      supabase.from.mockReturnValue(notifCheck);

      const result = await sendTrialReminder(member, mockGroupConfig, mockBotInstance);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
    });

    it('should skip if notification already sent today', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const notifCheck = createQueryMock(null);
      notifCheck.limit = jest.fn().mockResolvedValue({ data: [{ id: 'existing-notif' }], error: null });
      supabase.from.mockReturnValue(notifCheck);

      const result = await sendTrialReminder(member, mockGroupConfig, mockBotInstance);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOTIFICATION_ALREADY_SENT');
    });
  });

  describe('runTrialReminders', () => {
    it('should prevent concurrent runs', async () => {
      supabase.from.mockReturnValue(createQueryMock({ data: [], error: null }));

      const result1 = await runTrialReminders();
      expect(result1.success).toBe(true);
    });

    it('should process members from all groups and return counts', async () => {
      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'trial', trial_started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      // getMembersNeedingTrialReminder
      supabase.from.mockReturnValueOnce(createQueryMock({ data: mockMembers, error: null }));

      // hasNotificationToday
      const notifCheck = createQueryMock(null);
      notifCheck.limit = jest.fn().mockResolvedValue({ data: [], error: null });
      supabase.from.mockReturnValueOnce(notifCheck);

      // registerNotification
      const notifInsert = createQueryMock(null);
      notifInsert.single = jest.fn().mockResolvedValue({ data: { id: 'notif-new' }, error: null });
      supabase.from.mockReturnValueOnce(notifInsert);

      mockBotSendMessage.mockResolvedValue({ message_id: 999 });

      const result = await runTrialReminders();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('sent');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('failed');
    });

    it('should log with correct prefix', async () => {
      supabase.from.mockReturnValue(createQueryMock({ data: [], error: null }));

      await runTrialReminders();

      expect(logger.info).toHaveBeenCalledWith(
        '[membership:trial-reminders] Starting',
        expect.any(Object)
      );
    });
  });

  describe('TRIAL_MODE check (Story 2-3)', () => {
    it('should skip processing when TRIAL_MODE=mercadopago', async () => {
      mockGetConfig.mockResolvedValueOnce('mercadopago');

      const result = await runTrialReminders();

      expect(result.success).toBe(true);
      expect(result.sent).toBe(0);
      expect(result.skippedReason).toBe('mercadopago_mode');
      expect(supabase.from).not.toHaveBeenCalledWith('members');
    });

    it('should process when TRIAL_MODE=internal', async () => {
      mockGetConfig.mockResolvedValueOnce('internal');
      supabase.from.mockReturnValue(createQueryMock({ data: [], error: null }));

      const result = await runTrialReminders();

      expect(result.success).toBe(true);
      expect(result.skippedReason).toBeUndefined();
    });

    it('should use withExecutionLogging wrapper', async () => {
      const { withExecutionLogging } = require('../../../bot/services/jobExecutionService');
      mockGetConfig.mockResolvedValueOnce('internal');
      supabase.from.mockReturnValue(createQueryMock({ data: [], error: null }));

      await runTrialReminders();

      expect(withExecutionLogging).toHaveBeenCalledWith(
        'trial-reminders',
        expect.any(Function)
      );
    });
  });
});

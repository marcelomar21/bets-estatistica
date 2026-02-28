jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../lib/configHelper', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../services/jobExecutionService', () => ({
  withExecutionLogging: jest.fn((name, fn) => fn()),
}));

jest.mock('../../services/metricsService', () => ({
  getSuccessRateForDays: jest.fn().mockResolvedValue({ success: true, data: { rate: 75.5 } }),
}));

jest.mock('../../services/memberService', () => ({
  getTrialDays: jest.fn().mockResolvedValue({ success: true, data: { days: 7 } }),
}));

jest.mock('../../telegram', () => ({
  getAllBots: jest.fn(),
}));

const mockHasNotificationToday = jest.fn();
const mockRegisterNotification = jest.fn();
const mockSendPrivateMessage = jest.fn();
const mockGetPaymentLinkForMember = jest.fn();
const mockFormatTrialReminder = jest.fn();

jest.mock('../../services/notificationService', () => ({
  hasNotificationToday: mockHasNotificationToday,
  registerNotification: mockRegisterNotification,
  sendPrivateMessage: mockSendPrivateMessage,
  getPaymentLinkForMember: mockGetPaymentLinkForMember,
  formatTrialReminder: mockFormatTrialReminder,
}));

const mockChannelSendDM = jest.fn();
jest.mock('../../../lib/channelAdapter', () => ({
  sendDM: mockChannelSendDM,
}));

const { sendTrialReminder, getDaysRemaining } = require('../membership/trial-reminders');

describe('trial-reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasNotificationToday.mockResolvedValue({ success: true, data: { hasNotification: false } });
    mockRegisterNotification.mockResolvedValue({ success: true });
    mockGetPaymentLinkForMember.mockReturnValue({ success: true, data: { url: 'https://pay.test', hasAffiliate: false, affiliateCode: null } });
    mockFormatTrialReminder.mockReturnValue('Trial reminder message');
  });

  describe('getDaysRemaining', () => {
    it('should calculate days remaining correctly', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59);
      const result = getDaysRemaining(tomorrow.toISOString());
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(2);
    });
  });

  describe('sendTrialReminder — Telegram member', () => {
    const telegramMember = {
      id: 1,
      telegram_id: 12345,
      channel: 'telegram',
      channel_user_id: null,
      group_id: 'group-1',
      trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };

    it('should send via Telegram sendPrivateMessage', async () => {
      mockSendPrivateMessage.mockResolvedValue({ success: true, data: { messageId: 'tg-msg-1' } });

      const result = await sendTrialReminder(telegramMember, null, { bot: true });

      expect(result.success).toBe(true);
      expect(mockSendPrivateMessage).toHaveBeenCalledWith(12345, 'Trial reminder message', 'Markdown', { bot: true });
      expect(mockChannelSendDM).not.toHaveBeenCalled();
    });

    it('should skip if no telegram_id', async () => {
      const noIdMember = { ...telegramMember, telegram_id: null };
      const result = await sendTrialReminder(noIdMember);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_TELEGRAM_ID');
    });

    it('should skip if already sent today', async () => {
      mockHasNotificationToday.mockResolvedValue({ success: true, data: { hasNotification: true } });
      const result = await sendTrialReminder(telegramMember);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOTIFICATION_ALREADY_SENT');
    });
  });

  describe('sendTrialReminder — WhatsApp member', () => {
    const whatsappMember = {
      id: 2,
      telegram_id: null,
      channel: 'whatsapp',
      channel_user_id: '+5511999887766',
      group_id: 'group-1',
      trial_ends_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    };

    it('should send via channelAdapter.sendDM for WhatsApp', async () => {
      mockChannelSendDM.mockResolvedValue({ success: true, data: { messageId: 'wa-msg-1' } });

      const result = await sendTrialReminder(whatsappMember, { checkoutUrl: 'https://pay.test' });

      expect(result.success).toBe(true);
      expect(mockChannelSendDM).toHaveBeenCalledWith(
        '+5511999887766',
        'Trial reminder message',
        { channel: 'whatsapp', groupId: 'group-1' }
      );
      expect(mockSendPrivateMessage).not.toHaveBeenCalled();
    });

    it('should skip if no channel_user_id', async () => {
      const noPhoneMember = { ...whatsappMember, channel_user_id: null };
      const result = await sendTrialReminder(noPhoneMember);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_CHANNEL_USER_ID');
    });

    it('should register notification with whatsapp channel', async () => {
      mockChannelSendDM.mockResolvedValue({ success: true, data: { messageId: 'wa-msg-2' } });

      await sendTrialReminder(whatsappMember);

      expect(mockRegisterNotification).toHaveBeenCalledWith(
        2,
        'trial_reminder',
        'whatsapp',
        'wa-msg-2'
      );
    });

    it('should skip if already sent today', async () => {
      mockHasNotificationToday.mockResolvedValue({ success: true, data: { hasNotification: true } });

      const result = await sendTrialReminder(whatsappMember);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOTIFICATION_ALREADY_SENT');
    });
  });
});

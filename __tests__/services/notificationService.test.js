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
    createChatInviteLink: jest.fn(),
  })),
  getDefaultBotCtx: jest.fn(() => ({
    publicGroupId: '-1001234567890',
    adminGroupId: '-100admin',
    botToken: 'test-token',
  })),
}));

// Mock memberService for Story 18.3 - generatePaymentLink
jest.mock('../../bot/services/memberService', () => ({
  generatePaymentLink: jest.fn(),
}));

// NOTE: config.membership fallbacks were removed from notificationService for multi-tenant safety.
// This mock is kept minimal — no membership properties since they should NOT be used.

const {
  hasNotificationToday,
  registerNotification,
  sendPrivateMessage,
  getCheckoutLink,
  getPaymentLinkForMember,
  getOperatorUsername,
  getSubscriptionPrice,
  formatTrialReminder,
  formatRenewalReminder,
  sendReactivationNotification,
  formatKickWarning,
  sendKickWarningNotification,
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
    it('should always return failure (global config fallback removed for multi-tenant safety)', () => {
      const result = getCheckoutLink();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('global config fallback removed'),
      );
    });
  });

  describe('getOperatorUsername', () => {
    it('should return generic default when no groupConfig provided', () => {
      const result = getOperatorUsername();
      expect(result).toBe('operador');
    });

    it('should return group-specific operator username when provided', () => {
      const result = getOperatorUsername({ operatorUsername: 'osmar_admin' });
      expect(result).toBe('osmar_admin');
    });

    it('should return generic default when groupConfig has no operatorUsername', () => {
      const result = getOperatorUsername({ someOtherProp: 'value' });
      expect(result).toBe('operador');
    });
  });

  describe('getSubscriptionPrice', () => {
    it('should return null when no groupConfig provided', () => {
      const result = getSubscriptionPrice();
      expect(result).toBeNull();
    });

    it('should return group-specific price when provided', () => {
      const result = getSubscriptionPrice({ subscriptionPrice: 'R$79/mes' });
      expect(result).toBe('R$79/mes');
    });

    it('should return null when groupConfig has no subscriptionPrice', () => {
      const result = getSubscriptionPrice({ someOtherProp: 'value' });
      expect(result).toBeNull();
    });
  });

  describe('formatTrialReminder', () => {
    it('should format reminder for 3 days remaining', () => {
      const member = { telegram_username: 'testuser' };
      const groupConfig = { operatorUsername: 'operador_test', subscriptionPrice: 'R$50/mes' };
      const message = formatTrialReminder(member, 3, 'https://pay.cakto.com.br/checkout/123', 75.5, groupConfig);

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

  // ============================================
  // Story 16.10: sendReactivationNotification
  // ============================================
  describe('sendReactivationNotification', () => {
    it('should generate invite link and send notification successfully', async () => {
      const mockBot = {
        createChatInviteLink: jest.fn().mockResolvedValue({
          invite_link: 'https://t.me/+abc123xyz',
        }),
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1001 }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock DB update for invite_link
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };

      // Mock DB insert for notification registration
      const mockInsertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'notif-123' },
          error: null,
        }),
      };

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockUpdateChain;
        }
        return mockInsertChain;
      });

      const result = await sendReactivationNotification(123456789, 'member-uuid');

      expect(result.success).toBe(true);
      expect(result.data.inviteLink).toBe('https://t.me/+abc123xyz');
      expect(result.data.messageId).toBe(1001);
      expect(mockBot.createChatInviteLink).toHaveBeenCalledWith('-1001234567890', {
        member_limit: 1,
        expire_date: expect.any(Number),
      });
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Bem-vindo de volta'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should use explicit groupTelegramId when provided', async () => {
      const mockBot = {
        createChatInviteLink: jest.fn().mockResolvedValue({
          invite_link: 'https://t.me/+abc123xyz',
        }),
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1001 }),
      };
      getBot.mockReturnValue(mockBot);

      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };

      const mockInsertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'notif-123' },
          error: null,
        }),
      };

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockUpdateChain;
        }
        return mockInsertChain;
      });

      const result = await sendReactivationNotification(123456789, 'member-uuid', '-1007777777777');

      expect(result.success).toBe(true);
      expect(mockBot.createChatInviteLink).toHaveBeenCalledWith('-1007777777777', {
        member_limit: 1,
        expire_date: expect.any(Number),
      });
    });

    it('should return error when groupId is not configured', async () => {
      const { getDefaultBotCtx } = require('../../bot/telegram');
      getDefaultBotCtx.mockReturnValueOnce(null);

      const result = await sendReactivationNotification(123456789, 'member-uuid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');
    });

    it('should return error when invite link generation fails', async () => {
      const mockBot = {
        createChatInviteLink: jest.fn().mockRejectedValue(new Error('Bot lacks permission')),
      };
      getBot.mockReturnValue(mockBot);

      const result = await sendReactivationNotification(123456789, 'member-uuid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVITE_GENERATION_FAILED');
    });

    it('should return error when DB update for invite_link fails', async () => {
      const mockBot = {
        createChatInviteLink: jest.fn().mockResolvedValue({
          invite_link: 'https://t.me/+abc123xyz',
        }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock DB update failure
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: { message: 'DB connection error' },
        }),
      };
      supabase.from.mockReturnValue(mockUpdateChain);

      const result = await sendReactivationNotification(123456789, 'member-uuid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_UPDATE_FAILED');
    });

    it('should return error when Telegram send message fails', async () => {
      const mockBot = {
        createChatInviteLink: jest.fn().mockResolvedValue({
          invite_link: 'https://t.me/+abc123xyz',
        }),
        sendMessage: jest.fn().mockRejectedValue({
          response: { statusCode: 403, body: { description: 'Blocked' } },
        }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock successful DB update
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      supabase.from.mockReturnValue(mockUpdateChain);

      const result = await sendReactivationNotification(123456789, 'member-uuid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
      // Should still return invite link even if message failed
      expect(result.data.inviteLink).toBe('https://t.me/+abc123xyz');
    });

    it('should return error for invalid telegramId', async () => {
      const result = await sendReactivationNotification(null, 'member-uuid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_INPUT');
    });

    it('should return error for invalid memberId', async () => {
      const result = await sendReactivationNotification(123456789, null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_INPUT');
    });
  });

  // ============================================
  // Story 18.3: getPaymentLinkForMember
  // ============================================
  describe('getPaymentLinkForMember', () => {
    const { generatePaymentLink } = require('../../bot/services/memberService');

    beforeEach(() => {
      generatePaymentLink.mockClear();
    });

    it('should fail when member is null and no checkoutUrlOverride (global fallback removed)', () => {
      const result = getPaymentLinkForMember(null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');
      expect(generatePaymentLink).not.toHaveBeenCalled();
    });

    it('should fail when member is undefined and no checkoutUrlOverride (global fallback removed)', () => {
      const result = getPaymentLinkForMember(undefined);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');
      expect(generatePaymentLink).not.toHaveBeenCalled();
    });

    it('should return checkoutUrlOverride when member is null but override provided', () => {
      const result = getPaymentLinkForMember(null, 'https://pay.cakto.com.br/group-specific/456');

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://pay.cakto.com.br/group-specific/456');
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(generatePaymentLink).not.toHaveBeenCalled();
    });

    it('should call generatePaymentLink and return result with affiliate', () => {
      const member = { id: 1, telegram_id: 123456, affiliate_code: 'TEST123' };
      generatePaymentLink.mockReturnValue({
        success: true,
        data: { url: 'https://pay.cakto.com.br/checkout/123?affiliate=TEST123', hasAffiliate: true, affiliateCode: 'TEST123' }
      });

      const result = getPaymentLinkForMember(member);

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://pay.cakto.com.br/checkout/123?affiliate=TEST123');
      expect(result.data.hasAffiliate).toBe(true);
      expect(result.data.affiliateCode).toBe('TEST123');
      expect(generatePaymentLink).toHaveBeenCalledWith(member, null);
    });

    it('should call generatePaymentLink and return result without affiliate', () => {
      const member = { id: 2, telegram_id: 789012, affiliate_code: null };
      generatePaymentLink.mockReturnValue({
        success: true,
        data: { url: 'https://pay.cakto.com.br/checkout/123', hasAffiliate: false, affiliateCode: null }
      });

      const result = getPaymentLinkForMember(member);

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://pay.cakto.com.br/checkout/123');
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(generatePaymentLink).toHaveBeenCalledWith(member, null);
    });

    it('should propagate error from generatePaymentLink', () => {
      const member = { id: 3, telegram_id: 345678 };
      generatePaymentLink.mockReturnValue({
        success: false,
        error: { code: 'CONFIG_MISSING', message: 'Checkout URL not configured' }
      });

      const result = getPaymentLinkForMember(member);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');
      expect(generatePaymentLink).toHaveBeenCalledWith(member, null);
    });
  });

  // ============================================
  // Grace Period: formatKickWarning
  // ============================================
  describe('formatKickWarning', () => {
    it('should format warning for 2 days remaining', () => {
      const member = { id: 1, telegram_username: 'testuser' };
      const message = formatKickWarning(member, 2, 'https://checkout.example.com');

      expect(message).toContain('⚠️ *Pagamento Pendente*');
      expect(message).toContain('*2 dias*');
      expect(message).toContain('[PAGAR AGORA]');
      expect(message).toContain('mercadopago.com.br/subscriptions');
    });

    it('should format last warning for 1 day remaining', () => {
      const member = { id: 1, telegram_username: 'testuser' };
      const message = formatKickWarning(member, 1, 'https://checkout.example.com');

      expect(message).toContain('🚨 *ÚLTIMO AVISO*');
      expect(message).toContain('*removido amanhã*');
      expect(message).toContain('[PAGAR AGORA]');
    });

    it('should include operator username from config', () => {
      const member = { id: 1, telegram_username: 'testuser' };
      const message = formatKickWarning(member, 2, 'https://checkout.example.com');

      expect(message).toContain('Dúvidas? @');
    });
  });

  // ============================================
  // Grace Period: sendKickWarningNotification
  // ============================================
  describe('sendKickWarningNotification', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should send kick warning notification successfully with group-specific checkout URL', async () => {
      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 2001 }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock hasNotificationToday returning false
      const mockSelectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      // Mock registerNotification
      const mockInsertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'notif-456' }, error: null }),
      };

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mockSelectChain;
        return mockInsertChain;
      });

      const member = { id: 1, telegram_id: 123456789, email: 'test@example.com' };
      const groupConfig = { checkoutUrl: 'https://pay.cakto.com.br/group-specific/789' };
      const result = await sendKickWarningNotification(member, 2, groupConfig);

      expect(result.success).toBe(true);
      expect(result.data.messageId).toBe(2001);
      expect(result.data.daysRemaining).toBe(2);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Pagamento Pendente'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should fail when no group-specific checkout URL is available', async () => {
      // Mock hasNotificationToday returning false
      const mockSelectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      supabase.from.mockReturnValue(mockSelectChain);

      const member = { id: 1, telegram_id: 123456789, email: 'test@example.com' };
      const result = await sendKickWarningNotification(member, 2);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_MISSING');
    });

    it('should skip if already notified today', async () => {
      // Mock hasNotificationToday returning true
      const mockSelectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
      };
      supabase.from.mockReturnValue(mockSelectChain);

      const member = { id: 1, telegram_id: 123456789, email: 'test@example.com' };
      const result = await sendKickWarningNotification(member, 2);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('already_notified_today');
    });

    it('should return error when member has no telegram_id', async () => {
      const member = { id: 1, telegram_id: null, email: 'test@example.com' };
      const result = await sendKickWarningNotification(member, 2);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_TELEGRAM_ID');
    });
  });
});

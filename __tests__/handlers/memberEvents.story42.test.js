/**
 * Tests for Story 4.2: Boas-vindas e Registro com Status Trial
 * Handler flow tests covering the welcome flow with Preapproval Plan checkout
 */

// Shared mutable config for per-test overrides
const sharedConfig = {
  membership: {
    groupId: 'group-uuid-123',
    trialDays: 7,
    checkoutUrl: 'https://fallback.checkout.com',
    operatorUsername: 'testoperator',
  },
};

// Mock dependencies before importing the handler
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../lib/config', () => ({
  config: sharedConfig,
}));

jest.mock('../../bot/telegram', () => ({
  getBot: jest.fn(),
}));

jest.mock('../../bot/services/memberService', () => ({
  getMemberByTelegramId: jest.fn(),
  createTrialMember: jest.fn(),
  canRejoinGroup: jest.fn(),
  reactivateMember: jest.fn(),
  getTrialDays: jest.fn(),
}));

jest.mock('../../bot/services/metricsService', () => ({
  getSuccessRateForDays: jest.fn(),
}));

jest.mock('../../bot/services/notificationService', () => ({
  registerNotification: jest.fn().mockResolvedValue({ success: true }),
}));

const {
  handleNewChatMembers,
  processNewMember,
  sendWelcomeMessage,
  sendPaymentRequiredMessage,
} = require('../../bot/handlers/memberEvents');
const { getBot } = require('../../bot/telegram');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const {
  getMemberByTelegramId,
  createTrialMember,
  canRejoinGroup,
  reactivateMember,
  getTrialDays,
} = require('../../bot/services/memberService');
const { getSuccessRateForDays } = require('../../bot/services/metricsService');

describe('Story 4.2: Boas-vindas e Registro com Status Trial', () => {
  let mockBot;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 99999 }),
    };
    getBot.mockReturnValue(mockBot);
    getSuccessRateForDays.mockResolvedValue({
      success: true,
      data: { rate: 68.0 },
    });
    getTrialDays.mockResolvedValue({
      success: true,
      data: { days: 7, source: 'system_config' },
    });

    // Reset config to defaults
    sharedConfig.membership = {
      groupId: 'group-uuid-123',
      trialDays: 7,
      checkoutUrl: 'https://fallback.checkout.com',
      operatorUsername: 'testoperator',
    };
  });

  // ============================================
  // 3.1: Fluxo completo: novo membro entra → bot detecta → cria trial → envia DM
  // ============================================
  describe('AC1/AC2/AC3: Fluxo completo de novo membro', () => {
    test('3.1 - novo membro: detecta entrada → cria trial → envia DM com checkout URL do grupo', async () => {
      const groupId = 'group-uuid-123';

      // Member not found
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });

      // Create trial succeeds
      createTrialMember.mockResolvedValue({
        success: true,
        data: {
          id: 42,
          telegram_id: '12345',
          status: 'trial',
          group_id: groupId,
          trial_started_at: new Date().toISOString(),
          trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock groups table for checkout URL resolution
      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { checkout_url: 'https://mp.com/subscriptions/checkout?preapproval_plan_id=plan-abc' },
              error: null,
            }),
          };
        }
        // member_events and member_notifications tables
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      const msg = {
        new_chat_members: [
          { id: 12345, username: 'newmember', first_name: 'Maria', is_bot: false },
        ],
      };

      const result = await handleNewChatMembers(msg);

      // AC1: Member was processed and created as trial
      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 12345, telegramUsername: 'newmember', groupId },
        7
      );

      // AC2: Welcome message sent with checkout URL
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('Bem-vindo');
      expect(sentMessage).toContain('Maria');
      expect(sentMessage).toContain('7 dias grátis');
      expect(sentMessage).toContain('ASSINAR');

      // AC3: Checkout URL is from the group's preapproval plan
      expect(sentMessage).toContain('https://mp.com/subscriptions/checkout?preapproval_plan_id=plan-abc');
    });
  });

  // ============================================
  // 3.2: Membro que já existe com status trial entra novamente
  // ============================================
  describe('AC1: Membro trial existente re-entra', () => {
    test('3.2 - membro trial existente: não duplica, atualiza joined_group_at', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 10,
          telegram_id: '12345',
          status: 'trial',
          joined_group_at: null,
          notes: null,
        },
      });

      const updateMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockImplementation(() => ({
        update: updateMock,
        eq: eqMock,
      }));

      const user = { id: 12345, username: 'existinguser', first_name: 'Existing' };
      const result = await processNewMember(user, 'group-uuid-123');

      // Should NOT create a new trial
      expect(createTrialMember).not.toHaveBeenCalled();
      // Should be marked as already_exists (not processed as new)
      expect(result.processed).toBe(false);
      expect(result.action).toBe('already_exists');
      expect(supabase.from).toHaveBeenCalledWith('members');
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        joined_group_at: expect.any(String),
        telegram_username: 'existinguser',
      }));
      expect(eqMock).toHaveBeenCalledWith('id', 10);
    });
  });

  // ============================================
  // 3.3: Membro removido re-entra (verifica regra de 24h)
  // ============================================
  describe('AC1: Membro removido re-entra', () => {
    test('3.3 - membro removido < 24h: reativa como trial', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 20,
          telegram_id: '12345',
          status: 'removido',
          kicked_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        },
      });

      canRejoinGroup.mockResolvedValue({
        success: true,
        data: { canRejoin: true, hoursSinceKick: 12 },
      });

      reactivateMember.mockResolvedValue({
        success: true,
        data: { id: 20, status: 'trial' },
      });

      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      const user = { id: 12345, username: 'returnuser', first_name: 'Return' };
      const result = await processNewMember(user, 'group-uuid-123');

      expect(result.processed).toBe(true);
      expect(result.action).toBe('reactivated');
      expect(reactivateMember).toHaveBeenCalledWith(20);
    });

    test('3.3 - membro removido > 24h: exige pagamento', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 30,
          telegram_id: '12345',
          status: 'removido',
          kicked_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        },
      });

      canRejoinGroup.mockResolvedValue({
        success: true,
        data: { canRejoin: false, hoursSinceKick: 48 },
      });

      // Mock groups table for checkout URL in payment message
      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { checkout_url: 'https://mp.com/subscriptions/checkout?preapproval_plan_id=plan-xyz' },
              error: null,
            }),
          };
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      const user = { id: 12345, username: 'lateuser', first_name: 'Late' };
      const result = await processNewMember(user, 'group-uuid-123');

      expect(result.processed).toBe(true);
      expect(result.action).toBe('payment_required');
      expect(reactivateMember).not.toHaveBeenCalled();
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // 3.4: Bot sem GROUP_ID (single-tenant) → usa config fallback
  // ============================================
  describe('AC3: Single-tenant fallback', () => {
    test('3.4 - sem groupId: usa checkout_url do config (MP_CHECKOUT_URL)', async () => {
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await sendWelcomeMessage(12345, 'SingleTenant', 1, null);

      expect(result.success).toBe(true);
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      // Should use fallback URL from config.membership.checkoutUrl
      expect(sentMessage).toContain('https://fallback.checkout.com');
    });
  });

  // ============================================
  // 3.5: Grupo sem checkout_url → mostra contato do operador
  // ============================================
  describe('AC3: Grupo sem checkout_url', () => {
    test('3.5 - checkout_url NULL no grupo e no config: mostra contato do operador', async () => {
      sharedConfig.membership.checkoutUrl = null;

      // Group has no checkout_url
      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { checkout_url: null },
              error: null,
            }),
          };
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      const result = await sendWelcomeMessage(12345, 'NoCheckout', 1, 'group-no-url');

      expect(result.success).toBe(true);
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      // Should show operator contact instead of checkout link
      expect(sentMessage).toContain('@testoperator');
      expect(sentMessage).not.toContain('[ASSINAR');
      expect(sentMessage).toContain('Para assinar, fale com');
    });
  });

  // ============================================
  // 3.6: Membro que não deu /start → bot loga warning sem crashar
  // ============================================
  describe('AC2: Membro sem /start', () => {
    test('3.6 - membro não deu /start: bot loga warning, retorna USER_BLOCKED_BOT', async () => {
      const telegramError = new Error('Forbidden: bot was blocked by the user');
      telegramError.response = { statusCode: 403, body: { error_code: 403 } };
      mockBot.sendMessage.mockRejectedValue(telegramError);

      const result = await sendWelcomeMessage(12345, 'BlockedUser', 1, null);

      // Should not crash
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
      expect(result.error.message).toContain('not started chat');
      expect(logger.warn).toHaveBeenCalledWith(
        '[membership:member-events] User has not started chat with bot',
        { telegramId: 12345 },
      );
    });

    test('3.6 - sendPaymentRequiredMessage também trata 403 gracefully', async () => {
      const telegramError = new Error('Forbidden');
      telegramError.response = { statusCode: 403 };
      mockBot.sendMessage.mockRejectedValue(telegramError);

      const result = await sendPaymentRequiredMessage(12345, 1, null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
    });
  });

  // ============================================
  // Additional: Validate checkout URL is from Preapproval Plan
  // ============================================
  describe('AC2/AC3: Checkout URL do Preapproval Plan', () => {
    test('welcome message uses checkout_url from groups table (preapproval plan init_point)', async () => {
      const preapprovalCheckoutUrl = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=e3a5bb26';

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { checkout_url: preapprovalCheckoutUrl },
              error: null,
            }),
          };
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      const result = await sendWelcomeMessage(12345, 'MPUser', 1, 'group-mp');

      expect(result.success).toBe(true);
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      expect(sentMessage).toContain(preapprovalCheckoutUrl);
      expect(sentMessage).toContain('/subscriptions/checkout');
    });

    test('groups table query error falls back to config checkout_url', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Group not found', code: 'PGRST116' },
            }),
          };
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      const result = await sendWelcomeMessage(12345, 'FallbackUser', 1, 'unknown-group');

      expect(result.success).toBe(true);
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      // Falls back to config.membership.checkoutUrl
      expect(sentMessage).toContain('https://fallback.checkout.com');
    });
  });
});

/**
 * Tests for Start Command Handler (Gate Entry System)
 * Story 16.9: Implementar Portão de Entrada com Bot
 */

// Mock dependencies before requiring the module
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null })
    })
  }
}));
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));
jest.mock('../../bot/telegram');
jest.mock('../../bot/services/memberService');
jest.mock('../../bot/services/metricsService');
jest.mock('../../lib/config', () => ({
  config: {
    telegram: {
      publicGroupId: '-1001234567890'
    },
    membership: {
      trialDays: 7,
      affiliateTrialDays: 2, // Story 18.1: 2 days for affiliates
      checkoutUrl: 'https://checkout.example.com',
      operatorUsername: 'testoperator',
      subscriptionPrice: 'R$50/mês'
    }
  }
}));

const { handleStartCommand, handleStatusCommand, extractAffiliateCode } = require('../../bot/handlers/startCommand');
const { getBot } = require('../../bot/telegram');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByTelegramId,
  createTrialMember,
  canRejoinGroup,
  reactivateMember,
  getTrialDaysRemaining,
  setAffiliateCode
} = require('../../bot/services/memberService');
const { getSuccessRate } = require('../../bot/services/metricsService');

describe('Start Command Handler', () => {
  let mockBot;
  let mockSupabaseFrom;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock bot
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      createChatInviteLink: jest.fn().mockResolvedValue({
        invite_link: 'https://t.me/+ABC123'
      }),
      getChatMember: jest.fn().mockResolvedValue({
        status: 'member'
      })
    };
    getBot.mockReturnValue(mockBot);

    // Mock supabase
    mockSupabaseFrom = {
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({ data: null, error: null })
    };
    supabase.from = jest.fn().mockReturnValue(mockSupabaseFrom);

    // Mock metrics
    getSuccessRate.mockResolvedValue({
      success: true,
      data: { rate30Days: 72.5 }
    });
  });

  describe('handleStartCommand', () => {
    const createMockMessage = (overrides = {}) => ({
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test'
      },
      chat: {
        id: 123456789,
        type: 'private'
      },
      text: '/start join',
      ...overrides
    });

    describe('AC1: New member via /start join', () => {
      it('should create trial member and send welcome with invite link', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        });

        createTrialMember.mockResolvedValue({
          success: true,
          data: { id: 1, status: 'trial' }
        });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(result.action).toBe('created');
        // Story 18.1: Now includes affiliateCode (null when no affiliate)
        expect(createTrialMember).toHaveBeenCalledWith(
          { telegramId: 123456789, telegramUsername: 'testuser', affiliateCode: null },
          7
        );
        expect(mockBot.createChatInviteLink).toHaveBeenCalledWith(
          '-1001234567890',
          expect.objectContaining({
            member_limit: 1
          })
        );
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('Bem-vindo'),
          expect.objectContaining({
            reply_markup: expect.objectContaining({
              inline_keyboard: expect.arrayContaining([
                expect.arrayContaining([
                  expect.objectContaining({ text: '🚀 ENTRAR NO GRUPO' })
                ])
              ])
            })
          })
        );
      });
    });

    describe('AC2: Existing member (trial/ativo)', () => {
      it('should show status if already in group', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: true,
          data: {
            id: 1,
            telegram_id: 123456789,
            status: 'trial',
            joined_group_at: '2026-01-15T10:00:00Z'
          }
        });

        getTrialDaysRemaining.mockResolvedValue({
          success: true,
          data: { daysRemaining: 5 }
        });

        // Telegram API confirms user is still in group
        mockBot.getChatMember.mockResolvedValue({ status: 'member' });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(result.action).toBe('already_in_group');
        expect(mockBot.getChatMember).toHaveBeenCalledWith('-1001234567890', 123456789);
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('Você já está no grupo'),
          expect.any(Object)
        );
      });

      it('should generate new invite if not yet in group', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: true,
          data: {
            id: 1,
            status: 'trial',
            joined_group_at: null
          }
        });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(mockBot.createChatInviteLink).toHaveBeenCalled();
      });

      it('should generate new invite if user LEFT the group (db shows joined but Telegram API says left)', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: true,
          data: {
            id: 1,
            telegram_id: 123456789,
            status: 'trial',
            joined_group_at: '2026-01-15T10:00:00Z' // DB says they joined
          }
        });

        // Telegram API says user LEFT the group
        mockBot.getChatMember.mockResolvedValue({ status: 'left' });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(mockBot.getChatMember).toHaveBeenCalledWith('-1001234567890', 123456789);
        expect(mockBot.createChatInviteLink).toHaveBeenCalled();
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('Bem-vindo'),
          expect.any(Object)
        );
      });

      it('should generate new invite if user is NOT FOUND in group via Telegram API', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: true,
          data: {
            id: 1,
            telegram_id: 123456789,
            status: 'trial',
            joined_group_at: '2026-01-15T10:00:00Z'
          }
        });

        // Telegram API throws "user not found" error
        mockBot.getChatMember.mockRejectedValue(new Error('Bad Request: user not found'));

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(mockBot.createChatInviteLink).toHaveBeenCalled();
      });
    });

    describe('AC3: Removed member (< 24h)', () => {
      it('should allow rejoin and generate invite', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: true,
          data: {
            id: 1,
            status: 'removido',
            kicked_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() // 12h ago
          }
        });

        canRejoinGroup.mockResolvedValue({
          success: true,
          data: { canRejoin: true, hoursSinceKick: 12 }
        });

        reactivateMember.mockResolvedValue({
          success: true,
          data: { id: 1, status: 'trial' }
        });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(reactivateMember).toHaveBeenCalledWith(1);
        expect(mockBot.createChatInviteLink).toHaveBeenCalled();
      });
    });

    describe('AC4: Removed member (> 24h)', () => {
      it('should send payment required message', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: true,
          data: {
            id: 1,
            status: 'removido',
            kicked_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48h ago
          }
        });

        canRejoinGroup.mockResolvedValue({
          success: true,
          data: { canRejoin: false, hoursSinceKick: 48 }
        });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(result.action).toBe('payment_required');
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('período de acesso terminou'),
          expect.objectContaining({
            reply_markup: expect.objectContaining({
              inline_keyboard: expect.arrayContaining([
                expect.arrayContaining([
                  expect.objectContaining({ text: '💳 ASSINAR AGORA' })
                ])
              ])
            })
          })
        );
      });
    });

    describe('AC6: Generic /start (no payload)', () => {
      it('should handle /start without payload same as /start join', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        });

        createTrialMember.mockResolvedValue({
          success: true,
          data: { id: 1, status: 'trial' }
        });

        const msg = createMockMessage({ text: '/start' });
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(result.action).toBe('created');
      });
    });

    describe('Edge cases', () => {
      it('should ignore non-private chats', async () => {
        const msg = createMockMessage({
          chat: { id: -1001234567890, type: 'group' }
        });

        const result = await handleStartCommand(msg);

        expect(result.success).toBe(false);
        expect(result.action).toBe('ignored_non_private');
        expect(mockBot.sendMessage).not.toHaveBeenCalled();
      });

      it('should handle invite link generation failure gracefully', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        });

        createTrialMember.mockResolvedValue({
          success: true,
          data: { id: 1, status: 'trial' }
        });

        mockBot.createChatInviteLink.mockRejectedValue(new Error('Bot not admin'));

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(false);
        expect(result.action).toBe('invite_generation_failed');
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('Não foi possível gerar seu link'),
          expect.any(Object)
        );
      });
    });
  });

  describe('handleStatusCommand', () => {
    const createMockMessage = (overrides = {}) => ({
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test'
      },
      chat: {
        id: 123456789,
        type: 'private'
      },
      text: '/status',
      ...overrides
    });

    it('should show trial status with days remaining', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          status: 'trial',
          created_at: '2026-01-10T10:00:00Z'
        }
      });

      getTrialDaysRemaining.mockResolvedValue({
        success: true,
        data: { daysRemaining: 3 }
      });

      const msg = createMockMessage();
      const result = await handleStatusCommand(msg);

      expect(result.success).toBe(true);
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Trial'),
        expect.any(Object)
      );
    });

    it('should show not registered message for unknown user', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      const msg = createMockMessage();
      const result = await handleStatusCommand(msg);

      expect(result.success).toBe(true);
      expect(result.action).toBe('not_registered');
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('não está cadastrado')
      );
    });
  });

  // ============================================
  // Story 18.1: Affiliate Tracking Tests
  // ============================================

  describe('extractAffiliateCode', () => {
    it('should extract code from valid aff_ payload', () => {
      const result = extractAffiliateCode('aff_CARLOS123');
      expect(result.hasAffiliate).toBe(true);
      expect(result.affiliateCode).toBe('CARLOS123');
    });

    it('should extract code case-insensitively', () => {
      const result = extractAffiliateCode('AFF_maria456');
      expect(result.hasAffiliate).toBe(true);
      expect(result.affiliateCode).toBe('maria456');
    });

    it('should handle mixed case prefix', () => {
      const result = extractAffiliateCode('Aff_TestCode');
      expect(result.hasAffiliate).toBe(true);
      expect(result.affiliateCode).toBe('TestCode');
    });

    it('should return false for non-affiliate payloads', () => {
      const result = extractAffiliateCode('join');
      expect(result.hasAffiliate).toBe(false);
      expect(result.affiliateCode).toBeNull();
    });

    it('should return false for ref_ prefix (not aff_)', () => {
      const result = extractAffiliateCode('ref_CODIGO');
      expect(result.hasAffiliate).toBe(false);
      expect(result.affiliateCode).toBeNull();
    });

    it('should return false for empty payload', () => {
      const result = extractAffiliateCode('');
      expect(result.hasAffiliate).toBe(false);
      expect(result.affiliateCode).toBeNull();
    });

    it('should return false for null payload', () => {
      const result = extractAffiliateCode(null);
      expect(result.hasAffiliate).toBe(false);
      expect(result.affiliateCode).toBeNull();
    });

    it('should return false for undefined payload', () => {
      const result = extractAffiliateCode(undefined);
      expect(result.hasAffiliate).toBe(false);
      expect(result.affiliateCode).toBeNull();
    });

    it('should return false for aff_ with no code', () => {
      const result = extractAffiliateCode('aff_');
      expect(result.hasAffiliate).toBe(false);
      expect(result.affiliateCode).toBeNull();
    });

    it('should trim whitespace from payload', () => {
      const result = extractAffiliateCode('  aff_CODE123  ');
      expect(result.hasAffiliate).toBe(true);
      expect(result.affiliateCode).toBe('CODE123'); // Trims both leading and trailing
    });
  });

  describe('handleStartCommand with affiliate', () => {
    const createMockMessage = (overrides = {}) => ({
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test'
      },
      chat: {
        id: 123456789,
        type: 'private'
      },
      text: '/start aff_CARLOS123',
      ...overrides
    });

    it('should create new member with affiliate code and 2-day trial', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial', affiliate_code: 'CARLOS123' }
      });

      const msg = createMockMessage();
      const result = await handleStartCommand(msg);

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      // Should call with affiliateCode and 2 days trial
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 123456789, telegramUsername: 'testuser', affiliateCode: 'CARLOS123' },
        2 // 2 days for affiliates
      );
    });

    it('should update affiliate code for existing member', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          telegram_id: 123456789,
          status: 'trial',
          affiliate_code: 'OLD_AFFILIATE',
          joined_group_at: null
        }
      });

      setAffiliateCode.mockResolvedValue({
        success: true,
        data: { id: 1, affiliate_code: 'CARLOS123' }
      });

      const msg = createMockMessage();
      const result = await handleStartCommand(msg);

      expect(result.success).toBe(true);
      // Should update affiliate code (last-click model)
      expect(setAffiliateCode).toHaveBeenCalledWith(1, 'CARLOS123');
    });

    it('should NOT update affiliate when no aff_ parameter', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          telegram_id: 123456789,
          status: 'trial',
          affiliate_code: 'EXISTING_AFFILIATE',
          joined_group_at: null
        }
      });

      const msg = createMockMessage({ text: '/start join' }); // No affiliate code
      const result = await handleStartCommand(msg);

      expect(result.success).toBe(true);
      // Should NOT call setAffiliateCode - preserve existing affiliate
      expect(setAffiliateCode).not.toHaveBeenCalled();
    });

    it('should use 7-day trial for non-affiliate new member', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial' }
      });

      const msg = createMockMessage({ text: '/start join' }); // No affiliate
      const result = await handleStartCommand(msg);

      expect(result.success).toBe(true);
      // Should call with 7 days trial (no affiliate)
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 123456789, telegramUsername: 'testuser', affiliateCode: null },
        7 // 7 days for regular
      );
    });
  });
});

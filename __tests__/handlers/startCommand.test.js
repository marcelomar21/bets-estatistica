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

const { handleStartCommand, handleStatusCommand, handleEmailInput, shouldHandleAsEmailInput } = require('../../bot/handlers/startCommand');
const { getBot } = require('../../bot/telegram');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByTelegramId,
  getMemberByEmail,
  canRejoinGroup,
  reactivateMember,
  getTrialDaysRemaining,
  linkTelegramId,
  getTrialDays
} = require('../../bot/services/memberService');
const { getSuccessRateForDays } = require('../../bot/services/metricsService');

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
    getSuccessRateForDays.mockResolvedValue({
      success: true,
      data: { rate: 72.5 }
    });

    // Mock getTrialDays
    getTrialDays.mockResolvedValue({
      success: true,
      data: { days: 7, source: 'mock' }
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

    describe('AC1: New member via /start - asks for email (MP flow)', () => {
      it('should ask for email when member not found by telegram_id', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(result.action).toBe('waiting_email');
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('digite o email'),
          expect.any(Object)
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
      it('should handle /start without payload same as /start join - asks for email', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        });

        const msg = createMockMessage({ text: '/start' });
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(true);
        expect(result.action).toBe('waiting_email');
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

      it('should handle database error gracefully', async () => {
        getMemberByTelegramId.mockResolvedValue({
          success: false,
          error: { code: 'DB_ERROR', message: 'Connection failed' }
        });

        const msg = createMockMessage();
        const result = await handleStartCommand(msg);

        expect(result.success).toBe(false);
        expect(result.action).toBe('error');
        expect(mockBot.sendMessage).toHaveBeenCalledWith(
          123456789,
          expect.stringContaining('Erro ao verificar seu cadastro')
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
  // Email Verification Flow (MP Migration)
  // ============================================
  describe('handleEmailInput', () => {
    const createMockMessage = (email) => ({
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test'
      },
      chat: {
        id: 123456789,
        type: 'private'
      },
      text: email
    });

    beforeEach(() => {
      // Reset mocks for email tests
      getMemberByEmail.mockReset();
      linkTelegramId.mockReset();
    });

    it('should link telegram_id when email found with no telegram_id', async () => {
      getMemberByEmail.mockResolvedValue({
        success: true,
        data: { id: 1, telegram_id: null, status: 'ativo', email: 'test@example.com' }
      });

      linkTelegramId.mockResolvedValue({
        success: true,
        data: { id: 1, telegram_id: '123456789', status: 'ativo' }
      });

      const msg = createMockMessage('test@example.com');
      const result = await handleEmailInput(msg);

      expect(result.success).toBe(true);
      expect(linkTelegramId).toHaveBeenCalledWith(1, 123456789, 'testuser');
      expect(mockBot.createChatInviteLink).toHaveBeenCalled();
    });

    it('should reject if email already linked to different telegram', async () => {
      getMemberByEmail.mockResolvedValue({
        success: true,
        data: { id: 1, telegram_id: '999999999', status: 'ativo' }
      });

      const msg = createMockMessage('test@example.com');
      const result = await handleEmailInput(msg);

      expect(result.success).toBe(false);
      expect(result.action).toBe('email_already_linked');
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('já está vinculado a outra conta')
      );
    });

    it('should send payment link when email not found', async () => {
      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      const msg = createMockMessage('notfound@example.com');
      const result = await handleEmailInput(msg);

      expect(result.success).toBe(true);
      expect(result.action).toBe('payment_link_sent');
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Não encontramos uma assinatura'),
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

    it('should reject invalid email format', async () => {
      const msg = createMockMessage('invalid-email');
      const result = await handleEmailInput(msg);

      expect(result.success).toBe(false);
      expect(result.action).toBe('invalid_email');
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('Email inválido')
      );
    });
  });

  describe('shouldHandleAsEmailInput', () => {
    it('should return false for non-private chats', () => {
      const msg = { chat: { type: 'group' }, text: 'test@example.com', from: { id: 123 } };
      expect(shouldHandleAsEmailInput(msg)).toBe(false);
    });

    it('should return false for commands', () => {
      const msg = { chat: { type: 'private' }, text: '/start', from: { id: 123 } };
      expect(shouldHandleAsEmailInput(msg)).toBe(false);
    });

    it('should return false if no conversation state', () => {
      const msg = { chat: { type: 'private' }, text: 'test@example.com', from: { id: 999 } };
      expect(shouldHandleAsEmailInput(msg)).toBe(false);
    });
  });
});

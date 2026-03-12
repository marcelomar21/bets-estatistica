/**
 * Tests for kick-expired job — Story 4.5: Multi-tenant adaptations
 * Tests: group_id filtering, telegram_group_id resolution, checkout_url from group,
 *        audit log, fallback single-tenant, error scenarios
 *
 * Updated for multi-tenant iteration: runKickExpired now iterates over getAllBots() registry.
 */
const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

// Mock dependencies
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
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

const mockBotInstance = {
  sendMessage: jest.fn(),
  banChatMember: jest.fn(),
};

const mockGetAllBots = jest.fn();
jest.mock('../../../bot/telegram', () => ({
  getBot: jest.fn(() => mockBotInstance),
  getDefaultBotCtx: jest.fn(() => ({
    publicGroupId: '-100123456789',
    adminGroupId: '-100admin',
    botToken: 'test-token',
  })),
  getAllBots: mockGetAllBots,
}));

let mockConfig;
jest.mock('../../../lib/config', () => {
  mockConfig = {
    membership: {
      checkoutUrl: 'https://checkout-fallback.example.com',
      subscriptionPrice: 'R$50/mes',
      gracePeriodDays: 2,
      groupId: null,
    },
    telegram: {
      publicGroupId: '-100123456789',
    },
  };
  return { config: mockConfig };
});

jest.mock('../../../bot/services/alertService', () => ({
  alertAdmin: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../bot/services/notificationService', () => ({
  sendPrivateMessage: jest.fn().mockResolvedValue({ success: true, data: { messageId: 999 } }),
  getCheckoutLink: jest.fn(() => ({
    success: true,
    data: { checkoutUrl: 'https://checkout-fallback.example.com' },
  })),
  formatFarewellMessage: jest.fn((member, reason, url, groupConfig) => `Farewell: ${reason} - ${url}`),
  sendKickWarningNotification: jest.fn().mockResolvedValue({ success: true, data: { messageId: 888 } }),
}));

jest.mock('../../../bot/services/memberService', () => ({
  kickMemberFromGroup: jest.fn().mockResolvedValue({
    success: true,
    data: { until_date: Math.floor(Date.now() / 1000) + 86400 },
  }),
  markMemberAsRemoved: jest.fn().mockResolvedValue({
    success: true,
    data: { status: 'removido' },
  }),
}));

jest.mock('../../../bot/handlers/memberEvents', () => ({
  registerMemberEvent: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../bot/lib/configHelper', () => ({
  getConfig: jest.fn().mockResolvedValue('mercadopago'),
}));

const {
  runKickExpired,
  resolveGroupData,
  getAllInadimplenteMembers,
  processMemberKick,
} = require('../../../bot/jobs/membership/kick-expired');
const { alertAdmin } = require('../../../bot/services/alertService');
const { kickMemberFromGroup, markMemberAsRemoved } = require('../../../bot/services/memberService');
const { registerMemberEvent } = require('../../../bot/handlers/memberEvents');
const {
  sendPrivateMessage,
  getCheckoutLink,
  formatFarewellMessage,
  sendKickWarningNotification,
} = require('../../../bot/services/notificationService');

describe('Story 4.5: kick-expired multi-tenant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.membership.groupId = null;
    mockConfig.telegram.publicGroupId = '-100123456789';
    // Default: one group in registry
    mockGetAllBots.mockReturnValue(new Map([
      ['group-uuid-123', {
        bot: mockBotInstance,
        groupId: 'group-uuid-123',
        publicGroupId: '-100999888777',
        groupConfig: {
          name: 'Grupo VIP',
          checkoutUrl: 'https://mp.com/checkout/group123',
          operatorUsername: 'operador_test',
          subscriptionPrice: 'R$50/mes',
        },
      }],
    ]));
  });

  describe('resolveGroupData', () => {
    it('should resolve group by ID from database', async () => {
      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo VIP',
        telegram_group_id: '-100999888777',
        checkout_url: 'https://mp.com/checkout/group123',
        status: 'active',
      };

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await resolveGroupData('group-uuid-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockGroup);
      expect(supabase.from).toHaveBeenCalledWith('groups');
    });

    it('should return error when group not found', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' },
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await resolveGroupData('nonexistent-group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_NOT_FOUND');
    });
  });

  describe('getAllInadimplenteMembers — multi-tenant filtering', () => {
    it('should filter by group_id when groupId is provided', async () => {
      const eqCalls = [];
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function (col, val) {
          eqCalls.push({ col, val });
          if (col === 'group_id') {
            return Promise.resolve({ data: [{ id: 'm1' }], error: null });
          }
          return this;
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getAllInadimplenteMembers('group-uuid-123');

      expect(result.success).toBe(true);
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          { col: 'status', val: 'inadimplente' },
          { col: 'is_admin', val: false },
          { col: 'group_id', val: 'group-uuid-123' },
        ])
      );
    });

    it('should NOT filter by group_id when no groupId provided and config is null', async () => {
      mockConfig.membership.groupId = null;

      let eqCount = 0;
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(function () {
          eqCount++;
          // .eq('status','inadimplente') then .eq('is_admin', false) — resolve at 2nd
          if (eqCount >= 2) return Promise.resolve({ data: [], error: null });
          return mockChain;
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getAllInadimplenteMembers();

      expect(result.success).toBe(true);
      expect(mockChain.eq).toHaveBeenCalledTimes(2);
      expect(mockChain.eq).toHaveBeenCalledWith('status', 'inadimplente');
      expect(mockChain.eq).toHaveBeenCalledWith('is_admin', false);
    });
  });

  describe('processMemberKick — multi-tenant', () => {
    const mockGroupData = {
      id: 'group-uuid-123',
      name: 'Grupo VIP',
      telegram_group_id: '-100999888777',
      checkout_url: 'https://mp.com/checkout/group123',
      status: 'active',
    };

    const mockBotCtx = {
      bot: mockBotInstance,
      groupId: 'group-uuid-123',
      publicGroupId: '-100999888777',
      groupConfig: {
        name: 'Grupo VIP',
        checkoutUrl: 'https://mp.com/checkout/group123',
        operatorUsername: 'operador_test',
        subscriptionPrice: 'R$50/mes',
      },
    };

    const baseMember = {
      id: 'member-1',
      telegram_id: 123456789,
      telegram_username: 'testuser',
      status: 'inadimplente',
    };

    it('should use group telegram_group_id for kick (multi-tenant)', async () => {
      await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(kickMemberFromGroup).toHaveBeenCalledWith(
        123456789,
        '-100999888777',
        mockBotInstance
      );
    });

    it('should use group checkout_url for farewell message', async () => {
      await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(formatFarewellMessage).toHaveBeenCalledWith(
        baseMember,
        'payment_failed',
        'https://mp.com/checkout/group123',
        mockBotCtx.groupConfig
      );
    });

    it('should skip farewell message when group has no checkout_url (no global fallback for multi-tenant safety)', async () => {
      const groupWithoutCheckout = { ...mockGroupData, checkout_url: null };
      const ctxWithoutCheckout = {
        ...mockBotCtx,
        groupConfig: { ...mockBotCtx.groupConfig, checkoutUrl: null },
      };

      await processMemberKick(baseMember, 'payment_failed', groupWithoutCheckout, mockBotInstance, ctxWithoutCheckout);

      // Global fallback removed — getCheckoutLink should NOT be called
      expect(getCheckoutLink).not.toHaveBeenCalled();
      // Farewell message should NOT be sent (no checkout URL available)
      expect(formatFarewellMessage).not.toHaveBeenCalled();
      // Should log a warning about missing checkout URL
      expect(logger.warn).toHaveBeenCalledWith(
        '[membership:kick-expired] processMemberKick: no checkout URL configured',
        expect.objectContaining({ memberId: 'member-1' })
      );
    });

    it('should register audit log after successful kick', async () => {
      await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(registerMemberEvent).toHaveBeenCalledWith(
        'member-1',
        'kick',
        expect.objectContaining({
          reason: 'payment_failed',
          groupId: 'group-uuid-123',
          groupName: 'Grupo VIP',
        })
      );
    });

    it('should NOT register audit log when kick fails', async () => {
      kickMemberFromGroup.mockResolvedValueOnce({
        success: false,
        error: { code: 'TELEGRAM_ERROR', message: 'Network timeout' },
      });

      await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(registerMemberEvent).not.toHaveBeenCalled();
    });

    it('should handle USER_BLOCKED_BOT — DM fails silently, kick continues', async () => {
      sendPrivateMessage.mockResolvedValueOnce({
        success: false,
        error: { code: 'USER_BLOCKED_BOT', message: 'Bot was blocked' },
      });

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(result.success).toBe(true);
      expect(result.data.kicked).toBe(true);
      expect(kickMemberFromGroup).toHaveBeenCalled();
      expect(registerMemberEvent).toHaveBeenCalled();
    });

    it('should handle USER_NOT_IN_GROUP — mark as removed without error', async () => {
      kickMemberFromGroup.mockResolvedValueOnce({
        success: false,
        error: { code: 'USER_NOT_IN_GROUP', message: 'User not found' },
      });

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_IN_GROUP');
      expect(markMemberAsRemoved).toHaveBeenCalledWith('member-1', 'payment_failed');
    });

    it('should handle BOT_NO_PERMISSION — alert admin, do NOT mark as removed', async () => {
      kickMemberFromGroup.mockResolvedValueOnce({
        success: false,
        error: { code: 'BOT_NO_PERMISSION', message: 'Bot is not administrator' },
      });

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BOT_NO_PERMISSION');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('ERRO PERSISTENTE'));
      expect(markMemberAsRemoved).not.toHaveBeenCalled();
    });

    it('should fail when DB update fails after successful kick', async () => {
      markMemberAsRemoved.mockResolvedValueOnce({
        success: false,
        error: { code: 'DB_ERROR', message: 'DB down' },
      });

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REMOVE_AFTER_KICK_FAILED');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('ERRO CRITICO'));
    });

    it('should register audit event when member has no telegram_id but is marked removed', async () => {
      const memberWithoutTelegram = { ...baseMember, telegram_id: null };

      const result = await processMemberKick(memberWithoutTelegram, 'payment_failed', mockGroupData, mockBotInstance, mockBotCtx);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(markMemberAsRemoved).toHaveBeenCalledWith('member-1', 'payment_failed');
      expect(registerMemberEvent).toHaveBeenCalledWith(
        'member-1',
        'kick',
        expect.objectContaining({
          reason: 'payment_failed',
          skipped: true,
          skippedReason: 'no_telegram_id',
        })
      );
    });
  });

  describe('runKickExpired — multi-tenant integration', () => {
    it('should resolve group and process members for each group in registry', async () => {
      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo VIP',
        telegram_group_id: '-100999888777',
        checkout_url: 'https://mp.com/checkout/group123',
        status: 'active',
      };

      // resolveGroupData
      const mockGroupChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };

      // getAllInadimplenteMembers (3 eq calls: status + is_admin + group_id)
      let eqCount = 0;
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function () {
          eqCount++;
          if (eqCount >= 3) return Promise.resolve({ data: [], error: null });
          return this;
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGroupChain)
        .mockReturnValueOnce(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('groups');
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    it('should process inadimplente past grace → kick + DM + mark removed', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo VIP',
        telegram_group_id: '-100999888777',
        checkout_url: 'https://mp.com/checkout/group123',
        status: 'active',
      };

      const mockMember = {
        id: 'member-expired',
        telegram_id: 111222333,
        telegram_username: 'expireduser',
        status: 'inadimplente',
        inadimplente_at: threeDaysAgo.toISOString(),
        group_id: 'group-uuid-123',
      };

      const mockGroupChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };

      let eqCount = 0;
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function () {
          eqCount++;
          if (eqCount >= 3) return Promise.resolve({ data: [mockMember], error: null });
          return this;
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGroupChain)
        .mockReturnValueOnce(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result.kicked).toBe(1);
      expect(kickMemberFromGroup).toHaveBeenCalledWith(111222333, '-100999888777', mockBotInstance);
      expect(markMemberAsRemoved).toHaveBeenCalledWith('member-expired', 'payment_failed');
    });

    it('should send warning for inadimplente within grace period, NOT kick', async () => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo VIP',
        telegram_group_id: '-100999888777',
        checkout_url: 'https://mp.com/checkout/group123',
        status: 'active',
      };

      const mockMember = {
        id: 'member-grace',
        telegram_id: 444555666,
        telegram_username: 'graceuser',
        status: 'inadimplente',
        inadimplente_at: oneDayAgo.toISOString(),
      };

      const mockGroupChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };

      let eqCount = 0;
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function () {
          eqCount++;
          if (eqCount >= 3) return Promise.resolve({ data: [mockMember], error: null });
          return this;
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGroupChain)
        .mockReturnValueOnce(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result.warned).toBe(1);
      expect(result.kicked).toBe(0);
      expect(kickMemberFromGroup).not.toHaveBeenCalled();
      expect(sendKickWarningNotification).toHaveBeenCalledWith(
        mockMember,
        1,
        expect.objectContaining({ name: 'Grupo VIP' }),
        mockBotInstance
      );
    });

    it('should handle empty bot registry gracefully', async () => {
      mockGetAllBots.mockReturnValue(new Map());

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result.kicked).toBe(0);
    });
  });
});

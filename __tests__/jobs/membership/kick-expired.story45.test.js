/**
 * Tests for kick-expired job — Story 4.5: Multi-tenant adaptations
 * Tests: group_id filtering, telegram_group_id resolution, checkout_url from group,
 *        audit log, fallback single-tenant, error scenarios
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

jest.mock('../../../bot/telegram', () => ({
  getBot: jest.fn(() => ({
    sendMessage: jest.fn(),
    banChatMember: jest.fn(),
  })),
}));

let mockConfig;
jest.mock('../../../lib/config', () => {
  mockConfig = {
    membership: {
      checkoutUrl: 'https://checkout-fallback.example.com',
      subscriptionPrice: 'R$50/mes',
      gracePeriodDays: 2,
      groupId: null, // Default: single-tenant
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
  formatFarewellMessage: jest.fn((member, reason, url) => `Farewell: ${reason} - ${url}`),
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

const {
  runKickExpired,
  resolveGroupData,
  getAllInadimplenteMembers,
  processMemberKick,
} = require('../../../bot/jobs/membership/kick-expired');
const { getBot } = require('../../../bot/telegram');
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
    // Reset config to single-tenant defaults
    mockConfig.membership.groupId = null;
    mockConfig.telegram.publicGroupId = '-100123456789';
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
    it('should filter by group_id when GROUP_ID is configured', async () => {
      mockConfig.membership.groupId = 'group-uuid-123';

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

      const result = await getAllInadimplenteMembers();

      expect(result.success).toBe(true);
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          { col: 'status', val: 'inadimplente' },
          { col: 'group_id', val: 'group-uuid-123' },
        ])
      );
    });

    it('should NOT filter by group_id when GROUP_ID is not set (single-tenant)', async () => {
      mockConfig.membership.groupId = null;

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getAllInadimplenteMembers();

      expect(result.success).toBe(true);
      // eq should only be called once (for status), not for group_id
      expect(mockChain.eq).toHaveBeenCalledTimes(1);
      expect(mockChain.eq).toHaveBeenCalledWith('status', 'inadimplente');
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

    const baseMember = {
      id: 'member-1',
      telegram_id: 123456789,
      telegram_username: 'testuser',
      status: 'inadimplente',
    };

    it('should use group telegram_group_id for kick (multi-tenant)', async () => {
      await processMemberKick(baseMember, 'payment_failed', mockGroupData);

      expect(kickMemberFromGroup).toHaveBeenCalledWith(
        123456789,
        '-100999888777' // group's telegram_group_id, NOT config.telegram.publicGroupId
      );
    });

    it('should use group checkout_url for farewell message (multi-tenant)', async () => {
      await processMemberKick(baseMember, 'payment_failed', mockGroupData);

      expect(formatFarewellMessage).toHaveBeenCalledWith(
        baseMember,
        'payment_failed',
        'https://mp.com/checkout/group123' // group's checkout_url
      );
    });

    it('should fall back to config checkout_url when group has no checkout_url', async () => {
      const groupWithoutCheckout = { ...mockGroupData, checkout_url: null };

      await processMemberKick(baseMember, 'payment_failed', groupWithoutCheckout);

      // Should call getCheckoutLink() as fallback
      expect(getCheckoutLink).toHaveBeenCalled();
      expect(formatFarewellMessage).toHaveBeenCalledWith(
        baseMember,
        'payment_failed',
        'https://checkout-fallback.example.com'
      );
    });

    it('should fall back to config.telegram.publicGroupId when no groupData (single-tenant)', async () => {
      await processMemberKick(baseMember, 'payment_failed', null);

      expect(kickMemberFromGroup).toHaveBeenCalledWith(
        123456789,
        '-100123456789' // config.telegram.publicGroupId
      );
    });

    it('should register audit log after successful kick', async () => {
      await processMemberKick(baseMember, 'payment_failed', mockGroupData);

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

      await processMemberKick(baseMember, 'payment_failed', mockGroupData);

      expect(registerMemberEvent).not.toHaveBeenCalled();
    });

    it('should handle USER_BLOCKED_BOT — DM fails silently, kick continues', async () => {
      sendPrivateMessage.mockResolvedValueOnce({
        success: false,
        error: { code: 'USER_BLOCKED_BOT', message: 'Bot was blocked' },
      });

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData);

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

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_IN_GROUP');
      expect(markMemberAsRemoved).toHaveBeenCalledWith('member-1', 'payment_failed');
      expect(registerMemberEvent).toHaveBeenCalledWith(
        'member-1',
        'kick',
        expect.objectContaining({
          reason: 'payment_failed',
          alreadyNotInGroup: true,
        })
      );
    });

    it('should handle BOT_NO_PERMISSION — alert admin, do NOT mark as removed', async () => {
      kickMemberFromGroup.mockResolvedValueOnce({
        success: false,
        error: { code: 'BOT_NO_PERMISSION', message: 'Bot is not administrator' },
      });

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData);

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

      const result = await processMemberKick(baseMember, 'payment_failed', mockGroupData);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REMOVE_AFTER_KICK_FAILED');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('ERRO CRITICO'));
      expect(registerMemberEvent).not.toHaveBeenCalled();
    });

    it('should not use publicGroupId fallback in multi-tenant when group is unresolved', async () => {
      mockConfig.membership.groupId = 'group-uuid-123';

      const result = await processMemberKick(baseMember, 'payment_failed', null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_CHAT_ID_MISSING');
      expect(kickMemberFromGroup).not.toHaveBeenCalled();
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('ERRO DE CONFIGURACAO'));
    });

    it('should register audit event when member has no telegram_id but is marked removed', async () => {
      const memberWithoutTelegram = {
        ...baseMember,
        telegram_id: null,
      };

      const result = await processMemberKick(memberWithoutTelegram, 'payment_failed', mockGroupData);

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
    it('should resolve group and filter members when GROUP_ID is set', async () => {
      mockConfig.membership.groupId = 'group-uuid-123';

      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo VIP',
        telegram_group_id: '-100999888777',
        checkout_url: 'https://mp.com/checkout/group123',
        status: 'active',
      };

      // 1st call: resolveGroupData — .from('groups').select().eq().single()
      const mockGroupChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };

      // 2nd call: getAllInadimplenteMembers — .from('members').select().eq().eq()
      // With multi-tenant, eq is called twice: status + group_id
      let eqCount = 0;
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function () {
          eqCount++;
          if (eqCount >= 2) {
            return Promise.resolve({ data: [], error: null });
          }
          return this;
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGroupChain)   // resolveGroupData
        .mockReturnValueOnce(mockMembersChain); // getAllInadimplenteMembers

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('groups');
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    it('should report failure if group resolution fails but still check members', async () => {
      mockConfig.membership.groupId = 'nonexistent-group';

      const mockGroupChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' },
        }),
      };

      let eqCount = 0;
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function () {
          eqCount++;
          if (eqCount >= 2) {
            return Promise.resolve({ data: [], error: null });
          }
          return this;
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGroupChain)
        .mockReturnValueOnce(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(false);
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('nao encontrado'));
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    it('should work in single-tenant mode (no GROUP_ID)', async () => {
      mockConfig.membership.groupId = null;

      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      supabase.from.mockReturnValue(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      // Should NOT call resolveGroupData (no from('groups'))
      expect(supabase.from).not.toHaveBeenCalledWith('groups');
    });

    it('should process inadimplente past grace → kick + DM + mark removed', async () => {
      mockConfig.membership.groupId = 'group-uuid-123';

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

      // resolveGroupData — .from('groups').select().eq().single()
      const mockGroupChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };

      // getAllInadimplenteMembers — .from('members').select().eq().eq()
      let eqCount = 0;
      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function () {
          eqCount++;
          if (eqCount >= 2) {
            return Promise.resolve({ data: [mockMember], error: null });
          }
          return this;
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGroupChain)
        .mockReturnValueOnce(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result.kicked).toBe(1);
      expect(kickMemberFromGroup).toHaveBeenCalledWith(111222333, '-100999888777');
      expect(formatFarewellMessage).toHaveBeenCalledWith(
        mockMember,
        'payment_failed',
        'https://mp.com/checkout/group123'
      );
      expect(markMemberAsRemoved).toHaveBeenCalledWith('member-expired', 'payment_failed');
      expect(registerMemberEvent).toHaveBeenCalledWith(
        'member-expired',
        'kick',
        expect.objectContaining({
          reason: 'payment_failed',
          groupId: 'group-uuid-123',
          groupName: 'Grupo VIP',
        })
      );
    });

    it('should send warning for inadimplente within grace period, NOT kick', async () => {
      mockConfig.membership.groupId = null;

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const mockMember = {
        id: 'member-grace',
        telegram_id: 444555666,
        telegram_username: 'graceuser',
        status: 'inadimplente',
        inadimplente_at: oneDayAgo.toISOString(),
      };

      const mockMembersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [mockMember], error: null }),
      };

      supabase.from.mockReturnValue(mockMembersChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result.warned).toBe(1);
      expect(result.kicked).toBe(0);
      expect(kickMemberFromGroup).not.toHaveBeenCalled();
      expect(sendKickWarningNotification).toHaveBeenCalledWith(mockMember, 1);
    });
  });
});

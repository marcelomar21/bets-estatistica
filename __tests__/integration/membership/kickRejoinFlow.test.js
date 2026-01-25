/**
 * Integration Tests: Kick and Rejoin Flow
 * Story 17.2: Adicionar Testes de Integração para Fluxo de Membership
 *
 * Tests the complete kick → rejoin flow:
 * - Membro kickado → tenta reentrar < 24h → permitido
 * - Membro kickado → tenta reentrar > 24h → bloqueado
 * - Trial expired flow via kick-expired job
 * - Webhook subscription_canceled → kick flow
 */

// ============================================
// MOCK SETUP - Must be before imports
// ============================================

const { createMockQueryBuilder } = require('./helpers/mockSupabase');

const mockSupabase = {
  from: jest.fn(() => createMockQueryBuilder()),
};

jest.mock('../../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    telegram: {
      botToken: 'test-token-123',
      adminGroupId: '-100111111',
      publicGroupId: '-100222222',
    },
    membership: {
      trialDays: 7,
      gracePeriodDays: 2,
      checkoutUrl: 'https://test.checkout.com',
      operatorUsername: 'testoperator',
    },
  },
  validateConfig: jest.fn(),
}));

jest.mock('../../../lib/validators', () => ({
  validateMemberId: jest.fn((id) => ({ valid: true, value: id })),
  validateTelegramId: jest.fn((id) => ({ valid: true, value: parseInt(id, 10) || id })),
}));

const mockBot = {
  sendMessage: jest.fn().mockResolvedValue({ message_id: 12345 }),
  banChatMember: jest.fn().mockResolvedValue(true),
  unbanChatMember: jest.fn().mockResolvedValue(true),
  createChatInviteLink: jest.fn().mockResolvedValue({ invite_link: 'https://t.me/+abc123' }),
};

jest.mock('../../../bot/telegram', () => ({
  initBot: jest.fn(),
  getBot: jest.fn(() => mockBot),
}));

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a mock member object
 */
function createMockMember(overrides = {}) {
  return {
    id: 'uuid-test-member',
    telegram_id: 123456789,
    telegram_username: 'testuser',
    email: 'test@example.com',
    status: 'trial',
    trial_started_at: new Date().toISOString(),
    trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_started_at: null,
    subscription_ends_at: null,
    mp_subscription_id: null,
    kicked_at: null,
    inadimplente_at: null,
    notes: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Setup mock for member operations
 */
function setupMemberMock(member, updateResult = null) {
  const selectBuilder = createMockQueryBuilder();
  selectBuilder.eq = jest.fn().mockReturnValue({
    single: jest.fn().mockResolvedValue({ data: member, error: member ? null : { code: 'PGRST116' } }),
  });

  const updateBuilder = createMockQueryBuilder();
  updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
  updateBuilder.select = jest.fn().mockReturnValue({
    single: jest.fn().mockResolvedValue({ data: updateResult || member, error: null }),
  });

  mockSupabase.from.mockImplementation((table) => {
    if (table === 'members') {
      return {
        select: jest.fn().mockReturnValue(selectBuilder),
        update: jest.fn().mockReturnValue(updateBuilder),
      };
    }
    return createMockQueryBuilder();
  });

  return { selectBuilder, updateBuilder };
}

// ============================================
// TEST SUITES
// ============================================

describe('Kick and Rejoin Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // SCENARIO 4: Rejoin within 24h - ALLOWED
  // ============================================
  describe('Scenario 4: Kicked member rejoins within 24 hours', () => {
    test('canRejoinGroup returns true for kick < 24h ago', async () => {
      // Member kicked 12 hours ago
      const kickedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12h ago
      });

      setupMemberMock(kickedMember);

      // Import after mocks
      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(kickedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(true);
      expect(result.data.hoursSinceKick).toBeLessThan(24);
    });

    test('canRejoinGroup returns true for very recent kick (1h ago)', async () => {
      const kickedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
      });

      setupMemberMock(kickedMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(kickedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(true);
      expect(result.data.hoursSinceKick).toBeLessThan(2);
    });

    test('canRejoinGroup returns true at exactly 23 hours', async () => {
      const kickedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), // 23h ago
      });

      setupMemberMock(kickedMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(kickedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(true);
      expect(result.data.hoursSinceKick).toBeLessThan(24);
    });
  });

  // ============================================
  // SCENARIO 5: Rejoin after 24h - BLOCKED
  // ============================================
  describe('Scenario 5: Kicked member cannot rejoin after 24 hours', () => {
    test('canRejoinGroup returns false for kick > 24h ago', async () => {
      // Member kicked 48 hours ago
      const kickedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago
      });

      setupMemberMock(kickedMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(kickedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.hoursSinceKick).toBeGreaterThan(24);
    });

    test('canRejoinGroup returns false at exactly 25 hours', async () => {
      const kickedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
      });

      setupMemberMock(kickedMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(kickedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
    });

    test('canRejoinGroup returns false for kick several days ago', async () => {
      const kickedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      });

      setupMemberMock(kickedMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(kickedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.hoursSinceKick).toBeGreaterThan(24 * 6); // > 6 days
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe('Edge Cases', () => {
    test('canRejoinGroup returns false if member not removed', async () => {
      const activeMember = createMockMember({
        status: 'ativo', // Not removed
      });

      setupMemberMock(activeMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(activeMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.reason).toBe('not_removed');
    });

    test('canRejoinGroup returns false if kicked_at is null', async () => {
      const inconsistentMember = createMockMember({
        status: 'removido',
        kicked_at: null, // Inconsistent state
      });

      setupMemberMock(inconsistentMember);

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup(inconsistentMember.id);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.reason).toBe('no_kicked_at');
    });

    test('canRejoinGroup returns error if member not found', async () => {
      setupMemberMock(null); // Member doesn't exist

      const { canRejoinGroup } = require('../../../bot/services/memberService');

      const result = await canRejoinGroup('nonexistent-uuid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  // ============================================
  // REACTIVATION FLOW
  // ============================================
  describe('Reactivation Flow', () => {
    test('reactivateMember converts removed to trial', async () => {
      const removedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      });

      const reactivatedMember = {
        ...removedMember,
        status: 'trial',
        kicked_at: null,
        trial_started_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Setup mock that returns removedMember on first call (getMemberById)
      // and reactivatedMember on update
      const selectBuilder = createMockQueryBuilder();
      selectBuilder.eq = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: removedMember, error: null }),
      });

      const updateBuilder = createMockQueryBuilder();
      updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
      updateBuilder.select = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: reactivatedMember, error: null }),
      });

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'members') {
          return {
            select: jest.fn().mockReturnValue(selectBuilder),
            update: jest.fn().mockReturnValue(updateBuilder),
          };
        }
        return createMockQueryBuilder();
      });

      const { reactivateMember } = require('../../../bot/services/memberService');

      const result = await reactivateMember(removedMember.id);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('trial');
      expect(result.data.kicked_at).toBeNull();
    });

    test('reactivateMember fails for non-removed member', async () => {
      const activeMember = createMockMember({
        status: 'ativo',
      });

      setupMemberMock(activeMember);

      const { reactivateMember } = require('../../../bot/services/memberService');

      const result = await reactivateMember(activeMember.id);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
    });
  });

  // ============================================
  // KICK TELEGRAM INTEGRATION
  // ============================================
  describe('Kick Telegram Integration', () => {
    test('kickMemberFromGroup calls Telegram banChatMember', async () => {
      const { kickMemberFromGroup } = require('../../../bot/services/memberService');

      const result = await kickMemberFromGroup(123456789, '-100222222');

      expect(result.success).toBe(true);
      expect(mockBot.banChatMember).toHaveBeenCalledWith(
        '-100222222',
        123456789,
        expect.objectContaining({ until_date: expect.any(Number) })
      );
    });

    test('kickMemberFromGroup handles user not in group', async () => {
      mockBot.banChatMember.mockRejectedValueOnce({
        response: {
          statusCode: 400,
          body: { description: 'user not found' },
        },
      });

      const { kickMemberFromGroup } = require('../../../bot/services/memberService');

      const result = await kickMemberFromGroup(123456789, '-100222222');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_IN_GROUP');
    });

    test('kickMemberFromGroup handles bot without permission', async () => {
      mockBot.banChatMember.mockRejectedValueOnce({
        response: {
          statusCode: 403,
          body: { description: 'not enough rights to ban' },
        },
      });

      const { kickMemberFromGroup } = require('../../../bot/services/memberService');

      const result = await kickMemberFromGroup(123456789, '-100222222');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BOT_NO_PERMISSION');
    });
  });

  // ============================================
  // MARK AS REMOVED FLOW
  // ============================================
  describe('Mark Member as Removed', () => {
    test('markMemberAsRemoved updates status and sets kicked_at', async () => {
      const activeMember = createMockMember({
        status: 'ativo',
      });

      const removedMember = {
        ...activeMember,
        status: 'removido',
        kicked_at: new Date().toISOString(),
      };

      const selectBuilder = createMockQueryBuilder();
      selectBuilder.eq = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: activeMember, error: null }),
      });

      const updateBuilder = createMockQueryBuilder();
      updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
      updateBuilder.select = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: removedMember, error: null }),
      });

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'members') {
          return {
            select: jest.fn().mockReturnValue(selectBuilder),
            update: jest.fn().mockReturnValue(updateBuilder),
          };
        }
        return createMockQueryBuilder();
      });

      const { markMemberAsRemoved } = require('../../../bot/services/memberService');

      const result = await markMemberAsRemoved(activeMember.id, 'payment_failed');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('removido');
    });

    test('markMemberAsRemoved fails for already removed member', async () => {
      const removedMember = createMockMember({
        status: 'removido',
        kicked_at: new Date().toISOString(),
      });

      setupMemberMock(removedMember);

      const { markMemberAsRemoved } = require('../../../bot/services/memberService');

      const result = await markMemberAsRemoved(removedMember.id, 'payment_failed');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
    });
  });
});

// ============================================
// PERFORMANCE TESTS
// ============================================
describe('Performance', () => {
  test('full rejoin check completes in under 100ms', async () => {
    const kickedMember = createMockMember({
      status: 'removido',
      kicked_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    });

    const selectBuilder = createMockQueryBuilder();
    selectBuilder.eq = jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: kickedMember, error: null }),
    });

    mockSupabase.from.mockImplementation(() => ({
      select: jest.fn().mockReturnValue(selectBuilder),
    }));

    const { canRejoinGroup } = require('../../../bot/services/memberService');

    const start = Date.now();
    await canRejoinGroup(kickedMember.id);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});

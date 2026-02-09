/**
 * Tests for memberService.js multi-tenant functionality
 * Story 3.1: Adaptar Registro de Membros para Multi-tenant
 */

// Mock supabase before importing the service
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock config with groupId for multi-tenant
jest.mock('../../lib/config', () => ({
  config: {
    membership: {
      groupId: 'test-group-uuid',
      checkoutUrl: 'https://checkout.test.com/product',
      trialDays: 7,
    },
  },
}));

const {
  createTrialMember,
  getMemberByTelegramId,
  createActiveMember,
  createTrialMemberMP,
  getMemberByEmail,
  getMemberByPayerId,
  getMemberById,
} = require('../../bot/services/memberService');
const { supabase } = require('../../lib/supabase');

// Helper to build supabase chain mock
function mockSupabaseChain(finalResult) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(finalResult),
    maybeSingle: jest.fn().mockResolvedValue(finalResult),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('memberService - Multi-tenant (Story 3.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Task 7.1: createTrialMember with groupId
  // ============================================
  describe('createTrialMember with groupId', () => {
    test('inserts group_id when groupId is provided', async () => {
      const groupId = 'test-group-uuid';

      // Mock getMemberByTelegramId → not found (so create proceeds)
      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      };

      // Mock insert chain
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 1,
            telegram_id: '123456',
            group_id: groupId,
            status: 'trial',
          },
          error: null,
        }),
      };

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: getMemberByTelegramId (check existing)
          return selectChain;
        }
        // Second call: insert new member
        return insertChain;
      });

      const result = await createTrialMember(
        { telegramId: '123456', telegramUsername: 'testuser', groupId },
        7
      );

      expect(result.success).toBe(true);
      expect(result.data.group_id).toBe(groupId);

      // Verify insert was called with group_id in the data
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.group_id).toBe(groupId);
      expect(insertCall.telegram_id).toBe('123456');
      expect(insertCall.status).toBe('trial');
    });

    test('uses config.membership.groupId when groupId is omitted', async () => {
      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      };

      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 10, telegram_id: '999', group_id: 'test-group-uuid', status: 'trial' },
          error: null,
        }),
      };

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return insertChain;
      });

      const result = await createTrialMember(
        { telegramId: '999', telegramUsername: 'fromconfig' },
        7
      );

      expect(result.success).toBe(true);
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.group_id).toBe('test-group-uuid');
    });

    // Task 7.2: createTrialMember with groupId = null (backward compat explícito)
    test('does not include group_id when groupId is explicitly null', async () => {
      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      };

      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 2,
            telegram_id: '789',
            group_id: null,
            status: 'trial',
          },
          error: null,
        }),
      };

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return insertChain;
      });

      const result = await createTrialMember(
        { telegramId: '789', telegramUsername: 'nogroup', groupId: null },
        7
      );

      expect(result.success).toBe(true);

      // Verify insert was NOT called with group_id
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.group_id).toBeUndefined();
    });
  });

  // ============================================
  // Task 7.3: getMemberByTelegramId with groupId filter
  // ============================================
  describe('getMemberByTelegramId with groupId', () => {
    test('filters by group_id when groupId is provided', async () => {
      const groupId = 'group-abc';
      const chain = mockSupabaseChain({
        data: { id: 1, telegram_id: '123', group_id: groupId },
        error: null,
      });

      const result = await getMemberByTelegramId('123', groupId);

      expect(result.success).toBe(true);
      expect(result.data.group_id).toBe(groupId);

      // Verify .eq was called for both telegram_id and group_id
      const eqCalls = chain.eq.mock.calls;
      // validateTelegramId converts string to number
      expect(eqCalls).toContainEqual(['telegram_id', 123]);
      expect(eqCalls).toContainEqual(['group_id', groupId]);
    });

    test('uses config.membership.groupId when groupId is omitted', async () => {
      const chain = mockSupabaseChain({
        data: { id: 99, telegram_id: '123', group_id: 'test-group-uuid' },
        error: null,
      });

      const result = await getMemberByTelegramId('123');

      expect(result.success).toBe(true);
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['telegram_id', 123]);
      expect(eqCalls).toContainEqual(['group_id', 'test-group-uuid']);
    });

    // Task 7.4: getMemberByTelegramId sem group (backward compat explícito)
    test('does not filter by group_id when groupId is explicitly null', async () => {
      const chain = mockSupabaseChain({
        data: { id: 1, telegram_id: '123', group_id: null },
        error: null,
      });

      const result = await getMemberByTelegramId('123', null);

      expect(result.success).toBe(true);

      // Verify .eq was called only for telegram_id
      const eqCalls = chain.eq.mock.calls;
      // validateTelegramId converts string to number
      expect(eqCalls).toContainEqual(['telegram_id', 123]);
      expect(eqCalls).not.toContainEqual(expect.arrayContaining(['group_id']));
    });

    test('returns MEMBER_NOT_FOUND when no match in group', async () => {
      mockSupabaseChain({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await getMemberByTelegramId('123', 'wrong-group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  // ============================================
  // Task 7.6: Same telegram_id in different groups
  // ============================================
  describe('same telegram_id in different groups', () => {
    test('can create member with same telegramId in different groups', async () => {
      // This test verifies the conceptual multi-tenant isolation:
      // getMemberByTelegramId with groupA returns NOT_FOUND even though
      // the same telegramId exists in groupB

      const chain = mockSupabaseChain({
        data: null,
        error: { code: 'PGRST116' }, // Not found in this group
      });

      const result = await getMemberByTelegramId('123', 'group-a');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');

      // Verify it filtered by group_id
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['group_id', 'group-a']);
    });
  });

  // ============================================
  // createActiveMember with groupId
  // ============================================
  describe('createActiveMember with groupId', () => {
    test('inserts group_id when provided', async () => {
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 5,
            email: 'test@test.com',
            group_id: 'group-xyz',
            status: 'ativo',
          },
          error: null,
        }),
      };
      supabase.from.mockReturnValue(insertChain);

      const result = await createActiveMember({
        email: 'test@test.com',
        subscriptionData: {
          subscriptionId: 'sub-1',
          customerId: 'cust-1',
          paymentMethod: 'pix',
        },
        groupId: 'group-xyz',
      });

      expect(result.success).toBe(true);
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.group_id).toBe('group-xyz');
    });

    test('does not include group_id when null', async () => {
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 6,
            email: 'test2@test.com',
            group_id: null,
            status: 'ativo',
          },
          error: null,
        }),
      };
      supabase.from.mockReturnValue(insertChain);

      const result = await createActiveMember({
        email: 'test2@test.com',
        subscriptionData: {
          subscriptionId: 'sub-2',
          customerId: 'cust-2',
          paymentMethod: 'pix',
        },
        groupId: null,
      });

      expect(result.success).toBe(true);
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.group_id).toBeUndefined();
    });
  });

  // ============================================
  // createTrialMemberMP with groupId
  // ============================================
  describe('createTrialMemberMP with groupId', () => {
    test('inserts group_id when provided', async () => {
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 7,
            email: 'mp@test.com',
            group_id: 'group-mp',
            status: 'trial',
          },
          error: null,
        }),
      };
      supabase.from.mockReturnValue(insertChain);

      const result = await createTrialMemberMP({
        email: 'mp@test.com',
        subscriptionId: 'sub-mp-1',
        payerId: 'payer-1',
        groupId: 'group-mp',
      });

      expect(result.success).toBe(true);
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.group_id).toBe('group-mp');
    });
  });

  // ============================================
  // getMemberByEmail with groupId
  // ============================================
  describe('getMemberByEmail with groupId', () => {
    test('filters by group_id when provided', async () => {
      const chain = mockSupabaseChain({
        data: { id: 1, email: 'a@b.com', group_id: 'group-email' },
        error: null,
      });

      const result = await getMemberByEmail('a@b.com', 'group-email');

      expect(result.success).toBe(true);
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['email', 'a@b.com']);
      expect(eqCalls).toContainEqual(['group_id', 'group-email']);
    });

    test('uses config.membership.groupId when groupId is omitted', async () => {
      const chain = mockSupabaseChain({
        data: { id: 2, email: 'tenant@x.com', group_id: 'test-group-uuid' },
        error: null,
      });

      const result = await getMemberByEmail('tenant@x.com');

      expect(result.success).toBe(true);
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['email', 'tenant@x.com']);
      expect(eqCalls).toContainEqual(['group_id', 'test-group-uuid']);
    });
  });

  // ============================================
  // getMemberByPayerId with groupId
  // ============================================
  describe('getMemberByPayerId with groupId', () => {
    test('filters by group_id when provided', async () => {
      const chain = mockSupabaseChain({
        data: { id: 1, mp_payer_id: 'payer-1', group_id: 'group-payer' },
        error: null,
      });

      const result = await getMemberByPayerId('payer-1', 'group-payer');

      expect(result.success).toBe(true);
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['mp_payer_id', 'payer-1']);
      expect(eqCalls).toContainEqual(['group_id', 'group-payer']);
    });

    test('uses config.membership.groupId when groupId is omitted', async () => {
      const chain = mockSupabaseChain({
        data: { id: 7, mp_payer_id: 'payer-tenant', group_id: 'test-group-uuid' },
        error: null,
      });

      const result = await getMemberByPayerId('payer-tenant');

      expect(result.success).toBe(true);
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['mp_payer_id', 'payer-tenant']);
      expect(eqCalls).toContainEqual(['group_id', 'test-group-uuid']);
    });
  });

  // ============================================
  // getMemberById with groupId
  // ============================================
  describe('getMemberById with groupId', () => {
    test('filters by group_id when provided', async () => {
      const chain = mockSupabaseChain({
        data: { id: 42, group_id: 'group-id-test' },
        error: null,
      });

      const result = await getMemberById(42, 'group-id-test');

      expect(result.success).toBe(true);
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['id', 42]);
      expect(eqCalls).toContainEqual(['group_id', 'group-id-test']);
    });
  });
});

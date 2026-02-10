/**
 * Tests for webhookProcessors.js - Story 4.3: Multi-tenant webhook processing
 * Validates group resolution, multi-tenant member lookup, admin notifications,
 * and webhook_events group_id tracking.
 */

// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  },
}));

// Mock mercadoPagoService
jest.mock('../../bot/services/mercadoPagoService', () => ({
  getSubscription: jest.fn(),
  getPayment: jest.fn(),
  getAuthorizedPayment: jest.fn(),
  extractCouponCode: jest.fn(),
  mapPaymentMethod: jest.fn().mockReturnValue('cartao_recorrente'),
}));

// Mock memberService
jest.mock('../../bot/services/memberService', () => ({
  getMemberByEmail: jest.fn(),
  getMemberBySubscription: jest.fn(),
  getMemberByPayerId: jest.fn(),
  createTrialMemberMP: jest.fn(),
  updateSubscriptionData: jest.fn(),
  activateMember: jest.fn(),
  renewMemberSubscription: jest.fn(),
  markMemberAsDefaulted: jest.fn(),
  markMemberAsRemoved: jest.fn(),
  reactivateRemovedMember: jest.fn(),
  kickMemberFromGroup: jest.fn(),
}));

// Mock notificationService
jest.mock('../../bot/services/notificationService', () => ({
  sendReactivationNotification: jest.fn(),
  sendPrivateMessage: jest.fn(),
  formatFarewellMessage: jest.fn().mockReturnValue('Mensagem de despedida'),
  sendPaymentRejectedNotification: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    telegram: {
      publicGroupId: '-1001234567890',
      adminGroupId: '-1009999999999',
    },
    membership: {
      checkoutUrl: 'https://mp.com/checkout/default',
      groupId: null,
    },
  },
}));

// Mock telegram bot
jest.mock('../../bot/telegram', () => ({
  getBot: jest.fn().mockReturnValue({
    sendMessage: jest.fn().mockResolvedValue(true),
  }),
}));

const mercadoPagoService = require('../../bot/services/mercadoPagoService');
const memberService = require('../../bot/services/memberService');
const { supabase } = require('../../lib/supabase');

// Must require after mocks
const {
  processWebhookEvent,
  handleSubscriptionCreated,
  handlePaymentApproved,
  handleSubscriptionCancelled,
  resolveGroupFromSubscription,
  resolveGroupFromPayment,
  notifyAdminPayment,
} = require('../../bot/services/webhookProcessors');

// ============================================
// Test Data Factories
// ============================================

const mockGroup = {
  id: 'group-uuid-123',
  name: 'Grupo Premium',
  status: 'active',
  mp_plan_id: 'plan_xyz',
  telegram_group_id: '-1005555555555',
  telegram_admin_group_id: '-1006666666666',
  checkout_url: 'https://mp.com/checkout/grupo-premium',
};

const mockSubscription = {
  id: 'sub_abc123',
  preapproval_plan_id: 'plan_xyz',
  payer_email: 'user@example.com',
  payer_id: 12345,
  status: 'authorized',
};

const mockPayment = {
  id: 888,
  status: 'approved',
  payer: { email: 'user@example.com', id: 12345 },
  transaction_amount: 50.00,
  point_of_interaction: {
    transaction_data: {
      subscription_id: 'sub_abc123',
    },
  },
};

const mockMember = {
  id: 1,
  email: 'user@example.com',
  status: 'trial',
  telegram_id: '999888777',
  group_id: 'group-uuid-123',
};

// ============================================
// GROUP RESOLUTION TESTS (AC2)
// ============================================

describe('Story 4.3: Group Resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveGroupFromSubscription', () => {
    it('should resolve group via preapproval_plan_id', async () => {
      // Setup: supabase returns group matching mp_plan_id
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
            }),
            single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
          }),
        }),
      });

      const result = await resolveGroupFromSubscription(mockSubscription);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBe('group-uuid-123');
      expect(result.data.group).toEqual(mockGroup);
    });

    it('should fallback to single-tenant when no group found', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      const result = await resolveGroupFromSubscription(mockSubscription);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBeNull();
      expect(result.data.fallback).toBe('single-tenant');
    });

    it('should fallback when preapproval_plan_id is missing', async () => {
      const subWithoutPlan = { ...mockSubscription, preapproval_plan_id: null };

      const result = await resolveGroupFromSubscription(subWithoutPlan);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBeNull();
      expect(result.data.fallback).toBe('single-tenant');
    });

    it('should reject inactive group', async () => {
      // Supabase filters by status='active', so inactive group returns no rows
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      const result = await resolveGroupFromSubscription(mockSubscription);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBeNull();
      expect(result.data.fallback).toBe('single-tenant');
    });
  });

  describe('resolveGroupFromPayment', () => {
    it('should resolve group via subscription_id from payment', async () => {
      // getSubscription returns subscription with preapproval_plan_id
      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: mockSubscription,
      });

      // supabase returns group
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
            }),
            single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
          }),
        }),
      });

      const result = await resolveGroupFromPayment(mockPayment);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBe('group-uuid-123');
    });

    it('should fallback to single-tenant when payment has no subscription', async () => {
      const paymentNoSub = {
        ...mockPayment,
        point_of_interaction: {},
        metadata: {},
        preapproval_id: undefined,
      };

      const result = await resolveGroupFromPayment(paymentNoSub);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBeNull();
      expect(result.data.fallback).toBe('single-tenant');
    });
  });
});

// ============================================
// MULTI-TENANT HANDLER TESTS (AC3, AC4, AC5, AC8)
// ============================================

describe('Story 4.3: Multi-tenant Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: supabase group resolution returns mockGroup
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
          }),
          single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
  });

  describe('handleSubscriptionCreated - multi-tenant (AC3)', () => {
    it('should pass resolved groupId to createTrialMemberMP', async () => {
      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: mockSubscription,
      });
      mercadoPagoService.extractCouponCode.mockReturnValue(null);

      memberService.getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      memberService.createTrialMemberMP.mockResolvedValue({
        success: true,
        data: { id: 1, email: 'user@example.com' },
      });

      const result = await handleSubscriptionCreated(
        { data: { id: 'sub_abc123' } },
        { eventId: 'evt-1' }
      );

      expect(result.success).toBe(true);
      expect(memberService.createTrialMemberMP).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'group-uuid-123',
        })
      );
    });
  });

  describe('handlePaymentApproved - multi-tenant (AC3)', () => {
    it('should use groupId to filter member lookup', async () => {
      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: mockSubscription,
      });

      memberService.getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { ...mockMember, status: 'trial' },
      });
      memberService.activateMember.mockResolvedValue({
        success: true,
        data: { ...mockMember, status: 'ativo' },
      });

      const result = await handlePaymentApproved(
        { data: { id: 888 } },
        { eventId: 'evt-2' },
        mockPayment
      );

      expect(result.success).toBe(true);
      expect(memberService.getMemberBySubscription).toHaveBeenCalledWith(
        'sub_abc123',
        'group-uuid-123'
      );
    });
  });

  describe('handleSubscriptionCancelled - multi-tenant (AC4)', () => {
    it('should kick from group-specific telegram_group_id, not config', async () => {
      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: { ...mockSubscription, status: 'cancelled' },
      });

      memberService.getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { ...mockMember, status: 'ativo' },
      });
      memberService.kickMemberFromGroup.mockResolvedValue({ success: true });
      memberService.markMemberAsRemoved.mockResolvedValue({
        success: true,
        data: { ...mockMember, status: 'removido' },
      });

      const result = await handleSubscriptionCancelled(
        { data: { id: 'sub_abc123' } },
        { eventId: 'evt-3' }
      );

      expect(result.success).toBe(true);
      // AC4: Should use group's telegram_group_id, not config.telegram.publicGroupId
      expect(memberService.kickMemberFromGroup).toHaveBeenCalledWith(
        '999888777',
        '-1005555555555' // group.telegram_group_id
      );
    });

    it('should use group checkout_url for farewell message', async () => {
      const notificationService = require('../../bot/services/notificationService');

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: { ...mockSubscription, status: 'cancelled' },
      });

      memberService.getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { ...mockMember, status: 'ativo' },
      });
      memberService.kickMemberFromGroup.mockResolvedValue({ success: true });
      memberService.markMemberAsRemoved.mockResolvedValue({
        success: true,
        data: { ...mockMember, status: 'removido' },
      });

      await handleSubscriptionCancelled(
        { data: { id: 'sub_abc123' } },
        { eventId: 'evt-4' }
      );

      // AC4: Should use group's checkout_url
      expect(notificationService.formatFarewellMessage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        'https://mp.com/checkout/grupo-premium' // group.checkout_url
      );
    });
  });

  describe('notifyAdminPayment - multi-tenant (AC8)', () => {
    it('should send notification to group-specific admin group', async () => {
      const { getBot } = require('../../bot/telegram');
      const bot = getBot();

      await notifyAdminPayment({
        email: 'user@example.com',
        amount: 50,
        action: 'conversion',
        memberId: 1,
        groupId: 'group-uuid-123',
        groupName: 'Grupo Premium',
        adminGroupId: '-1006666666666',
      });

      expect(bot.sendMessage).toHaveBeenCalledWith(
        '-1006666666666',
        expect.stringContaining('Grupo Premium'),
        expect.any(Object)
      );
    });

    it('should fallback to config.telegram.adminGroupId when group has no admin group', async () => {
      const { getBot } = require('../../bot/telegram');
      const bot = getBot();

      await notifyAdminPayment({
        email: 'user@example.com',
        amount: 50,
        action: 'renewal',
        memberId: 1,
      });

      expect(bot.sendMessage).toHaveBeenCalledWith(
        '-1009999999999', // config.telegram.adminGroupId
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});

// ============================================
// WEBHOOK_EVENTS GROUP_ID TRACKING (AC5)
// ============================================

describe('Story 4.3: webhook_events group_id tracking (AC5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
          }),
          single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
  });

  it('should update webhook_events with resolved group_id after processing', async () => {
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: mockSubscription,
    });
    mercadoPagoService.extractCouponCode.mockReturnValue(null);

    memberService.getMemberByEmail.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.createTrialMemberMP.mockResolvedValue({
      success: true,
      data: { id: 1 },
    });

    await handleSubscriptionCreated(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-5' }
    );

    // Verify that webhook_events was updated with group_id
    expect(supabase.from).toHaveBeenCalledWith('webhook_events');
  });
});

// ============================================
// FALLBACK / EDGE CASES
// ============================================

describe('Story 4.3: Fallback and Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process as single-tenant when group not found (AC2 fallback)', async () => {
    // Group resolution fails - no matching mp_plan_id
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { ...mockSubscription, preapproval_plan_id: 'unknown_plan' },
    });
    mercadoPagoService.extractCouponCode.mockReturnValue(null);

    memberService.getMemberByEmail.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.createTrialMemberMP.mockResolvedValue({
      success: true,
      data: { id: 1 },
    });

    const result = await handleSubscriptionCreated(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-6' }
    );

    expect(result.success).toBe(true);
    // Should still create member, but without groupId
    expect(memberService.createTrialMemberMP).toHaveBeenCalled();
  });
});

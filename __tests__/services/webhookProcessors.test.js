/**
 * Tests for webhookProcessors.js - Mercado Pago
 * Tech-Spec: Migração Cakto → Mercado Pago
 */

// Mock supabase (Story 4.3: needed for group resolution and webhook_events tracking)
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  },
}));

// Mock mercadoPagoService
jest.mock('../../bot/services/mercadoPagoService', () => ({
  getSubscription: jest.fn(),
  getPayment: jest.fn(),
  getAuthorizedPayment: jest.fn(),
  extractCouponCode: jest.fn(),
  mapPaymentMethod: jest.fn()
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
      adminGroupId: '-1009999999999'
    },
    membership: {
      checkoutUrl: 'https://checkout.example.com'
    }
  }
}));

// Mock telegram bot for admin notifications
jest.mock('../../bot/telegram', () => ({
  getBot: jest.fn().mockReturnValue({
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 })
  })
}));

const {
  processWebhookEvent,
  handleSubscriptionCreated,
  handlePaymentApproved,
  handlePaymentRejected,
  handleSubscriptionCancelled
} = require('../../bot/services/webhookProcessors');

const mercadoPagoService = require('../../bot/services/mercadoPagoService');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByEmail,
  getMemberBySubscription,
  createTrialMemberMP,
  updateSubscriptionData,
  activateMember,
  renewMemberSubscription,
  markMemberAsDefaulted,
  markMemberAsRemoved,
  reactivateRemovedMember,
  kickMemberFromGroup,
} = require('../../bot/services/memberService');

const { sendReactivationNotification } = require('../../bot/services/notificationService');

describe('webhookProcessors - Mercado Pago', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // handleSubscriptionCreated
  // ============================================
  describe('handleSubscriptionCreated', () => {
    it('should create trial member for new subscription', async () => {
      const payload = {
        data: { id: 'sub_123' }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_123',
          status: 'authorized',
          payer_email: 'new@example.com',
          payer_id: 12345
        }
      });

      mercadoPagoService.extractCouponCode.mockReturnValue(null);

      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      createTrialMemberMP.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', email: 'new@example.com', status: 'trial' }
      });

      const result = await handleSubscriptionCreated(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('created');
      expect(createTrialMemberMP).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          subscriptionId: 'sub_123',
          payerId: '12345',
          couponCode: null,
        })
      );
    });

    it('should update existing member subscription data', async () => {
      const payload = {
        data: { id: 'sub_456' }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_456',
          status: 'authorized',
          payer_email: 'existing@example.com',
          payer_id: 67890
        }
      });

      mercadoPagoService.extractCouponCode.mockReturnValue('COUPON10');

      getMemberByEmail.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', email: 'existing@example.com', status: 'trial' }
      });

      updateSubscriptionData.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', mp_subscription_id: 'sub_456' }
      });

      const result = await handleSubscriptionCreated(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('updated');
      expect(updateSubscriptionData).toHaveBeenCalledWith('uuid-2', {
        subscriptionId: 'sub_456',
        payerId: '67890',
        couponCode: 'COUPON10'
      });
    });

    it('should skip non-authorized subscriptions', async () => {
      const payload = {
        data: { id: 'sub_pending' }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_pending',
          status: 'pending',
          payer_email: 'test@example.com'
        }
      });

      const result = await handleSubscriptionCreated(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('not_authorized');
      expect(createTrialMemberMP).not.toHaveBeenCalled();
    });

    it('should return error if subscription ID missing', async () => {
      const payload = { data: {} };

      const result = await handleSubscriptionCreated(payload);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_SUBSCRIPTION_ID');
    });
  });

  // ============================================
  // handlePaymentApproved
  // ============================================
  describe('handlePaymentApproved', () => {
    it('should activate trial member on first payment', async () => {
      const payload = {
        data: { id: 'pay_123' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_123',
          status: 'approved',
          payer: { id: 12345, email: 'trial@example.com' },
          metadata: { preapproval_id: 'sub_123' },
          payment_method_id: 'credit_card'
        }
      });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('cartao_recorrente');

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'trial', mp_subscription_id: 'sub_123' }
      });

      activateMember.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'ativo' }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('activated');
      expect(activateMember).toHaveBeenCalledWith('uuid-1', {
        subscriptionId: 'sub_123',
        customerId: '12345',
        paymentMethod: 'cartao_recorrente'
      });
    });

    it('should renew active member subscription', async () => {
      const payload = {
        data: { id: 'pay_456' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_456',
          status: 'approved',
          payer: { id: 12345, email: 'active@example.com' },
          metadata: { preapproval_id: 'sub_456' }
        }
      });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('pix');

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', status: 'ativo', mp_subscription_id: 'sub_456' }
      });

      renewMemberSubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', status: 'ativo' }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('renewed');
      expect(renewMemberSubscription).toHaveBeenCalledWith('uuid-2');
    });

    it('should recover inadimplente member', async () => {
      const payload = {
        data: { id: 'pay_789' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_789',
          status: 'approved',
          payer: { id: 12345, email: 'defaulted@example.com' },
          metadata: { preapproval_id: 'sub_789' }
        }
      });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('pix');

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-3', status: 'inadimplente', mp_subscription_id: 'sub_789' }
      });

      activateMember.mockResolvedValue({
        success: true,
        data: { id: 'uuid-3', status: 'ativo' }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('recovered');
    });

    it('should reactivate removed member and send notification', async () => {
      const payload = {
        data: { id: 'pay_reactivate' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_reactivate',
          status: 'approved',
          payer: { id: 12345, email: 'removed@example.com' },
          metadata: { preapproval_id: 'sub_reactivate' }
        }
      });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('pix');

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-4', status: 'removido', telegram_id: 123456789, mp_subscription_id: 'sub_reactivate' }
      });

      reactivateRemovedMember.mockResolvedValue({
        success: true,
        data: { id: 'uuid-4', status: 'ativo' }
      });

      sendReactivationNotification.mockResolvedValue({ success: true });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('reactivated');
      expect(reactivateRemovedMember).toHaveBeenCalled();
      expect(sendReactivationNotification).toHaveBeenCalledWith(123456789, 'uuid-4');
    });

    it('should skip non-approved payments', async () => {
      const payload = {
        data: { id: 'pay_pending' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_pending',
          status: 'pending'
        }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('not_approved');
    });

    it('should return error if member not found and no email in payment', async () => {
      const payload = {
        data: { id: 'pay_unknown' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_unknown',
          status: 'approved',
          payer: {}, // No email
          metadata: { preapproval_id: 'sub_unknown' }
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });

    it('should create new member if not found but email exists in payment', async () => {
      const payload = {
        data: { id: 'pay_new' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_new',
          status: 'approved',
          payer: { id: 'payer123', email: 'new@example.com' },
          payment_method_id: 'credit_card',
          transaction_amount: 50,
          point_of_interaction: { transaction_data: { subscription_id: 'sub_new' } }
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      createTrialMemberMP.mockResolvedValue({
        success: true,
        data: { id: 99, email: 'new@example.com', status: 'trial' }
      });

      activateMember.mockResolvedValue({
        success: true,
        data: { id: 99, status: 'ativo' }
      });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('credit_card');

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('created_active');
      expect(createTrialMemberMP).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          subscriptionId: 'sub_new',
          payerId: 'payer123',
          couponCode: null,
        })
      );
    });

    it('should fallback to global email lookup and validate tenant when scoped lookup fails', async () => {
      const payload = {
        data: { id: 'pay_fallback_global_email' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_fallback_global_email',
          status: 'approved',
          payer: { id: 12345, email: 'fallback@example.com' },
          metadata: { preapproval_id: 'sub_fallback' },
          payment_method_id: 'credit_card'
        }
      });

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_fallback',
          preapproval_plan_id: 'plan_xyz',
          status: 'authorized'
        }
      });

      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo Premium',
        status: 'active',
        mp_plan_id: 'plan_xyz'
      };

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

      getMemberBySubscription.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      getMemberByEmail
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'uuid-global',
            status: 'trial',
            email: 'fallback@example.com',
            group_id: 'group-uuid-123',
            mp_subscription_id: 'sub_fallback'
          }
        });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('cartao_recorrente');
      activateMember.mockResolvedValue({
        success: true,
        data: { id: 'uuid-global', status: 'ativo' }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('activated');
      expect(getMemberByEmail).toHaveBeenNthCalledWith(1, 'fallback@example.com', 'group-uuid-123');
      expect(getMemberByEmail).toHaveBeenNthCalledWith(2, 'fallback@example.com', null);
    });

    it('should reject global email fallback when member belongs to another tenant', async () => {
      const payload = {
        data: { id: 'pay_tenant_mismatch' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_tenant_mismatch',
          status: 'approved',
          payer: { id: 12345, email: 'mismatch@example.com' },
          metadata: { preapproval_id: 'sub_mismatch' },
          payment_method_id: 'credit_card'
        }
      });

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_mismatch',
          preapproval_plan_id: 'plan_xyz',
          status: 'authorized'
        }
      });

      const mockGroup = {
        id: 'group-uuid-123',
        name: 'Grupo Premium',
        status: 'active',
        mp_plan_id: 'plan_xyz'
      };

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

      getMemberBySubscription.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      getMemberByEmail
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'MEMBER_NOT_FOUND' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'uuid-other-group',
            status: 'trial',
            email: 'mismatch@example.com',
            group_id: 'group-uuid-999'
          }
        });

      createTrialMemberMP.mockResolvedValue({
        success: true,
        data: { id: 101, email: 'mismatch@example.com', status: 'trial' }
      });
      mercadoPagoService.mapPaymentMethod.mockReturnValue('credit_card');
      activateMember.mockResolvedValue({
        success: true,
        data: { id: 101, status: 'ativo' }
      });

      const result = await handlePaymentApproved(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('created_active');
      expect(createTrialMemberMP).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'group-uuid-123',
          email: 'mismatch@example.com'
        })
      );
    });
  });

  // ============================================
  // handlePaymentRejected
  // ============================================
  describe('handlePaymentRejected', () => {
    it('should mark active member as defaulted', async () => {
      const payload = {
        data: { id: 'pay_rejected' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_rejected',
          status: 'rejected',
          status_detail: 'cc_rejected_insufficient_amount',
          payer: { email: 'active@example.com' },
          metadata: { preapproval_id: 'sub_123' }
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'ativo' }
      });

      markMemberAsDefaulted.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'inadimplente' }
      });

      const result = await handlePaymentRejected(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('marked_defaulted');
      expect(markMemberAsDefaulted).toHaveBeenCalledWith('uuid-1');
    });

    it('should skip if member not active', async () => {
      const payload = {
        data: { id: 'pay_rejected_trial' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_rejected_trial',
          status: 'rejected',
          payer: { email: 'trial@example.com' },
          metadata: { preapproval_id: 'sub_trial' }
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', status: 'trial' }
      });

      const result = await handlePaymentRejected(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('member_not_active');
      expect(markMemberAsDefaulted).not.toHaveBeenCalled();
    });

    it('should skip if member not found', async () => {
      const payload = {
        data: { id: 'pay_rejected_unknown' }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_rejected_unknown',
          status: 'rejected',
          payer: { email: 'unknown@example.com' }
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      const result = await handlePaymentRejected(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('member_not_found');
    });
  });

  // ============================================
  // handleSubscriptionCancelled
  // ============================================
  describe('handleSubscriptionCancelled', () => {
    it('should remove member when subscription cancelled', async () => {
      const payload = {
        data: { id: 'sub_cancelled' }
      };

      // Story 4.3: handler now fetches subscription for group resolution
      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: { id: 'sub_cancelled', status: 'cancelled' }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'ativo', telegram_id: 123456789 }
      });

      kickMemberFromGroup.mockResolvedValue({ success: true });
      markMemberAsRemoved.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'removido' }
      });

      const result = await handleSubscriptionCancelled(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('removed');
      expect(markMemberAsRemoved).toHaveBeenCalledWith('uuid-1', 'subscription_cancelled');
      // Story 4.3: Without group resolution, falls back to config.telegram.publicGroupId
      expect(kickMemberFromGroup).toHaveBeenCalledWith(123456789, '-1001234567890');
    });

    it('should remove trial member with trial_not_converted reason', async () => {
      const payload = {
        data: { id: 'sub_trial_expired' }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: { id: 'sub_trial_expired', status: 'cancelled' }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', status: 'trial', telegram_id: 987654321 }
      });

      kickMemberFromGroup.mockResolvedValue({ success: true });
      markMemberAsRemoved.mockResolvedValue({
        success: true,
        data: { id: 'uuid-2', status: 'removido' }
      });

      const result = await handleSubscriptionCancelled(payload);

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('removed');
      expect(markMemberAsRemoved).toHaveBeenCalledWith('uuid-2', 'trial_not_converted');
    });

    it('should skip if member already removed', async () => {
      const payload = {
        data: { id: 'sub_already_removed' }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: { id: 'sub_already_removed', status: 'cancelled' }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-3', status: 'removido' }
      });

      const result = await handleSubscriptionCancelled(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('already_removed');
      expect(markMemberAsRemoved).not.toHaveBeenCalled();
    });

    it('should skip if member not found', async () => {
      const payload = {
        data: { id: 'sub_unknown' }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: { id: 'sub_unknown', status: 'cancelled' }
      });

      getMemberBySubscription.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      const result = await handleSubscriptionCancelled(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('member_not_found');
    });
  });

  // ============================================
  // processWebhookEvent (router)
  // ============================================
  describe('processWebhookEvent', () => {
    it('should route subscription_preapproval created to handleSubscriptionCreated', async () => {
      const event = {
        event_type: 'subscription_preapproval',
        payload: {
          action: 'created',
          data: { id: 'sub_123' }
        }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_123',
          status: 'authorized',
          payer_email: 'test@example.com',
          payer_id: 12345
        }
      });

      mercadoPagoService.extractCouponCode.mockReturnValue(null);

      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' }
      });

      createTrialMemberMP.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'trial' }
      });

      const result = await processWebhookEvent(event);

      expect(result.success).toBe(true);
      expect(createTrialMemberMP).toHaveBeenCalled();
    });

    it('should route subscription_preapproval cancelled to handleSubscriptionCancelled', async () => {
      const event = {
        event_type: 'subscription_preapproval',
        payload: {
          action: 'updated',
          data: { id: 'sub_cancelled' }
        }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_cancelled',
          status: 'cancelled'
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'ativo', telegram_id: 123456789 }
      });

      kickMemberFromGroup.mockResolvedValue({ success: true });
      markMemberAsRemoved.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'removido' }
      });

      const result = await processWebhookEvent(event);

      expect(result.success).toBe(true);
      expect(markMemberAsRemoved).toHaveBeenCalled();
    });

    it('should route subscription_preapproval expired to handleSubscriptionCancelled', async () => {
      const event = {
        event_type: 'subscription_preapproval',
        payload: {
          action: 'updated',
          data: { id: 'sub_expired' }
        }
      };

      mercadoPagoService.getSubscription.mockResolvedValue({
        success: true,
        data: {
          id: 'sub_expired',
          status: 'expired'
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-expired', status: 'ativo', telegram_id: 123456789 }
      });

      kickMemberFromGroup.mockResolvedValue({ success: true });
      markMemberAsRemoved.mockResolvedValue({
        success: true,
        data: { id: 'uuid-expired', status: 'removido' }
      });

      const result = await processWebhookEvent(event);

      expect(result.success).toBe(true);
      expect(markMemberAsRemoved).toHaveBeenCalledWith('uuid-expired', 'subscription_cancelled');
    });

    it('should route payment approved to handlePaymentApproved', async () => {
      const event = {
        event_type: 'payment',
        payload: {
          action: 'payment.created',
          data: { id: 'pay_123' }
        }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_123',
          status: 'approved',
          payer: { id: 12345, email: 'test@example.com' },
          metadata: { preapproval_id: 'sub_123' }
        }
      });

      mercadoPagoService.mapPaymentMethod.mockReturnValue('pix');

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'trial', mp_subscription_id: 'sub_123' }
      });

      activateMember.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'ativo' }
      });

      const result = await processWebhookEvent(event);

      expect(result.success).toBe(true);
      expect(activateMember).toHaveBeenCalled();
    });

    it('should route payment rejected to handlePaymentRejected', async () => {
      const event = {
        event_type: 'payment',
        payload: {
          action: 'payment.updated',
          data: { id: 'pay_rejected' }
        }
      };

      mercadoPagoService.getPayment.mockResolvedValue({
        success: true,
        data: {
          id: 'pay_rejected',
          status: 'rejected',
          payer: { email: 'test@example.com' },
          metadata: { preapproval_id: 'sub_123' }
        }
      });

      getMemberBySubscription.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'ativo' }
      });

      markMemberAsDefaulted.mockResolvedValue({
        success: true,
        data: { id: 'uuid-1', status: 'inadimplente' }
      });

      const result = await processWebhookEvent(event);

      expect(result.success).toBe(true);
      expect(markMemberAsDefaulted).toHaveBeenCalled();
    });

    it('should skip unhandled event types', async () => {
      const event = {
        event_type: 'merchant_order',
        payload: {
          data: { id: 'order_123' }
        }
      };

      const result = await processWebhookEvent(event);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('unhandled_event_type');
    });
  });
});

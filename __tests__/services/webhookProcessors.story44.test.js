/**
 * Tests for webhookProcessors.js - Story 4.4: Acesso Instantâneo Pós-Pagamento
 * Validates DM confirmation, re-add logic, unban, and silent failure handling.
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
  sendReactivationNotification: jest.fn().mockResolvedValue({ success: true, data: { messageId: 123, inviteLink: 'https://t.me/+abc' } }),
  sendPrivateMessage: jest.fn(),
  formatFarewellMessage: jest.fn().mockReturnValue('Mensagem de despedida'),
  sendPaymentRejectedNotification: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock memberEvents (sendPaymentConfirmation)
jest.mock('../../bot/handlers/memberEvents', () => ({
  sendPaymentConfirmation: jest.fn().mockResolvedValue({ success: true, data: { messageId: 456 } }),
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
const mockBot = {
  sendMessage: jest.fn().mockResolvedValue(true),
  getChatMember: jest.fn(),
  unbanChatMember: jest.fn().mockResolvedValue(true),
};
jest.mock('../../bot/telegram', () => ({
  getBot: jest.fn().mockReturnValue(mockBot),
}));

const mercadoPagoService = require('../../bot/services/mercadoPagoService');
const memberService = require('../../bot/services/memberService');
const { sendPaymentConfirmation } = require('../../bot/handlers/memberEvents');
const notificationService = require('../../bot/services/notificationService');
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');

// Must require after mocks
const {
  handlePaymentApproved,
} = require('../../bot/services/webhookProcessors');

// ============================================
// Test Data Factories
// ============================================

const mockGroup = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Grupo Premium',
  status: 'active',
  mp_plan_id: 'plan_xyz',
  telegram_group_id: '-1005555555555',
  telegram_admin_group_id: '-1006666666666',
  checkout_url: 'https://mp.com/checkout/grupo-premium',
};

const mockPayment = {
  id: 888,
  status: 'approved',
  payer: { email: 'user@example.com', id: 12345 },
  transaction_amount: 50.00,
  payment_method_id: 'credit_card',
  point_of_interaction: {
    transaction_data: {
      subscription_id: 'sub_abc123',
    },
  },
};

const subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const mockTrialMember = {
  id: 1,
  email: 'user@example.com',
  status: 'trial',
  telegram_id: '999888777',
  group_id: '11111111-1111-1111-1111-111111111111',
  mp_subscription_id: 'sub_abc123',
};

const mockActiveMember = {
  ...mockTrialMember,
  status: 'ativo',
  subscription_ends_at: subscriptionEndsAt,
};

const mockDefaultedMember = {
  ...mockTrialMember,
  status: 'inadimplente',
};

const mockRemovedMember = {
  ...mockTrialMember,
  status: 'removido',
  kicked_at: new Date().toISOString(),
};

// ============================================
// Helper: Setup group resolution mock
// ============================================
function setupGroupResolution(group = mockGroup) {
  supabase.from.mockImplementation((table) => {
    if (table === 'groups') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: group, error: null }),
            }),
            single: jest.fn().mockResolvedValue({ data: group, error: null }),
          }),
        }),
      };
    }
    if (table === 'webhook_events') {
      return {
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    }
    return {};
  });
}

// ============================================
// AC1: DM de confirmação de pagamento
// ============================================

describe('Story 4.4: AC1 - DM de confirmação de pagamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should send DM confirmation after trial → ativo conversion', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-1' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('activated');
    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '999888777',
      1,
      subscriptionEndsAt,
      'Grupo Premium'
    );
  });

  it('should send DM confirmation after renewal', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember },
    });
    memberService.renewMemberSubscription.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-2' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('renewed');
    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '999888777',
      1,
      subscriptionEndsAt,
      'Grupo Premium'
    );
  });

  it('should send DM confirmation after inadimplente → ativo recovery', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockDefaultedMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-3' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('recovered');
    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '999888777',
      1,
      subscriptionEndsAt,
      'Grupo Premium'
    );
  });
});

// ============================================
// AC2: Acesso em < 30 segundos
// ============================================

describe('Story 4.4: AC2 - DM enviada na mesma execução do handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should send DM in same handler execution (no separate job)', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-sync' },
      mockPayment
    );

    // sendPaymentConfirmation is called directly in handler, not deferred
    expect(sendPaymentConfirmation).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// AC3: Re-adição de membro removido (kick)
// ============================================

describe('Story 4.4: AC3 - Re-adição de membro removido', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should unban + send reactivation notification when member NOT in group', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockRemovedMember },
    });
    memberService.reactivateRemovedMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    // getChatMember returns "kicked" status
    mockBot.getChatMember.mockResolvedValue({ status: 'kicked' });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-4' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('reactivated');

    // Should unban using group.telegram_group_id (multi-tenant)
    expect(mockBot.unbanChatMember).toHaveBeenCalledWith(
      '-1005555555555', // group.telegram_group_id
      '999888777',
      { only_if_banned: true }
    );

    // Should send reactivation notification with invite link
    expect(notificationService.sendReactivationNotification).toHaveBeenCalledWith(
      '999888777',
      1,
      '-1005555555555'
    );

    // Should NOT send payment confirmation (reactivation notification is sent instead)
    expect(sendPaymentConfirmation).not.toHaveBeenCalled();
  });

  it('should use group.telegram_group_id for getChatMember (multi-tenant)', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockRemovedMember },
    });
    memberService.reactivateRemovedMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    mockBot.getChatMember.mockResolvedValue({ status: 'left' });

    await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-mt' },
      mockPayment
    );

    expect(mockBot.getChatMember).toHaveBeenCalledWith(
      '-1005555555555', // group.telegram_group_id, NOT config
      '999888777'
    );
  });
});

// ============================================
// AC4: Membro ainda no grupo — apenas atualiza status
// ============================================

describe('Story 4.4: AC4 - Membro ainda no grupo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should send DM confirmation (not reactivation) when removed member is still in group', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockRemovedMember },
    });
    memberService.reactivateRemovedMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    // getChatMember returns "member" — still in group
    mockBot.getChatMember.mockResolvedValue({ status: 'member' });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-5' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('reactivated');

    // Should send payment confirmation (not reactivation)
    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '999888777',
      1,
      subscriptionEndsAt,
      'Grupo Premium'
    );

    // Should NOT unban or send reactivation notification
    expect(mockBot.unbanChatMember).not.toHaveBeenCalled();
    expect(notificationService.sendReactivationNotification).not.toHaveBeenCalled();
  });
});

// ============================================
// AC5: Renovação estende paid_until
// ============================================

describe('Story 4.4: AC5 - Renovação estende paid_until', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should send DM with new subscription_ends_at after renewal', async () => {
    const newEndsAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // +60 days

    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember },
    });
    memberService.renewMemberSubscription.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: newEndsAt },
    });

    await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-6' },
      mockPayment
    );

    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '999888777',
      1,
      newEndsAt,
      'Grupo Premium'
    );
  });
});

// ============================================
// AC6: Recuperação de inadimplente
// ============================================

describe('Story 4.4: AC6 - Recuperação de inadimplente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should activate and send DM when inadimplente pays', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockDefaultedMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-7' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('recovered');
    expect(memberService.activateMember).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ subscriptionId: 'sub_abc123' })
    );
    expect(sendPaymentConfirmation).toHaveBeenCalled();
  });
});

// ============================================
// Error Handling: Silent DM failures
// ============================================

describe('Story 4.4: Silent DM failure handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('should continue webhook processing when USER_BLOCKED_BOT (DM fails)', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    // sendPaymentConfirmation throws (user blocked bot)
    sendPaymentConfirmation.mockRejectedValueOnce(new Error('USER_BLOCKED_BOT'));

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-blocked' },
      mockPayment
    );

    // Webhook should still succeed
    expect(result.success).toBe(true);
    expect(result.data.action).toBe('activated');
    expect(logger.warn).toHaveBeenCalledWith(
      '[webhook:payment] Falha ao enviar DM de confirmação',
      expect.objectContaining({ memberId: 1, telegramId: '999888777' })
    );
  });

  it('should continue when getChatMember fails (assume not in group)', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockRemovedMember },
    });
    memberService.reactivateRemovedMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    // getChatMember fails
    mockBot.getChatMember.mockRejectedValue(new Error('Request failed'));

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-check-fail' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('reactivated');
    // Should assume not in group → try unban
    expect(mockBot.unbanChatMember).toHaveBeenCalled();
    expect(notificationService.sendReactivationNotification).toHaveBeenCalled();
  });

  it('should continue when unbanChatMember fails', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockRemovedMember },
    });
    memberService.reactivateRemovedMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    mockBot.getChatMember.mockResolvedValue({ status: 'kicked' });
    mockBot.unbanChatMember.mockRejectedValue(new Error('Bad Request: not enough rights'));

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-unban-fail' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('reactivated');
    // Should log warning and continue
    expect(logger.warn).toHaveBeenCalledWith(
      '[webhook:payment] Failed to unban user (may not be banned)',
      expect.objectContaining({ memberId: 1 })
    );
    // Should still try to send reactivation notification
    expect(notificationService.sendReactivationNotification).toHaveBeenCalled();
  });

  it('should not break webhook when admin notification still works after DM failure', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    sendPaymentConfirmation.mockRejectedValueOnce(new Error('Telegram error'));

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-dm-fail' },
      mockPayment
    );

    expect(result.success).toBe(true);
    // Admin notification should still be sent
    expect(mockBot.sendMessage).toHaveBeenCalled();
  });
});

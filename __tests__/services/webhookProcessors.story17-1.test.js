/**
 * Tests for webhookProcessors.js - Story 17-1: Ativacao de Membro WhatsApp via Webhook de Pagamento
 * Validates multi-channel DM routing: WhatsApp confirmation DMs, invite links, and Telegram retrocompatibility.
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
  sendReactivationNotification: jest.fn().mockResolvedValue({ success: true }),
  sendPrivateMessage: jest.fn(),
  formatFarewellMessage: jest.fn().mockReturnValue('Mensagem de despedida'),
  sendPaymentRejectedNotification: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock memberEvents (sendPaymentConfirmation)
jest.mock('../../bot/handlers/memberEvents', () => ({
  sendPaymentConfirmation: jest.fn().mockResolvedValue({ success: true, data: { messageId: 456 } }),
}));

// Mock channelAdapter (sendDM for WhatsApp)
const mockChannelSendDM = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../lib/channelAdapter', () => ({
  sendDM: mockChannelSendDM,
}));

// Mock inviteLinkService
const mockGenerateInviteLink = jest.fn().mockResolvedValue({
  success: true,
  data: { inviteLink: 'https://chat.whatsapp.com/test-invite-123' },
});
jest.mock('../../whatsapp/services/inviteLinkService', () => ({
  generateInviteLink: mockGenerateInviteLink,
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
  getDefaultBotCtx: jest.fn().mockReturnValue({
    publicGroupId: '-1001234567890',
    adminGroupId: '-1009999999999',
  }),
}));

const mercadoPagoService = require('../../bot/services/mercadoPagoService');
const memberService = require('../../bot/services/memberService');
const { sendPaymentConfirmation } = require('../../bot/handlers/memberEvents');
const { supabase } = require('../../lib/supabase');

// Must require after mocks
const { handlePaymentApproved } = require('../../bot/services/webhookProcessors');

// ============================================
// Test Data Factories
// ============================================

const GROUP_ID = '11111111-1111-1111-1111-111111111111';

const mockGroupTelegramOnly = {
  id: GROUP_ID,
  name: 'Grupo Premium',
  status: 'active',
  mp_plan_id: 'plan_xyz',
  telegram_group_id: '-1005555555555',
  telegram_admin_group_id: '-1006666666666',
  whatsapp_group_jid: null,
};

const mockGroupWithWhatsApp = {
  ...mockGroupTelegramOnly,
  whatsapp_group_jid: '120363xxx@g.us',
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

const mockTelegramTrialMember = {
  id: 1,
  email: 'user@example.com',
  status: 'trial',
  telegram_id: '999888777',
  channel: 'telegram',
  channel_user_id: null,
  group_id: GROUP_ID,
  mp_subscription_id: 'sub_abc123',
};

const mockWhatsAppTrialMember = {
  id: 2,
  email: null,
  status: 'trial',
  telegram_id: null,
  channel: 'whatsapp',
  channel_user_id: '+5511999887766',
  group_id: GROUP_ID,
  mp_subscription_id: 'sub_abc123',
};

const mockWhatsAppActiveMember = {
  ...mockWhatsAppTrialMember,
  status: 'ativo',
  subscription_ends_at: subscriptionEndsAt,
};

const mockWhatsAppDefaultedMember = {
  ...mockWhatsAppTrialMember,
  status: 'inadimplente',
};

const mockTelegramActiveMember = {
  ...mockTelegramTrialMember,
  status: 'ativo',
  subscription_ends_at: subscriptionEndsAt,
};

// ============================================
// Helper: Setup group resolution mock
// ============================================
function setupGroupResolution(group) {
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
// AC1: WhatsApp trial → active sends WhatsApp DM
// ============================================

describe('Story 17-1: AC1 - Trial to active multi-channel DMs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('sends WhatsApp confirmation DM for WhatsApp trial member', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppActiveMember },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-1' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('activated');
    // Should send WhatsApp DM via channelAdapter
    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('Parabens'),
      expect.objectContaining({ channel: 'whatsapp' })
    );
    // Should NOT send Telegram DM
    expect(sendPaymentConfirmation).not.toHaveBeenCalled();
  });

  it('sends Telegram DM for Telegram trial member (retrocompatibility)', async () => {
    setupGroupResolution(mockGroupTelegramOnly);
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTelegramTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockTelegramActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-2' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('activated');
    // Should send Telegram DM
    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '999888777', 1, subscriptionEndsAt, 'Grupo Premium'
    );
    // Should NOT send WhatsApp DM
    expect(mockChannelSendDM).not.toHaveBeenCalled();
  });

  it('skips WhatsApp DM when WhatsApp member has no channel_user_id', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);
    const memberNoPhone = { ...mockWhatsAppTrialMember, channel_user_id: null };
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: memberNoPhone,
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...memberNoPhone, status: 'ativo' },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-3' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(mockChannelSendDM).not.toHaveBeenCalled();
    expect(sendPaymentConfirmation).not.toHaveBeenCalled();
  });
});

// ============================================
// AC2: New member creation with WhatsApp invite
// ============================================

describe('Story 17-1: AC2 - New member with WhatsApp invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('sends WhatsApp invite link via Telegram DM for new member in group with WhatsApp', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);
    // No member found by subscription or email
    memberService.getMemberBySubscription.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.getMemberByEmail.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.createTrialMemberMP.mockResolvedValue({
      success: true,
      data: { id: 99, email: 'user@example.com' },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { id: 99, telegram_id: '111222333', subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-4' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('created_active');
    // Telegram DM for payment confirmation
    expect(sendPaymentConfirmation).toHaveBeenCalledWith(
      '111222333', 99, subscriptionEndsAt, 'Grupo Premium'
    );
    // WhatsApp invite link sent via Telegram bot
    expect(mockGenerateInviteLink).toHaveBeenCalledWith(GROUP_ID);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '111222333',
      expect.stringContaining('WhatsApp'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '111222333',
      expect.stringContaining('chat.whatsapp.com/test-invite-123'),
      expect.any(Object)
    );
  });

  it('does NOT send WhatsApp invite for new member in telegram-only group', async () => {
    setupGroupResolution(mockGroupTelegramOnly);
    memberService.getMemberBySubscription.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.getMemberByEmail.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.createTrialMemberMP.mockResolvedValue({
      success: true,
      data: { id: 100, email: 'user@example.com' },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { id: 100, telegram_id: '111222333', subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-5' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('created_active');
    // Telegram DM sent
    expect(sendPaymentConfirmation).toHaveBeenCalled();
    // No WhatsApp invite
    expect(mockGenerateInviteLink).not.toHaveBeenCalled();
    // bot.sendMessage may be called for admin notification, but NOT with WhatsApp invite
    const waInviteCalls = mockBot.sendMessage.mock.calls.filter(
      ([, msg]) => typeof msg === 'string' && msg.includes('WhatsApp')
    );
    expect(waInviteCalls).toHaveLength(0);
  });

  it('does not fail if WhatsApp invite generation fails (non-blocking)', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);
    memberService.getMemberBySubscription.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.getMemberByEmail.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });
    memberService.createTrialMemberMP.mockResolvedValue({
      success: true,
      data: { id: 101, email: 'user@example.com' },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { id: 101, telegram_id: '111222333', subscription_ends_at: subscriptionEndsAt },
    });
    mockGenerateInviteLink.mockRejectedValueOnce(new Error('Session disconnected'));

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-6' },
      mockPayment
    );

    // Should still succeed — invite link failure is non-blocking
    expect(result.success).toBe(true);
    expect(result.data.action).toBe('created_active');
    // Telegram DM was sent
    expect(sendPaymentConfirmation).toHaveBeenCalled();
  });
});

// ============================================
// Renewal and recovery with WhatsApp channel
// ============================================

describe('Story 17-1: Renewal and recovery per channel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution(mockGroupWithWhatsApp);
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('sends WhatsApp DM for renewal of WhatsApp member', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppActiveMember },
    });
    memberService.renewMemberSubscription.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-7' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('renewed');
    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('renovada'),
      expect.objectContaining({ channel: 'whatsapp' })
    );
    expect(sendPaymentConfirmation).not.toHaveBeenCalled();
  });

  it('sends WhatsApp DM for inadimplente recovery of WhatsApp member', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppDefaultedMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppActiveMember },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-8' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('recovered');
    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('restaurado'),
      expect.objectContaining({ channel: 'whatsapp' })
    );
    expect(sendPaymentConfirmation).not.toHaveBeenCalled();
  });

  it('WhatsApp DM failure is non-blocking for recovery', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppDefaultedMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockWhatsAppActiveMember },
    });
    mockChannelSendDM.mockRejectedValueOnce(new Error('DM delivery failed'));

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-9' },
      mockPayment
    );

    // Should still succeed — DM failure is non-blocking
    expect(result.success).toBe(true);
    expect(result.data.action).toBe('recovered');
  });
});

// ============================================
// AC4: Retrocompatibility - Telegram-only group unchanged
// ============================================

describe('Story 17-1: AC4 - Retrocompatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroupResolution(mockGroupTelegramOnly);
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz' },
    });
  });

  it('telegram-only group trial conversion sends only Telegram DM', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTelegramTrialMember },
    });
    memberService.activateMember.mockResolvedValue({
      success: true,
      data: { ...mockTelegramActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-10' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(sendPaymentConfirmation).toHaveBeenCalled();
    expect(mockChannelSendDM).not.toHaveBeenCalled();
    expect(mockGenerateInviteLink).not.toHaveBeenCalled();
  });

  it('telegram-only group renewal sends only Telegram DM', async () => {
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTelegramActiveMember },
    });
    memberService.renewMemberSubscription.mockResolvedValue({
      success: true,
      data: { ...mockTelegramActiveMember, subscription_ends_at: subscriptionEndsAt },
    });

    const result = await handlePaymentApproved(
      { data: { id: 888 } },
      { eventId: 'evt-11' },
      mockPayment
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('renewed');
    expect(sendPaymentConfirmation).toHaveBeenCalled();
    expect(mockChannelSendDM).not.toHaveBeenCalled();
  });
});

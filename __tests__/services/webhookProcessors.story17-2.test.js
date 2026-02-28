/**
 * Tests for webhookProcessors.js - Story 17-2: Kick Automatico por Cancelamento/Inadimplencia via Webhook
 * Validates WhatsApp kick, invite revocation, farewell DM, and retrocompatibility.
 */

// Mock supabase
const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
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
const mockMarkMemberAsRemoved = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../bot/services/memberService', () => ({
  getMemberByEmail: jest.fn(),
  getMemberBySubscription: jest.fn(),
  getMemberByPayerId: jest.fn(),
  createTrialMemberMP: jest.fn(),
  updateSubscriptionData: jest.fn(),
  activateMember: jest.fn(),
  renewMemberSubscription: jest.fn(),
  markMemberAsDefaulted: jest.fn(),
  markMemberAsRemoved: mockMarkMemberAsRemoved,
  reactivateRemovedMember: jest.fn(),
  kickMemberFromGroup: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock notificationService
jest.mock('../../bot/services/notificationService', () => ({
  sendReactivationNotification: jest.fn().mockResolvedValue({ success: true }),
  sendPrivateMessage: jest.fn().mockResolvedValue({ success: true }),
  formatFarewellMessage: jest.fn().mockReturnValue('Farewell message'),
  sendPaymentRejectedNotification: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock memberEvents
jest.mock('../../bot/handlers/memberEvents', () => ({
  sendPaymentConfirmation: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock channelAdapter
const mockChannelSendDM = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../lib/channelAdapter', () => ({
  sendDM: mockChannelSendDM,
}));

// Mock inviteLinkService
const mockRevokeInviteLink = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../whatsapp/services/inviteLinkService', () => ({
  generateInviteLink: jest.fn().mockResolvedValue({ success: true, data: { inviteLink: 'https://chat.whatsapp.com/test' } }),
  revokeInviteLink: mockRevokeInviteLink,
}));

// Mock whatsappSender
const mockRemoveGroupParticipant = jest.fn().mockResolvedValue({ success: true });
const mockActiveClient = { removeGroupParticipant: mockRemoveGroupParticipant };
const mockGetActiveClientForGroup = jest.fn().mockResolvedValue({ success: true, data: { client: mockActiveClient, numberId: 'num-1' } });
jest.mock('../../whatsapp/services/whatsappSender', () => ({
  getActiveClientForGroup: mockGetActiveClientForGroup,
  sendToGroup: jest.fn(),
  sendMediaToGroup: jest.fn(),
  sendDM: jest.fn(),
}));

// Mock phoneUtils
jest.mock('../../lib/phoneUtils', () => ({
  phoneToJid: jest.fn((phone) => `${phone.replace('+', '')}@s.whatsapp.net`),
  jidToPhone: jest.fn(),
  validateE164: jest.fn(),
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

// Must require after mocks
const { handleSubscriptionCancelled } = require('../../bot/services/webhookProcessors');

// ============================================
// Test Data
// ============================================

const GROUP_ID = '11111111-1111-1111-1111-111111111111';

const mockGroupWithWhatsApp = {
  id: GROUP_ID,
  name: 'Grupo Premium',
  status: 'active',
  mp_plan_id: 'plan_xyz',
  telegram_group_id: '-1005555555555',
  telegram_admin_group_id: '-1006666666666',
  whatsapp_group_jid: '120363xxx@g.us',
  checkout_url: 'https://mp.com/checkout/grupo-premium',
};

const mockGroupTelegramOnly = {
  ...mockGroupWithWhatsApp,
  whatsapp_group_jid: null,
};

const mockTelegramMember = {
  id: 1,
  email: 'user@example.com',
  status: 'ativo',
  telegram_id: '999888777',
  channel: 'telegram',
  channel_user_id: null,
  group_id: GROUP_ID,
  mp_subscription_id: 'sub_abc123',
};

// ============================================
// Helpers
// ============================================

function setupGroupResolution(group) {
  mockFrom.mockImplementation((table) => {
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
    if (table === 'members') {
      // Return WhatsApp members query
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.neq = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) => resolve({
        data: [{ id: 42, channel_user_id: '+5511999887766', status: 'ativo' }],
        error: null,
      });
      return chain;
    }
    return {};
  });
}

function setupGroupResolutionNoWaMembers(group) {
  mockFrom.mockImplementation((table) => {
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
    if (table === 'members') {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.neq = jest.fn().mockReturnValue(chain);
      chain.then = (resolve) => resolve({ data: [], error: null });
      return chain;
    }
    return {};
  });
}

// ============================================
// Tests
// ============================================

describe('Story 17-2: WhatsApp kick on subscription cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: { preapproval_plan_id: 'plan_xyz', id: 'sub_abc123' },
    });
    memberService.getMemberBySubscription.mockResolvedValue({
      success: true,
      data: { ...mockTelegramMember },
    });
  });

  it('kicks WhatsApp member and revokes invite on cancellation', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);

    const result = await handleSubscriptionCancelled(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('removed');
    expect(result.data.whatsappKicked).toBe(true);

    // WhatsApp farewell DM sent
    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('cancelada'),
      expect.objectContaining({ channel: 'whatsapp' })
    );

    // WhatsApp member kicked
    expect(mockGetActiveClientForGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(mockRemoveGroupParticipant).toHaveBeenCalledWith(
      '120363xxx@g.us',
      '5511999887766@s.whatsapp.net'
    );

    // Invite link revoked
    expect(mockRevokeInviteLink).toHaveBeenCalledWith(GROUP_ID);

    // WhatsApp member marked as removed
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith(42, 'subscription_cancelled');
    // Primary member also marked as removed
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith(1, 'subscription_cancelled');
  });

  it('does not kick WhatsApp for telegram-only group (AC3)', async () => {
    setupGroupResolutionNoWaMembers(mockGroupTelegramOnly);

    const result = await handleSubscriptionCancelled(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-2' }
    );

    expect(result.success).toBe(true);
    expect(result.data.action).toBe('removed');
    // No WhatsApp operations
    expect(mockChannelSendDM).not.toHaveBeenCalled();
    expect(mockGetActiveClientForGroup).not.toHaveBeenCalled();
    expect(mockRevokeInviteLink).not.toHaveBeenCalled();
  });

  it('continues if WhatsApp kick fails (non-blocking)', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);
    mockRemoveGroupParticipant.mockResolvedValueOnce({
      success: false,
      error: { code: 'NOT_CONNECTED', message: 'Client disconnected' },
    });

    const result = await handleSubscriptionCancelled(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-3' }
    );

    // Should still succeed — WhatsApp kick failure is non-blocking
    expect(result.success).toBe(true);
    expect(result.data.action).toBe('removed');
    // Invite NOT revoked since kick failed
    expect(mockRevokeInviteLink).not.toHaveBeenCalled();
    // WhatsApp member still marked as removed in DB
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith(42, 'subscription_cancelled');
  });

  it('sends farewell DM via WhatsApp with checkout URL', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);

    await handleSubscriptionCancelled(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-4' }
    );

    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('checkout/grupo-premium'),
      expect.objectContaining({ channel: 'whatsapp' })
    );
  });

  it('handles no active WhatsApp client gracefully', async () => {
    setupGroupResolution(mockGroupWithWhatsApp);
    mockGetActiveClientForGroup.mockResolvedValueOnce({
      success: false,
      error: { code: 'NO_ACTIVE_NUMBER', message: 'No active number' },
    });

    const result = await handleSubscriptionCancelled(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-5' }
    );

    expect(result.success).toBe(true);
    // Kick didn't happen, so no revoke
    expect(mockRevokeInviteLink).not.toHaveBeenCalled();
    // WhatsApp member still marked as removed
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith(42, 'subscription_cancelled');
  });

  it('skips WhatsApp processing if no WhatsApp members found in group', async () => {
    setupGroupResolutionNoWaMembers(mockGroupWithWhatsApp);

    const result = await handleSubscriptionCancelled(
      { data: { id: 'sub_abc123' } },
      { eventId: 'evt-6' }
    );

    expect(result.success).toBe(true);
    expect(mockChannelSendDM).not.toHaveBeenCalled();
    expect(mockGetActiveClientForGroup).not.toHaveBeenCalled();
  });
});

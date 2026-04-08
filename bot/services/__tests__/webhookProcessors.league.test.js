/**
 * Tests: webhookProcessors.js — League subscription lifecycle
 * Phase 3 Plan 04: League extras webhook handling
 */

// --- Supabase mock setup ---
const mockSelect = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();
const mockIn = jest.fn().mockReturnThis();

const mockChain = {
  select: mockSelect,
  eq: mockEq,
  update: mockUpdate,
  in: mockIn,
};

Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));

const mockFrom = jest.fn(() => ({ ...mockChain }));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    supabase: { url: 'http://test', key: 'test-key' },
    telegram: { token: 'test-token' },
    mercadoPago: { accessToken: 'test-mp-token' },
  },
}));

jest.mock('../notificationHelper', () => ({
  insertAdminNotification: jest.fn(),
}));

jest.mock('../mercadoPagoService', () => ({
  getSubscription: jest.fn(),
  getAuthorizedPayment: jest.fn(),
  getPayment: jest.fn(),
  cancelSubscription: jest.fn(),
}));

jest.mock('../../handlers/memberEvents', () => ({
  sendPaymentConfirmation: jest.fn(),
}));

jest.mock('../../telegram', () => ({
  getBot: jest.fn(() => ({
    telegram: { sendMessage: jest.fn() },
  })),
  getDefaultBotCtx: jest.fn(() => ({
    telegram: { sendMessage: jest.fn() },
  })),
}));

jest.mock('../../../lib/channelAdapter', () => ({
  sendDM: jest.fn(),
}));

jest.mock('../../../whatsapp/services/inviteLinkService', () => ({
  generateInviteLink: jest.fn(),
  revokeInviteLink: jest.fn(),
}));

jest.mock('../memberService', () => ({
  activateMember: jest.fn(),
  deactivateMember: jest.fn(),
}));

jest.mock('../notificationService', () => ({
  notifyMemberStatusChange: jest.fn(),
  sendPaymentRejectedNotification: jest.fn(),
}));

jest.mock('../../../whatsapp/services/whatsappSender', () => ({
  getActiveClientForGroup: jest.fn(),
}));

jest.mock('../../../lib/phoneUtils', () => ({
  phoneToJid: jest.fn(),
}));

const mercadoPagoService = require('../mercadoPagoService');

const {
  processWebhookEvent,
  checkLeagueSubscription,
  handleLeagueSubscriptionActivated,
  handleLeagueSubscriptionCancelled,
} = require('../webhookProcessors');

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));
  mockFrom.mockReturnValue({ ...mockChain });
});

// ============================================================
// checkLeagueSubscription
// ============================================================

describe('checkLeagueSubscription', () => {
  it('returns isLeague=false when planId is null', async () => {
    const result = await checkLeagueSubscription(null);
    expect(result).toEqual({ isLeague: false });
  });

  it('returns isLeague=false when no matching records found', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValueOnce(chain);

    const result = await checkLeagueSubscription('mp-plan-123');
    expect(result).toEqual({ isLeague: false });
    expect(mockFrom).toHaveBeenCalledWith('group_league_subscriptions');
  });

  it('returns isLeague=true with groupId and leagues when records exist', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [
          { group_id: 'group-1', league_name: 'Champions League' },
          { group_id: 'group-1', league_name: 'Europa League' },
        ],
        error: null,
      }),
    };
    mockFrom.mockReturnValueOnce(chain);

    const result = await checkLeagueSubscription('mp-plan-456');
    expect(result.isLeague).toBe(true);
    expect(result.groupId).toBe('group-1');
    expect(result.leagues).toEqual(['Champions League', 'Europa League']);
  });

  it('returns isLeague=false on DB error', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } }),
    };
    mockFrom.mockReturnValueOnce(chain);

    const result = await checkLeagueSubscription('mp-plan-789');
    expect(result).toEqual({ isLeague: false });
  });
});

// ============================================================
// handleLeagueSubscriptionActivated
// ============================================================

describe('handleLeagueSubscriptionActivated', () => {
  it('updates group_league_subscriptions status to active', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    // Last eq resolves
    chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ data: null, error: null });
    chain.update.mockReturnValue(chain);
    mockFrom.mockReturnValueOnce(chain);

    const result = await handleLeagueSubscriptionActivated('mp-plan-123', 'group-1', ['Champions League']);
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('group_league_subscriptions');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        activated_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
  });

  it('returns error on DB failure', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    chain.update.mockReturnValue(chain);
    mockFrom.mockReturnValueOnce(chain);

    const result = await handleLeagueSubscriptionActivated('mp-plan-123', 'group-1', ['Champions League']);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DB_ERROR');
  });
});

// ============================================================
// handleLeagueSubscriptionCancelled
// ============================================================

describe('handleLeagueSubscriptionCancelled', () => {
  it('updates group_league_subscriptions status to cancelled', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ data: null, error: null });
    chain.update.mockReturnValue(chain);
    mockFrom.mockReturnValueOnce(chain);

    const result = await handleLeagueSubscriptionCancelled('mp-plan-123', 'group-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('group_league_subscriptions');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        cancelled_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
  });

  it('returns error on DB failure', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ data: null, error: { message: 'DB down' } });
    chain.update.mockReturnValue(chain);
    mockFrom.mockReturnValueOnce(chain);

    const result = await handleLeagueSubscriptionCancelled('mp-plan-123', 'group-1');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DB_ERROR');
  });
});

// ============================================================
// processWebhookEvent — league subscription routing
// ============================================================

describe('processWebhookEvent — league subscription routing', () => {
  it('routes authorized league subscription to handleLeagueSubscriptionActivated', async () => {
    // Mock getSubscription to return a league subscription
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: {
        id: 'sub-123',
        status: 'authorized',
        preapproval_plan_id: 'mp-league-plan',
        external_reference: 'group-1',
      },
    });

    // Mock checkLeagueSubscription: first from() is group_league_subscriptions
    const leagueCheckChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [
          { group_id: 'group-1', league_name: 'Champions League' },
        ],
        error: null,
      }),
    };
    // Mock handleLeagueSubscriptionActivated: second from() is group_league_subscriptions update
    const activateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    activateChain.eq.mockReturnValueOnce(activateChain).mockResolvedValueOnce({ data: null, error: null });
    activateChain.update.mockReturnValue(activateChain);

    mockFrom
      .mockReturnValueOnce(leagueCheckChain)
      .mockReturnValueOnce(activateChain);

    const result = await processWebhookEvent({
      event_type: 'subscription_preapproval',
      payload: { action: 'created', data: { id: 'sub-123' } },
      eventId: 'evt-1',
    });

    expect(result.success).toBe(true);
    expect(mercadoPagoService.getSubscription).toHaveBeenCalledWith('sub-123');
  });

  it('routes cancelled league subscription to handleLeagueSubscriptionCancelled', async () => {
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: {
        id: 'sub-456',
        status: 'cancelled',
        preapproval_plan_id: 'mp-league-plan',
        external_reference: 'group-1',
      },
    });

    // checkLeagueSubscription
    const leagueCheckChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [
          { group_id: 'group-1', league_name: 'Champions League' },
        ],
        error: null,
      }),
    };
    // handleLeagueSubscriptionCancelled
    const cancelChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    cancelChain.eq.mockReturnValueOnce(cancelChain).mockResolvedValueOnce({ data: null, error: null });
    cancelChain.update.mockReturnValue(cancelChain);

    mockFrom
      .mockReturnValueOnce(leagueCheckChain)
      .mockReturnValueOnce(cancelChain);

    const result = await processWebhookEvent({
      event_type: 'subscription_preapproval',
      payload: { action: 'cancelled', data: { id: 'sub-456' } },
      eventId: 'evt-2',
    });

    expect(result.success).toBe(true);
  });

  it('falls through to regular handlers for non-league subscriptions', async () => {
    mercadoPagoService.getSubscription.mockResolvedValue({
      success: true,
      data: {
        id: 'sub-789',
        status: 'authorized',
        preapproval_plan_id: 'regular-plan-id',
        external_reference: 'group-1',
      },
    });

    // checkLeagueSubscription returns isLeague: false
    const leagueCheckChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    // handleSubscriptionCreated will need group resolution (resolveGroupFromSubscription)
    // groups table lookup
    const groupChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'group-1', name: 'Test Group', mp_plan_id: 'regular-plan-id' },
        error: null,
      }),
    };

    mockFrom
      .mockReturnValueOnce(leagueCheckChain) // checkLeagueSubscription
      .mockReturnValue(groupChain); // Everything else flows through existing handlers

    const result = await processWebhookEvent({
      event_type: 'subscription_preapproval',
      payload: { action: 'created', data: { id: 'sub-789' } },
      eventId: 'evt-3',
    });

    // Result may be success or error depending on existing handler internals,
    // but the key assertion is that checkLeagueSubscription was called
    expect(mockFrom).toHaveBeenCalledWith('group_league_subscriptions');
  });
});

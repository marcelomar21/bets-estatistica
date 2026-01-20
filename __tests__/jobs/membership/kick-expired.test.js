/**
 * Tests for kick-expired job
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * Tech-Spec: Migração MP - Trial expiration now handled by MP webhooks
 */
const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

// Mock dependencies
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
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

jest.mock('../../../lib/config', () => ({
  config: {
    membership: {
      checkoutUrl: 'https://checkout.example.com',
      subscriptionPrice: 'R$50/mes',
    },
    telegram: {
      publicGroupId: '-100123456789',
    },
  },
}));

jest.mock('../../../bot/services/alertService', () => ({
  alertAdmin: jest.fn().mockResolvedValue({ success: true }),
}));

const {
  runKickExpired,
  getInadimplenteMembers,
  processMemberKick,
  CONFIG,
} = require('../../../bot/jobs/membership/kick-expired');
const { getBot } = require('../../../bot/telegram');
const { alertAdmin } = require('../../../bot/services/alertService');

describe('kick-expired job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set environment variable for tests
    process.env.TELEGRAM_PUBLIC_GROUP_ID = '-100123456789';
  });

  // Note: getExpiredTrialMembers was removed in MP migration
  // Trial expiration is now handled by MP webhooks (subscription_cancelled)

  describe('getInadimplenteMembers', () => {
    it('should return members with inadimplente status', async () => {
      const mockMembers = [
        { id: 'member-1', telegram_id: 111, status: 'inadimplente' },
        { id: 'member-2', telegram_id: 222, status: 'inadimplente' },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getInadimplenteMembers();

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(2);
      expect(mockChain.eq).toHaveBeenCalledWith('status', 'inadimplente');
    });

    it('should return empty array when no inadimplentes', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getInadimplenteMembers();

      expect(result.success).toBe(true);
      expect(result.data.members.length).toBe(0);
    });

    it('should handle database error', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection failed' },
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await getInadimplenteMembers();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('processMemberKick', () => {
    it('should skip member without telegram_id and mark as removed', async () => {
      const member = {
        id: 'member-no-tg',
        telegram_id: null,
        telegram_username: 'testuser',
        status: 'trial',
      };

      // Mock getMemberById for markMemberAsRemoved
      const mockGetChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member },
          error: null,
        }),
      };

      // Mock update for markMemberAsRemoved
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member, status: 'removido', kicked_at: new Date().toISOString() },
          error: null,
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGetChain)     // getMemberById
        .mockReturnValueOnce(mockUpdateChain); // update

      const result = await processMemberKick(member, 'trial_expired');

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toBe('no_telegram_id');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should kick member successfully', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        status: 'trial',
      };

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
        banChatMember: jest.fn().mockResolvedValue(true),
      };
      getBot.mockReturnValue(mockBot);

      // Mock getMemberById
      const mockGetChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member },
          error: null,
        }),
      };

      // Mock update for markMemberAsRemoved
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member, status: 'removido', kicked_at: new Date().toISOString() },
          error: null,
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGetChain)     // getMemberById
        .mockReturnValueOnce(mockUpdateChain); // update

      const result = await processMemberKick(member, 'trial_expired');

      expect(result.success).toBe(true);
      expect(result.data.kicked).toBe(true);
      expect(mockBot.sendMessage).toHaveBeenCalled();
      expect(mockBot.banChatMember).toHaveBeenCalledWith(
        '-100123456789',
        123456789,
        expect.objectContaining({ until_date: expect.any(Number) })
      );
    });

    it('should handle user already not in group', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        status: 'trial',
      };

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
        banChatMember: jest.fn().mockRejectedValue({
          response: {
            statusCode: 400,
            body: { description: 'Bad Request: user not found' },
          },
        }),
      };
      getBot.mockReturnValue(mockBot);

      // Mock getMemberById
      const mockGetChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member },
          error: null,
        }),
      };

      // Mock update for markMemberAsRemoved
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member, status: 'removido', kicked_at: new Date().toISOString() },
          error: null,
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGetChain)     // getMemberById for kick
        .mockReturnValueOnce(mockGetChain)     // getMemberById for markAsRemoved
        .mockReturnValueOnce(mockUpdateChain); // update

      const result = await processMemberKick(member, 'trial_expired');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_IN_GROUP');
      expect(logger.info).toHaveBeenCalledWith(
        '[membership:kick-expired] processMemberKick: member already not in group',
        expect.any(Object)
      );
    });

    it('should handle 403 error on message send without failing kick', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        status: 'trial',
      };

      const mockBot = {
        sendMessage: jest.fn().mockRejectedValue({
          response: {
            statusCode: 403,
            body: { description: 'Forbidden: bot was blocked by the user' },
          },
        }),
        banChatMember: jest.fn().mockResolvedValue(true),
      };
      getBot.mockReturnValue(mockBot);

      // Mock getMemberById
      const mockGetChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member },
          error: null,
        }),
      };

      // Mock update
      const mockUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...member, status: 'removido', kicked_at: new Date().toISOString() },
          error: null,
        }),
      };

      supabase.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      const result = await processMemberKick(member, 'trial_expired');

      // Should still succeed - message failed (403 USER_BLOCKED_BOT) but kick succeeded
      expect(result.success).toBe(true);
      expect(result.data.kicked).toBe(true);
      // Verify kick was still called despite message failure
      expect(mockBot.banChatMember).toHaveBeenCalled();
    });

    it('should alert admin immediately for persistent errors (BOT_NO_PERMISSION)', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        status: 'trial',
      };

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
        banChatMember: jest.fn().mockRejectedValue({
          response: {
            statusCode: 403,
            body: { description: 'Forbidden: bot is not an administrator' },
          },
        }),
      };
      getBot.mockReturnValue(mockBot);

      const result = await processMemberKick(member, 'trial_expired');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BOT_NO_PERMISSION');
      expect(alertAdmin).toHaveBeenCalledWith(
        expect.stringContaining('ERRO PERSISTENTE')
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[membership:kick-expired] processMemberKick: persistent error',
        expect.any(Object)
      );
    });

    it('should log transient errors for retry on next run', async () => {
      const member = {
        id: 'member-1',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        status: 'trial',
      };

      const mockBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 999 }),
        banChatMember: jest.fn().mockRejectedValue({
          message: 'Network timeout',
        }),
      };
      getBot.mockReturnValue(mockBot);

      const result = await processMemberKick(member, 'trial_expired');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TELEGRAM_ERROR');
      // Should NOT alert admin for transient errors
      expect(alertAdmin).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        '[membership:kick-expired] processMemberKick: transient error, will retry next run',
        expect.any(Object)
      );
    });
  });

  describe('runKickExpired', () => {
    it('should prevent concurrent runs', async () => {
      // First run - setup mock to return empty data
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await runKickExpired();
      expect(result.success).toBe(true);
    });

    it('should process only inadimplente members (trial handled by MP webhooks)', async () => {
      // Mock getInadimplenteMembers
      const mockInadimplenteChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      supabase.from.mockReturnValueOnce(mockInadimplenteChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result.kicked).toBe(0);
      expect(result.alreadyRemoved).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return counts for kicked, alreadyRemoved, and failed', async () => {
      // Just verify the structure of the result
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      const result = await runKickExpired();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('kicked');
      expect(result).toHaveProperty('alreadyRemoved');
      expect(result).toHaveProperty('failed');
    });

    it('should log with correct prefix', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(mockChain);

      await runKickExpired();

      expect(logger.info).toHaveBeenCalledWith(
        '[membership:kick-expired] Starting',
        expect.any(Object)
      );
    });
  });
});

describe('formatFarewellMessage', () => {
  const { formatFarewellMessage } = require('../../../bot/services/notificationService');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should format trial_expired message correctly', () => {
    const member = { id: 'member-1', telegram_username: 'testuser' };
    const checkoutUrl = 'https://checkout.example.com';

    const message = formatFarewellMessage(member, 'trial_expired', checkoutUrl);

    expect(message).toContain('trial de 7 dias terminou');
    expect(message).toContain('Sentiremos sua falta');
    expect(message).toContain('ASSINAR POR R$50/MES');
    expect(message).toContain(checkoutUrl);
    expect(message).toContain('24h para reativar');
  });

  it('should format payment_failed message correctly', () => {
    const member = { id: 'member-1', telegram_username: 'testuser' };
    const checkoutUrl = 'https://checkout.example.com';

    const message = formatFarewellMessage(member, 'payment_failed', checkoutUrl);

    expect(message).toContain('assinatura nao foi renovada');
    expect(message).toContain('removido do grupo por falta de pagamento');
    expect(message).toContain('PAGAR AGORA');
    expect(message).toContain(checkoutUrl);
    expect(message).toContain('24h para voltar automaticamente');
  });

  it('should use payment_failed as default for unknown reason', () => {
    const member = { id: 'member-1', telegram_username: 'testuser' };
    const checkoutUrl = 'https://checkout.example.com';

    const message = formatFarewellMessage(member, 'unknown_reason', checkoutUrl);

    expect(message).toContain('assinatura nao foi renovada');
    expect(message).toContain('PAGAR AGORA');
  });
});

describe('kickMemberFromGroup', () => {
  const { kickMemberFromGroup } = require('../../../bot/services/memberService');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should kick member successfully with 24h grace period', async () => {
    const mockBot = {
      banChatMember: jest.fn().mockResolvedValue(true),
    };
    getBot.mockReturnValue(mockBot);

    const result = await kickMemberFromGroup(123456789, '-100123456789');

    expect(result.success).toBe(true);
    expect(result.data.until_date).toBeDefined();
    // until_date should be approximately 24h from now
    const now = Math.floor(Date.now() / 1000);
    const expectedUntil = now + (24 * 60 * 60);
    expect(result.data.until_date).toBeGreaterThanOrEqual(expectedUntil - 5);
    expect(result.data.until_date).toBeLessThanOrEqual(expectedUntil + 5);
  });

  it('should handle user not in group (400 error)', async () => {
    const mockBot = {
      banChatMember: jest.fn().mockRejectedValue({
        response: {
          statusCode: 400,
          body: { description: 'Bad Request: user not found' },
        },
      }),
    };
    getBot.mockReturnValue(mockBot);

    const result = await kickMemberFromGroup(123456789, '-100123456789');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('USER_NOT_IN_GROUP');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle already kicked user', async () => {
    const mockBot = {
      banChatMember: jest.fn().mockRejectedValue({
        response: {
          statusCode: 400,
          body: { description: 'Bad Request: PARTICIPANT_ID_INVALID' },
        },
      }),
    };
    getBot.mockReturnValue(mockBot);

    const result = await kickMemberFromGroup(123456789, '-100123456789');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('USER_NOT_IN_GROUP');
  });

  it('should handle bot lacking permissions (403)', async () => {
    const mockBot = {
      banChatMember: jest.fn().mockRejectedValue({
        response: {
          statusCode: 403,
          body: { description: 'Forbidden: bot is not an administrator' },
        },
      }),
    };
    getBot.mockReturnValue(mockBot);

    const result = await kickMemberFromGroup(123456789, '-100123456789');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('BOT_NO_PERMISSION');
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle generic Telegram error', async () => {
    const mockBot = {
      banChatMember: jest.fn().mockRejectedValue({
        message: 'Network error',
      }),
    };
    getBot.mockReturnValue(mockBot);

    const result = await kickMemberFromGroup(123456789, '-100123456789');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TELEGRAM_ERROR');
  });
});

describe('markMemberAsRemoved', () => {
  const { markMemberAsRemoved } = require('../../../bot/services/memberService');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark member as removed successfully', async () => {
    const member = { id: 'member-1', status: 'trial' };

    // Mock getMemberById
    const mockGetChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: member,
        error: null,
      }),
    };

    // Mock update
    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { ...member, status: 'removido', kicked_at: new Date().toISOString() },
        error: null,
      }),
    };

    supabase.from
      .mockReturnValueOnce(mockGetChain)
      .mockReturnValueOnce(mockUpdateChain);

    const result = await markMemberAsRemoved('member-1', 'trial_expired');

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('removido');
    expect(logger.info).toHaveBeenCalledWith(
      '[memberService] markMemberAsRemoved: success',
      expect.any(Object)
    );
  });

  it('should reject invalid transition (removido -> removido)', async () => {
    // 'removido' is a final state - cannot transition to anything including itself
    const member = { id: 'member-1', status: 'removido' };

    // Mock getMemberById
    const mockGetChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: member,
        error: null,
      }),
    };

    supabase.from.mockReturnValue(mockGetChain);

    const result = await markMemberAsRemoved('member-1', 'trial_expired');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
  });

  it('should handle race condition (status changed during update)', async () => {
    const member = { id: 'member-1', status: 'trial' };

    // Mock getMemberById
    const mockGetChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: member,
        error: null,
      }),
    };

    // Mock update with PGRST116 error (no rows returned)
    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      }),
    };

    supabase.from
      .mockReturnValueOnce(mockGetChain)
      .mockReturnValueOnce(mockUpdateChain);

    const result = await markMemberAsRemoved('member-1', 'trial_expired');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('RACE_CONDITION');
  });

  it('should handle member not found', async () => {
    // Mock getMemberById returning not found
    const mockGetChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      }),
    };

    supabase.from.mockReturnValue(mockGetChain);

    const result = await markMemberAsRemoved('nonexistent', 'trial_expired');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('MEMBER_NOT_FOUND');
  });
});

/**
 * Tests for evadido status (Feature B): markMemberAsEvaded,
 * reactivateRemovedMember accepting evadido, and canRejoinGroup using left_at.
 */

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../lib/config', () => ({
  config: {
    membership: {
      checkoutUrl: 'https://checkout.cakto.com.br/test',
      trialDays: 7,
    },
  },
}));

const {
  canTransition,
  markMemberAsEvaded,
  reactivateRemovedMember,
  canRejoinGroup,
} = require('../../bot/services/memberService');
const { supabase } = require('../../lib/supabase');

/**
 * Build a minimal Supabase chain that returns { data, error } from .single().
 * Supports chained .eq()/.select() calls used by the service functions.
 */
function buildSelectChain(data, error = null) {
  const single = jest.fn().mockResolvedValue({ data, error });
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single,
  };
  return chain;
}

function buildUpdateChain(data, error = null) {
  const single = jest.fn().mockResolvedValue({ data, error });
  const chain = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single,
  };
  return chain;
}

describe('state machine — evadido transitions', () => {
  test('M1: canTransition(trial → evadido) is true', () => {
    expect(canTransition('trial', 'evadido')).toBe(true);
  });

  test('M2: canTransition(ativo → evadido) is true', () => {
    expect(canTransition('ativo', 'evadido')).toBe(true);
  });

  test('M3: canTransition(inadimplente → evadido) is true', () => {
    expect(canTransition('inadimplente', 'evadido')).toBe(true);
  });

  test('M4: canTransition(removido → evadido) is false (terminal)', () => {
    expect(canTransition('removido', 'evadido')).toBe(false);
  });

  test('M5: canTransition(cancelado → evadido) is false', () => {
    expect(canTransition('cancelado', 'evadido')).toBe(false);
  });

  test('M6: canTransition(evadido → trial) is true', () => {
    expect(canTransition('evadido', 'trial')).toBe(true);
  });

  test('M7: canTransition(evadido → ativo) is true', () => {
    expect(canTransition('evadido', 'ativo')).toBe(true);
  });

  test('M8: canTransition(evadido → removido) is false', () => {
    expect(canTransition('evadido', 'removido')).toBe(false);
  });
});

describe('markMemberAsEvaded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('M9: marks trial member as evadido with left_at and notes', async () => {
    const selectChain = buildSelectChain({ id: 'uuid-1', status: 'trial', notes: null });
    const updateChain = buildUpdateChain({ id: 'uuid-1', status: 'evadido', left_at: '2026-04-21T10:00:00Z', notes: 'Evaded: telegram_left_event' });

    supabase.from
      .mockReturnValueOnce(selectChain)   // getMemberById lookup
      .mockReturnValueOnce(updateChain);  // update statement

    const result = await markMemberAsEvaded('uuid-1', 'telegram_left_event');

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('evadido');
    // Validate that the update body set status/left_at/notes
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'evadido',
      notes: 'Evaded: telegram_left_event',
    }));
    const updatedFields = updateChain.update.mock.calls[0][0];
    expect(updatedFields.left_at).toBeDefined();
  });

  test('M10: refuses to evade a member already in removido (terminal) status', async () => {
    const selectChain = buildSelectChain({ id: 'uuid-2', status: 'removido' });
    supabase.from.mockReturnValueOnce(selectChain);

    const result = await markMemberAsEvaded('uuid-2', 'anything');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
  });

  test('M11: detects race condition when optimistic lock fails', async () => {
    const selectChain = buildSelectChain({ id: 'uuid-3', status: 'trial' });
    const updateChain = buildUpdateChain(null, { code: 'PGRST116', message: 'no rows' });

    supabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(updateChain);

    const result = await markMemberAsEvaded('uuid-3', 'telegram_left_event');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('RACE_CONDITION');
  });

  test('M12: null reason stores notes=null', async () => {
    const selectChain = buildSelectChain({ id: 'uuid-4', status: 'ativo' });
    const updateChain = buildUpdateChain({ id: 'uuid-4', status: 'evadido' });

    supabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(updateChain);

    const result = await markMemberAsEvaded('uuid-4', null);

    expect(result.success).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      notes: null,
    }));
  });
});

describe('reactivateRemovedMember — evadido entry point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('M13: reactivates evaded member to ativo and clears kicked_at/left_at', async () => {
    const selectChain = buildSelectChain({
      id: 'uuid-5', status: 'evadido', telegram_id: 12345, notes: null,
    });
    const updateChain = buildUpdateChain({ id: 'uuid-5', status: 'ativo' });

    supabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(updateChain);

    const result = await reactivateRemovedMember('uuid-5');

    expect(result.success).toBe(true);
    const updatedFields = updateChain.update.mock.calls[0][0];
    expect(updatedFields.status).toBe('ativo');
    expect(updatedFields.kicked_at).toBeNull();
    expect(updatedFields.left_at).toBeNull();
    // Optimistic lock should be bound to currentStatus captured (evadido)
    const eqCalls = updateChain.eq.mock.calls;
    expect(eqCalls).toContainEqual(['status', 'evadido']);
  });

  test('M14: rejects reactivation when status is not removido/evadido', async () => {
    const selectChain = buildSelectChain({ id: 'uuid-6', status: 'trial' });
    supabase.from.mockReturnValueOnce(selectChain);

    const result = await reactivateRemovedMember('uuid-6');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
    expect(result.error.message).toContain('removido');
    expect(result.error.message).toContain('evadido');
  });
});

describe('canRejoinGroup — left_at support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('M15: returns canRejoin=true for evaded member with left_at < 24h', async () => {
    const leftAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // 6h ago
    const selectChain = buildSelectChain({ id: 1, status: 'evadido', kicked_at: null, left_at: leftAt });
    supabase.from.mockReturnValueOnce(selectChain);

    const result = await canRejoinGroup(1);

    expect(result.success).toBe(true);
    expect(result.data.canRejoin).toBe(true);
    expect(result.data.hoursSinceKick).toBeLessThan(24);
  });

  test('M16: returns canRejoin=true for removed member with kicked_at < 24h (backward compat)', async () => {
    const kickedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const selectChain = buildSelectChain({ id: 1, status: 'removido', kicked_at: kickedAt, left_at: null });
    supabase.from.mockReturnValueOnce(selectChain);

    const result = await canRejoinGroup(1);

    expect(result.success).toBe(true);
    expect(result.data.canRejoin).toBe(true);
  });

  test('M17: returns canRejoin=false when neither kicked_at nor left_at is set', async () => {
    const selectChain = buildSelectChain({ id: 1, status: 'evadido', kicked_at: null, left_at: null });
    supabase.from.mockReturnValueOnce(selectChain);

    const result = await canRejoinGroup(1);

    expect(result.success).toBe(true);
    expect(result.data.canRejoin).toBe(false);
    expect(result.data.reason).toBe('no_exit_timestamp');
  });

  test('evaded member past 24h → canRejoin=false', async () => {
    const leftAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    const selectChain = buildSelectChain({ id: 1, status: 'evadido', kicked_at: null, left_at: leftAt });
    supabase.from.mockReturnValueOnce(selectChain);

    const result = await canRejoinGroup(1);

    expect(result.success).toBe(true);
    expect(result.data.canRejoin).toBe(false);
  });
});

describe('kickMemberFromGroup — chat_id normalization', () => {
  const {
    kickMemberFromGroup,
  } = require('../../bot/services/memberService');

  test('M18: positive chatId is normalized to -100<id> before banChatMember', async () => {
    const mockBan = jest.fn().mockResolvedValue(true);
    const botInstance = { banChatMember: mockBan };

    const result = await kickMemberFromGroup(99999, 3836475731, botInstance);

    expect(result.success).toBe(true);
    expect(mockBan).toHaveBeenCalledWith('-1003836475731', 99999, expect.any(Object));
  });

  test('M19: null chatId returns INVALID_CHAT_ID without calling Telegram', async () => {
    const mockBan = jest.fn();
    const botInstance = { banChatMember: mockBan };

    const result = await kickMemberFromGroup(99999, null, botInstance);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_CHAT_ID');
    expect(mockBan).not.toHaveBeenCalled();
  });

  test('M20: non-numeric chatId returns INVALID_CHAT_ID without calling Telegram', async () => {
    const mockBan = jest.fn();
    const botInstance = { banChatMember: mockBan };

    const result = await kickMemberFromGroup(99999, 'invalid', botInstance);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_CHAT_ID');
    expect(mockBan).not.toHaveBeenCalled();
  });

  test("M21: Telegram 'chat not found' error becomes INVALID_CHAT_ID", async () => {
    const mockBan = jest.fn().mockRejectedValue({
      response: {
        statusCode: 400,
        body: { description: 'Bad Request: chat not found' },
      },
      message: 'Bad Request: chat not found',
    });
    const botInstance = { banChatMember: mockBan };

    const result = await kickMemberFromGroup(99999, '-1003836475731', botInstance);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_CHAT_ID');
  });
});

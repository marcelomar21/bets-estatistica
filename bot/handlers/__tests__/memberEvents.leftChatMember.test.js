/**
 * Tests for memberEvents.handleLeftChatMember.
 */

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    membership: {
      trialDays: 7,
    },
  },
}));

jest.mock('../../telegram', () => ({
  getBot: jest.fn(),
  getBotForGroup: jest.fn(() => null),
}));

const mockGetMemberByTelegramId = jest.fn();
const mockMarkMemberAsEvaded = jest.fn();
const mockRegisterMemberEventInsert = jest.fn();

jest.mock('../../services/memberService', () => ({
  getMemberByTelegramId: mockGetMemberByTelegramId,
  createTrialMember: jest.fn(),
  canRejoinGroup: jest.fn(),
  reactivateMember: jest.fn(),
  markMemberAsEvaded: mockMarkMemberAsEvaded,
}));

jest.mock('../../services/metricsService', () => ({
  getSuccessRateForDays: jest.fn(),
}));

// registerMemberEvent writes to supabase.from('member_events').insert()
// Mock supabase.from to return a simple chain.
const { supabase } = require('../../../lib/supabase');
supabase.from.mockImplementation(() => ({
  insert: mockRegisterMemberEventInsert.mockResolvedValue({ error: null }),
}));

const { handleLeftChatMember } = require('../memberEvents');

describe('handleLeftChatMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockImplementation(() => ({
      insert: mockRegisterMemberEventInsert.mockResolvedValue({ error: null }),
    }));
  });

  test('L1: skips when left_chat_member is a bot', async () => {
    const msg = {
      left_chat_member: { id: 1, username: 'somebot', is_bot: true },
    };

    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('bot_left');
    expect(mockMarkMemberAsEvaded).not.toHaveBeenCalled();
  });

  test('L2: returns not_found when member not in DB', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: false,
      error: { code: 'MEMBER_NOT_FOUND' },
    });

    const msg = {
      left_chat_member: { id: 555, username: 'ghost', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('not_found');
    expect(mockMarkMemberAsEvaded).not.toHaveBeenCalled();
  });

  test('L3: trial member is marked as evaded', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-1', telegram_id: 100, status: 'trial' },
    });
    mockMarkMemberAsEvaded.mockResolvedValue({ success: true, data: { id: 'uuid-1' } });

    const msg = {
      left_chat_member: { id: 100, username: 'trialuser', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(true);
    expect(result.action).toBe('evaded');
    expect(mockMarkMemberAsEvaded).toHaveBeenCalledWith('uuid-1', 'telegram_left_event');
  });

  test('L4: ativo member is marked as evaded', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-2', telegram_id: 200, status: 'ativo' },
    });
    mockMarkMemberAsEvaded.mockResolvedValue({ success: true, data: { id: 'uuid-2' } });

    const msg = {
      left_chat_member: { id: 200, username: 'activeuser', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(true);
    expect(result.action).toBe('evaded');
  });

  test('L5: removido member is skipped as already_terminal', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-3', telegram_id: 300, status: 'removido' },
    });

    const msg = {
      left_chat_member: { id: 300, username: 'removeduser', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('already_terminal');
    expect(mockMarkMemberAsEvaded).not.toHaveBeenCalled();
  });

  test('L6: evadido member is skipped (idempotent)', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-4', telegram_id: 400, status: 'evadido' },
    });

    const msg = {
      left_chat_member: { id: 400, username: 'evadido', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('already_terminal');
    expect(mockMarkMemberAsEvaded).not.toHaveBeenCalled();
  });

  test('L7: cancelado member is skipped as already_terminal', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-5', telegram_id: 500, status: 'cancelado' },
    });

    const msg = {
      left_chat_member: { id: 500, username: 'cancelled', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('already_terminal');
  });

  test('L8: race_condition from markMemberAsEvaded returns race_condition action', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-6', telegram_id: 600, status: 'trial' },
    });
    mockMarkMemberAsEvaded.mockResolvedValue({
      success: false,
      error: { code: 'RACE_CONDITION', message: 'race' },
    });

    const msg = {
      left_chat_member: { id: 600, username: 'raceuser', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('race_condition');
  });

  test('L9: getMemberByTelegramId returns generic DB error → action=error', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'db down' },
    });

    const msg = {
      left_chat_member: { id: 700, username: 'dberr', is_bot: false },
    };
    const result = await handleLeftChatMember(msg, 'group-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('error');
  });

  test('returns no_left_member when msg has no left_chat_member', async () => {
    const result = await handleLeftChatMember({}, 'group-1');
    expect(result.action).toBe('no_left_member');
  });
});

/**
 * Tests for memberEvents.handleChatMemberUpdate.
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
    membership: { trialDays: 7 },
  },
}));

jest.mock('../../telegram', () => ({
  getBot: jest.fn(),
  getBotForGroup: jest.fn(() => null),
}));

const mockGetMemberByTelegramId = jest.fn();
const mockMarkMemberAsRemoved = jest.fn();
const mockInsert = jest.fn().mockResolvedValue({ error: null });

jest.mock('../../services/memberService', () => ({
  getMemberByTelegramId: mockGetMemberByTelegramId,
  createTrialMember: jest.fn(),
  canRejoinGroup: jest.fn(),
  reactivateMember: jest.fn(),
  markMemberAsRemoved: mockMarkMemberAsRemoved,
}));

jest.mock('../../services/metricsService', () => ({
  getSuccessRateForDays: jest.fn(),
}));

const { supabase } = require('../../../lib/supabase');
supabase.from.mockImplementation(() => ({ insert: mockInsert }));

const { handleChatMemberUpdate } = require('../memberEvents');

function buildUpdate({
  fromId = 99999,
  userId = 123,
  oldStatus = 'member',
  newStatus = 'kicked',
  userIsBot = false,
} = {}) {
  return {
    from: { id: fromId },
    old_chat_member: { status: oldStatus },
    new_chat_member: {
      status: newStatus,
      user: { id: userId, is_bot: userIsBot },
    },
  };
}

describe('handleChatMemberUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockImplementation(() => ({ insert: mockInsert }));
  });

  test('C1: from=our bot → self_kick_dedup', async () => {
    const botCtx = { botId: 111 };
    const update = buildUpdate({ fromId: 111, userId: 555 });

    const result = await handleChatMemberUpdate(update, 'group-1', botCtx);

    expect(result.processed).toBe(false);
    expect(result.action).toBe('self_kick_dedup');
    expect(mockMarkMemberAsRemoved).not.toHaveBeenCalled();
  });

  test('C2: external admin kick → markMemberAsRemoved(external_kick)', async () => {
    const botCtx = { botId: 111 };
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-a', status: 'ativo' },
    });
    mockMarkMemberAsRemoved.mockResolvedValue({ success: true, data: { id: 'uuid-a' } });

    const update = buildUpdate({ fromId: 222, userId: 555 }); // admin != bot

    const result = await handleChatMemberUpdate(update, 'group-1', botCtx);

    expect(result.processed).toBe(true);
    expect(result.action).toBe('external_kick');
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith('uuid-a', 'external_kick');
  });

  test('C3: new_status=banned with external from → same as kicked', async () => {
    const botCtx = { botId: 111 };
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-b', status: 'trial' },
    });
    mockMarkMemberAsRemoved.mockResolvedValue({ success: true, data: { id: 'uuid-b' } });

    const update = buildUpdate({ fromId: 222, userId: 556, newStatus: 'banned' });

    const result = await handleChatMemberUpdate(update, 'group-1', botCtx);

    expect(result.processed).toBe(true);
    expect(result.action).toBe('external_kick');
  });

  test('C4: new_status=left → not_kick (handled by left_chat_member instead)', async () => {
    const update = buildUpdate({ newStatus: 'left' });

    const result = await handleChatMemberUpdate(update, 'group-1', { botId: 111 });

    expect(result.processed).toBe(false);
    expect(result.action).toBe('not_kick');
  });

  test('C5: old_status=kicked → not_from_active (no-op)', async () => {
    const update = buildUpdate({ oldStatus: 'kicked', newStatus: 'kicked' });

    const result = await handleChatMemberUpdate(update, 'group-1', { botId: 111 });

    expect(result.processed).toBe(false);
    expect(result.action).toBe('not_from_active');
  });

  test('C6: user.is_bot=true → bot_or_invalid', async () => {
    const update = buildUpdate({ userIsBot: true });

    const result = await handleChatMemberUpdate(update, 'group-1', { botId: 111 });

    expect(result.processed).toBe(false);
    expect(result.action).toBe('bot_or_invalid');
  });

  test('C7: member already in terminal status → already_terminal', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-c', status: 'removido' },
    });

    const update = buildUpdate({ fromId: 222, userId: 777 });

    const result = await handleChatMemberUpdate(update, 'group-1', { botId: 111 });

    expect(result.processed).toBe(false);
    expect(result.action).toBe('already_terminal');
    expect(mockMarkMemberAsRemoved).not.toHaveBeenCalled();
  });

  test('race condition from markMemberAsRemoved → race_condition', async () => {
    mockGetMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-r', status: 'ativo' },
    });
    mockMarkMemberAsRemoved.mockResolvedValue({
      success: false,
      error: { code: 'RACE_CONDITION' },
    });

    const update = buildUpdate({ fromId: 222, userId: 888 });

    const result = await handleChatMemberUpdate(update, 'group-1', { botId: 111 });

    expect(result.processed).toBe(false);
    expect(result.action).toBe('race_condition');
  });
});

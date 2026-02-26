/**
 * Tests: sendScheduledMessages.js
 * Story 5.3: Job de Envio de Mensagens Agendadas
 *
 * Tests cover:
 * - Fetches pending messages with scheduled_at <= now
 * - Successful send updates status/sent_at/telegram_message_id
 * - Failed send with attempts < 3 increments attempts (retry)
 * - Failed send with attempts >= 3 marks as failed
 * - Failure in one message does not block others
 * - No bot for group marks message as failed
 * - No pending messages returns zero counts
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    telegram: { adminGroupId: '-100123', publicGroupId: '-100456', botToken: 'test' },
    membership: { groupId: 'test-group-uuid' },
  },
  validateConfig: jest.fn(),
}));

const mockFrom = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
  },
}));

const mockGetBotForGroup = jest.fn();
const mockSendToPublic = jest.fn();
const mockSendToAdmin = jest.fn();

jest.mock('../../telegram', () => ({
  getBotForGroup: (...args) => mockGetBotForGroup(...args),
  sendToPublic: (...args) => mockSendToPublic(...args),
  sendToAdmin: (...args) => mockSendToAdmin(...args),
}));

const { runSendScheduledMessages } = require('../sendScheduledMessages');

// Helper to build a mock message
function makeMsg(overrides = {}) {
  return {
    id: 'msg-uuid-1',
    group_id: 'group-uuid-1',
    message_text: 'Hello *world*',
    scheduled_at: '2026-01-01T10:00:00Z',
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

// Mock botCtx
const mockBotCtx = {
  bot: {},
  groupId: 'group-uuid-1',
  adminGroupId: '-100123',
  publicGroupId: '-100456',
  botToken: 'test',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// Utility: setup the select chain for the initial query
function setupSelectChain(messages, error = null) {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.lte = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data: messages, error });

  mockFrom.mockImplementation((table) => {
    if (table === 'scheduled_messages') {
      return {
        select: chain.select,
        eq: chain.eq,
        lte: chain.lte,
        order: chain.order,
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    }
    return {};
  });

  return chain;
}

// More flexible setup: different behavior for select vs update
function setupMockFrom(messages, error = null) {
  const updateMock = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  });

  const selectChain = {};
  selectChain.select = jest.fn().mockReturnValue(selectChain);
  selectChain.eq = jest.fn().mockReturnValue(selectChain);
  selectChain.lte = jest.fn().mockReturnValue(selectChain);
  selectChain.order = jest.fn().mockResolvedValue({ data: messages, error });

  let callCount = 0;
  mockFrom.mockImplementation((table) => {
    if (table === 'scheduled_messages') {
      callCount++;
      // First call is the SELECT, subsequent are UPDATEs
      if (callCount === 1) {
        return {
          select: selectChain.select,
          eq: selectChain.eq,
          lte: selectChain.lte,
          order: selectChain.order,
          update: updateMock,
        };
      }
      return { update: updateMock };
    }
    return {};
  });

  return { updateMock };
}

describe('sendScheduledMessages', () => {
  test('returns zero counts when no pending messages', async () => {
    setupMockFrom([]);

    const result = await runSendScheduledMessages();

    expect(result).toEqual({ sent: 0, failed: 0, retried: 0 });
  });

  test('throws when DB query fails', async () => {
    setupMockFrom(null, { message: 'connection error' });

    await expect(runSendScheduledMessages()).rejects.toThrow('DB query failed');
  });

  test('sends message and updates to sent status', async () => {
    const msg = makeMsg();
    const { updateMock } = setupMockFrom([msg]);

    mockGetBotForGroup.mockReturnValue(mockBotCtx);
    mockSendToPublic.mockResolvedValue({
      success: true,
      data: { messageId: 42 },
    });

    const result = await runSendScheduledMessages();

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);

    // Verify sendToPublic was called with the message text and botCtx
    expect(mockSendToPublic).toHaveBeenCalledWith('Hello *world*', mockBotCtx);

    // Verify update was called with sent status
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        telegram_message_id: 42,
        attempts: 1,
      }),
    );
  });

  test('retries when send fails and attempts < 3', async () => {
    const msg = makeMsg({ attempts: 1 });
    const { updateMock } = setupMockFrom([msg]);

    mockGetBotForGroup.mockReturnValue(mockBotCtx);
    mockSendToPublic.mockResolvedValue({
      success: false,
      error: { message: 'Telegram timeout' },
    });

    const result = await runSendScheduledMessages();

    expect(result.sent).toBe(0);
    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);

    // Should update only attempts, not status
    expect(updateMock).toHaveBeenCalledWith({ attempts: 2 });
  });

  test('marks failed when send fails and attempts >= 3', async () => {
    const msg = makeMsg({ attempts: 2 }); // Will become 3 after increment
    const { updateMock } = setupMockFrom([msg]);

    mockGetBotForGroup.mockReturnValue(mockBotCtx);
    mockSendToPublic.mockResolvedValue({
      success: false,
      error: { message: 'Telegram timeout' },
    });

    const result = await runSendScheduledMessages();

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);

    // Should mark as failed
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        attempts: 3,
      }),
    );
  });

  test('marks failed when no bot registered for group', async () => {
    const msg = makeMsg({ group_id: 'unknown-group' });
    const { updateMock } = setupMockFrom([msg]);

    mockGetBotForGroup.mockReturnValue(null);

    const result = await runSendScheduledMessages();

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        attempts: 1,
      }),
    );
  });

  test('failure in one message does not block others', async () => {
    const msg1 = makeMsg({ id: 'msg-1', group_id: 'group-ok' });
    const msg2 = makeMsg({ id: 'msg-2', group_id: 'no-bot-group' });
    const msg3 = makeMsg({ id: 'msg-3', group_id: 'group-ok' });
    const { updateMock } = setupMockFrom([msg1, msg2, msg3]);

    mockGetBotForGroup.mockImplementation((groupId) => {
      if (groupId === 'group-ok') return mockBotCtx;
      return null; // no-bot-group
    });

    mockSendToPublic.mockResolvedValue({
      success: true,
      data: { messageId: 99 },
    });

    const result = await runSendScheduledMessages();

    // msg1: sent, msg2: failed (no bot), msg3: sent
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);

    // sendToPublic should be called twice (msg1 and msg3), not for msg2
    expect(mockSendToPublic).toHaveBeenCalledTimes(2);
  });
});

/**
 * Tests for healthCheck.js — Heartbeat do bot unificado
 */

// Mock dependencies before importing
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
  testConnection: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../bot/services/alertService', () => ({
  healthCheckAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../bot/lib/configHelper', () => ({
  reloadConfig: jest.fn(),
}));

const { supabase, testConnection } = require('../../lib/supabase');
const logger = require('../../lib/logger');

// Import after mocks
const { runHealthCheck, updateHeartbeat } = require('../../bot/jobs/healthCheck');

// Helper to mock supabase chain for bot_health
function mockBotHealthChain({ selectData = [], selectError = null, updateError = null, insertError = null } = {}) {
  const mockUpdate = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: updateError }),
  });
  const mockInsert = jest.fn().mockResolvedValue({ error: insertError });

  supabase.from.mockImplementation((table) => {
    if (table === 'bot_health') {
      return {
        select: jest.fn().mockReturnValue({
          is: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              is: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: selectData, error: selectError }),
              }),
            }),
          }),
        }),
        update: mockUpdate,
        insert: mockInsert,
      };
    }
    return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
  });

  return { mockUpdate, mockInsert };
}

describe('updateHeartbeat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a new row when no existing heartbeat found', async () => {
    const { mockInsert } = mockBotHealthChain({ selectData: [] });

    await updateHeartbeat('online');

    expect(supabase.from).toHaveBeenCalledWith('bot_health');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: null,
        channel: 'telegram',
        number_id: null,
        status: 'online',
        error_message: null,
      }),
    );
  });

  it('updates existing row when heartbeat already exists', async () => {
    const { mockUpdate } = mockBotHealthChain({ selectData: [{ id: 'hb-123' }] });

    await updateHeartbeat('online');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'online',
        error_message: null,
      }),
    );
  });

  it('sets status to offline with error_message when DB fails', async () => {
    const { mockInsert } = mockBotHealthChain({ selectData: [] });

    await updateHeartbeat('offline', 'Connection refused');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'offline',
        error_message: 'Connection refused',
      }),
    );
  });

  it('does not throw when upsert fails (fire-and-forget)', async () => {
    mockBotHealthChain({ selectData: [], insertError: { message: 'DB write failed' } });

    // Should not throw
    await expect(updateHeartbeat('online')).resolves.not.toThrow();

    // Should log warning
    expect(logger.warn).toHaveBeenCalledWith(
      '[healthCheck] Failed to update heartbeat',
      expect.objectContaining({ error: 'DB write failed' }),
    );
  });

  it('does not throw when select fails', async () => {
    // Simulate the select throwing an exception
    supabase.from.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              limit: jest.fn().mockRejectedValue(new Error('Network error')),
            }),
          }),
        }),
      }),
    }));

    await expect(updateHeartbeat('online')).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      '[healthCheck] Heartbeat error (non-blocking)',
      expect.objectContaining({ error: 'Network error' }),
    );
  });
});

describe('runHealthCheck with heartbeat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls updateHeartbeat with online when DB is ok', async () => {
    testConnection.mockResolvedValue({ success: true });
    const { mockInsert } = mockBotHealthChain({ selectData: [] });

    const result = await runHealthCheck();

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'online' }),
    );
  });

  it('does NOT call updateHeartbeat when DB fails (stale detection catches it)', async () => {
    testConnection.mockResolvedValue({ success: false, error: { message: 'Connection refused' } });
    mockBotHealthChain({ selectData: [] });

    const result = await runHealthCheck();

    expect(result.success).toBe(false);
    // Should not attempt to write to DB that just failed
    expect(supabase.from).not.toHaveBeenCalledWith('bot_health');
  });
});

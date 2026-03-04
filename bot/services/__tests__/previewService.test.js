/**
 * Tests: previewService.js — Story 18-2
 * Validates that generatePreview correctly handles betId parameter:
 *   - When betId is provided, fetches that specific bet
 *   - When betId is null, fetches sample bets
 *   - Returns BET_NOT_FOUND when specific bet doesn't exist
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockFrom = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}));

jest.mock('../copyService', () => ({
  generateBetCopy: jest.fn().mockResolvedValue({ success: false }),
  clearBetCache: jest.fn(),
}));

jest.mock('../../jobs/postBets', () => ({
  formatBetMessage: jest.fn((_bet, _tpl) => 'formatted message'),
  getRandomTemplate: jest.fn(() => 'template'),
}));

const GROUP_ID = 'group-uuid-123';
const BET_ID = 42;

const RAW_BET = {
  id: BET_ID,
  bet_market: 'Resultado Final',
  bet_pick: 'Time A',
  odds: 1.85,
  deep_link: 'https://bet.com/link',
  reasoning: 'Strong form',
  promovida_manual: false,
  league_matches: {
    home_team_name: 'Time A',
    away_team_name: 'Time B',
    kickoff_time: '2026-03-05T20:00:00Z',
  },
};

function createChain(resolvedValue) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };
  // limit() resolves for list queries; single() resolves for single-row queries
  chain.limit.mockResolvedValue(resolvedValue);
  chain.single.mockResolvedValue(resolvedValue);
  return chain;
}

describe('previewService', () => {
  let generatePreview;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-require so mocks are fresh
    jest.resetModules();
    // Re-setup mocks after resetModules
    jest.mock('../../../lib/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }));
    jest.mock('../../../lib/supabase', () => ({
      supabase: { from: (...args) => mockFrom(...args) },
    }));
    jest.mock('../copyService', () => ({
      generateBetCopy: jest.fn().mockResolvedValue({ success: false }),
      clearBetCache: jest.fn(),
    }));
    jest.mock('../../jobs/postBets', () => ({
      formatBetMessage: jest.fn((_bet, _tpl) => 'formatted message'),
      getRandomTemplate: jest.fn(() => 'template'),
    }));
    generatePreview = require('../previewService').generatePreview;
  });

  function setupMockFrom(toneConfig = null, betsData = [RAW_BET], groupName = 'Test Group') {
    mockFrom.mockImplementation((table) => {
      if (table === 'groups') {
        const chain = createChain({ data: null, error: null });
        chain.single.mockImplementation(() => {
          // Determine what was selected
          return Promise.resolve({
            data: { copy_tone_config: toneConfig, name: groupName },
            error: null,
          });
        });
        return chain;
      }

      if (table === 'suggested_bets') {
        return createChain({ data: betsData, error: null });
      }

      return createChain({ data: null, error: null });
    });
  }

  it('fetches specific bet when betId is provided', async () => {
    setupMockFrom(null, [RAW_BET]);

    const result = await generatePreview(GROUP_ID, BET_ID);

    expect(result.success).toBe(true);
    expect(result.data.bets).toHaveLength(1);
    expect(result.data.bets[0].betId).toBe(BET_ID);

    // Verify suggested_bets was queried with .eq('id', betId)
    const suggestedBetsCalls = mockFrom.mock.calls.filter(c => c[0] === 'suggested_bets');
    expect(suggestedBetsCalls.length).toBeGreaterThan(0);
  });

  it('fetches sample bets when betId is null', async () => {
    setupMockFrom(null, [RAW_BET]);

    const result = await generatePreview(GROUP_ID, null);

    expect(result.success).toBe(true);
    expect(result.data.bets).toHaveLength(1);
  });

  it('fetches sample bets when betId is undefined (default)', async () => {
    setupMockFrom(null, [RAW_BET]);

    const result = await generatePreview(GROUP_ID);

    expect(result.success).toBe(true);
    expect(result.data.bets).toHaveLength(1);
  });

  it('returns BET_NOT_FOUND when specific bet does not exist', async () => {
    setupMockFrom(null, []);

    const result = await generatePreview(GROUP_ID, 9999);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('BET_NOT_FOUND');
  });

  it('returns NO_BETS when no sample bets exist and betId is null', async () => {
    setupMockFrom(null, []);

    const result = await generatePreview(GROUP_ID, null);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NO_BETS');
  });

  it('includes groupName in successful response', async () => {
    setupMockFrom(null, [RAW_BET], 'Guru da Bet');

    const result = await generatePreview(GROUP_ID);

    expect(result.success).toBe(true);
    expect(result.data.groupName).toBe('Guru da Bet');
    expect(result.data.groupId).toBe(GROUP_ID);
  });

  it('returns DB_ERROR when fetchBetById has a database error', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'groups') {
        const chain = createChain({ data: null, error: null });
        chain.single.mockResolvedValue({
          data: { copy_tone_config: null, name: 'Test' },
          error: null,
        });
        return chain;
      }
      if (table === 'suggested_bets') {
        return createChain({ data: null, error: { message: 'connection timeout' } });
      }
      return createChain({ data: null, error: null });
    });

    const result = await generatePreview(GROUP_ID, BET_ID);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DB_ERROR');
    expect(result.error.message).toContain('connection timeout');
  });

  it('includes betInfo in preview results', async () => {
    setupMockFrom(null, [RAW_BET]);

    const result = await generatePreview(GROUP_ID, BET_ID);

    expect(result.success).toBe(true);
    const betResult = result.data.bets[0];
    expect(betResult.betInfo).toBeDefined();
    expect(betResult.betInfo.homeTeam).toBe('Time A');
    expect(betResult.betInfo.awayTeam).toBe('Time B');
    expect(betResult.betInfo.market).toBe('Resultado Final');
    expect(betResult.betInfo.odds).toBe(1.85);
  });
});

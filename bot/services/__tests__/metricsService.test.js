/**
 * Tests: metricsService.js — getYesterdayWins()
 *
 * Validates that getYesterdayWins queries via bet_group_assignments
 * junction table (not deprecated suggested_bets.group_id).
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockFrom = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

const { getYesterdayWins } = require('../metricsService');

describe('getYesterdayWins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildMockChain(resolvedValue) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockResolvedValue(resolvedValue),
    };
    mockFrom.mockReturnValue(chain);
    return chain;
  }

  it('should query suggested_bets with bet_group_assignments JOIN', async () => {
    const chain = buildMockChain({ data: [], error: null });

    await getYesterdayWins('group-abc');

    expect(mockFrom).toHaveBeenCalledWith('suggested_bets');
    const selectArg = chain.select.mock.calls[0][0];
    expect(selectArg).toContain('bet_group_assignments!inner');
    expect(selectArg).toContain('league_matches!inner');
  });

  it('should filter by bet_group_assignments.group_id (not suggested_bets.group_id)', async () => {
    const chain = buildMockChain({ data: [], error: null });

    await getYesterdayWins('group-xyz');

    const eqCalls = chain.eq.mock.calls;
    const groupFilter = eqCalls.find(c => c[1] === 'group-xyz');
    expect(groupFilter).toBeDefined();
    expect(groupFilter[0]).toBe('bet_group_assignments.group_id');
  });

  it('should filter by bet_group_assignments.posting_status=posted', async () => {
    const chain = buildMockChain({ data: [], error: null });

    await getYesterdayWins('group-abc');

    const eqCalls = chain.eq.mock.calls;
    const postingFilter = eqCalls.find(c => c[0] === 'bet_group_assignments.posting_status');
    expect(postingFilter).toBeDefined();
    expect(postingFilter[1]).toBe('posted');
  });

  it('should NOT use deprecated suggested_bets.group_id', async () => {
    const chain = buildMockChain({ data: [], error: null });

    await getYesterdayWins('group-abc');

    const eqCalls = chain.eq.mock.calls;
    const directGroupId = eqCalls.find(c => c[0] === 'group_id');
    expect(directGroupId).toBeUndefined();
  });

  it('should return wins, winCount, totalCount, pendingCount and rate for mixed results', async () => {
    const mockData = [
      { id: 1, bet_market: 'Over 2.5', bet_pick: 'Over', odds_at_post: 1.80, bet_result: 'success', league_matches: { home_team_name: 'A', away_team_name: 'B', kickoff_time: '2026-04-04T20:00:00Z' } },
      { id: 2, bet_market: 'BTTS', bet_pick: 'Sim', odds_at_post: 1.95, bet_result: 'success', league_matches: { home_team_name: 'C', away_team_name: 'D', kickoff_time: '2026-04-04T21:00:00Z' } },
      { id: 3, bet_market: '1X2', bet_pick: 'Home', odds_at_post: 2.10, bet_result: 'failure', league_matches: { home_team_name: 'E', away_team_name: 'F', kickoff_time: '2026-04-04T22:00:00Z' } },
      { id: 4, bet_market: 'Under 3.5', bet_pick: 'Under', odds_at_post: 1.65, bet_result: 'pending', league_matches: { home_team_name: 'G', away_team_name: 'H', kickoff_time: '2026-04-04T22:30:00Z' } },
    ];
    buildMockChain({ data: mockData, error: null });

    const result = await getYesterdayWins('group-abc');

    expect(result.success).toBe(true);
    expect(result.data.winCount).toBe(2);
    expect(result.data.totalCount).toBe(4);
    expect(result.data.pendingCount).toBe(1);
    expect(result.data.rate).toBeCloseTo(50.0, 1);
    expect(result.data.wins).toHaveLength(2);
    expect(result.data.wins.every(b => b.bet_result === 'success')).toBe(true);
    expect(result.data.allBets).toHaveLength(4);
  });

  it('should count unknown bets as pending in pendingCount', async () => {
    const mockData = [
      { id: 1, bet_result: 'success', league_matches: {} },
      { id: 2, bet_result: 'unknown', league_matches: {} },
      { id: 3, bet_result: 'pending', league_matches: {} },
    ];
    buildMockChain({ data: mockData, error: null });

    const result = await getYesterdayWins('group-abc');

    expect(result.success).toBe(true);
    expect(result.data.winCount).toBe(1);
    expect(result.data.totalCount).toBe(3);
    expect(result.data.pendingCount).toBe(2);
    expect(result.data.rate).toBeCloseTo(33.33, 1);
  });

  it('should return winCount=0 when all bets failed', async () => {
    const mockData = [
      { id: 1, bet_result: 'failure', league_matches: {} },
    ];
    buildMockChain({ data: mockData, error: null });

    const result = await getYesterdayWins('group-abc');

    expect(result.success).toBe(true);
    expect(result.data.winCount).toBe(0);
    expect(result.data.totalCount).toBe(1);
    expect(result.data.pendingCount).toBe(0);
    expect(result.data.rate).toBe(0);
  });

  it('should return rate=null when no bets found', async () => {
    buildMockChain({ data: [], error: null });

    const result = await getYesterdayWins('group-abc');

    expect(result.success).toBe(true);
    expect(result.data.winCount).toBe(0);
    expect(result.data.totalCount).toBe(0);
    expect(result.data.rate).toBeNull();
  });

  it('should return DB_ERROR on supabase error', async () => {
    buildMockChain({ data: null, error: { message: 'connection refused' } });

    const result = await getYesterdayWins('group-abc');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DB_ERROR');
    expect(result.error.message).toBe('connection refused');
  });

  it('should filter by bet_group_assignments.telegram_posted_at (not result_updated_at)', async () => {
    const chain = buildMockChain({ data: [], error: null });

    await getYesterdayWins('group-abc');

    const gteCalls = chain.gte.mock.calls;
    expect(gteCalls).toHaveLength(1);
    expect(gteCalls[0][0]).toBe('bet_group_assignments.telegram_posted_at');

    // lt is the terminal call in the chain mock, check it was called with correct field
    // (lt resolves the promise, so we check its mock.calls)
    const ltCalls = chain.lt.mock.calls;
    expect(ltCalls).toHaveLength(1);
    expect(ltCalls[0][0]).toBe('bet_group_assignments.telegram_posted_at');
  });

  it('should include telegram_posted_at in bet_group_assignments select', async () => {
    const chain = buildMockChain({ data: [], error: null });

    await getYesterdayWins('group-abc');

    const selectArg = chain.select.mock.calls[0][0];
    expect(selectArg).toContain('telegram_posted_at');
  });

  it('should return CALC_ERROR on unexpected exception', async () => {
    mockFrom.mockImplementation(() => { throw new Error('unexpected'); });

    const result = await getYesterdayWins('group-abc');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('CALC_ERROR');
  });
});

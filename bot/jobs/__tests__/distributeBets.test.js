/**
 * Tests: distributeBets.js
 * Story 19.2: League preference filtering
 * Story 2.4 (GURU-45): Junction table refactor tests
 */

// --- Supabase mock setup ---
const mockSelect = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockReturnThis();
const mockNeq = jest.fn().mockReturnThis();
const mockIs = jest.fn().mockReturnThis();
const mockNot = jest.fn().mockReturnThis();
const mockIn = jest.fn().mockReturnThis();
const mockGte = jest.fn().mockReturnThis();
const mockLte = jest.fn().mockReturnThis();
const mockOrder = jest.fn().mockReturnThis();
const mockDelete = jest.fn().mockReturnThis();
const mockUpsert = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();

const mockChain = {
  select: mockSelect,
  eq: mockEq,
  neq: mockNeq,
  is: mockIs,
  not: mockNot,
  in: mockIn,
  gte: mockGte,
  lte: mockLte,
  order: mockOrder,
  delete: mockDelete,
  upsert: mockUpsert,
  update: mockUpdate,
};

// Make all chain methods return the chain
Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));

const mockFrom = jest.fn(() => ({ ...mockChain }));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../services/alertService', () => ({
  alertAdmin: jest.fn(),
}));

const {
  distributeRoundRobin,
  isGroupEligibleForBet,
  getBetLeagueName,
  getUndistributedBets,
  assignBetToGroup,
  getGroupBetCounts,
  rebalanceIfNeeded,
  getScheduledCountsPerTime,
} = require('../distributeBets');

// Helper: create a bet object with nested league_name
function makeBet(id, leagueName) {
  return {
    id,
    match_id: `match-${id}`,
    league_matches: {
      kickoff_time: '2026-03-04T15:00:00Z',
      league_seasons: { league_name: leagueName },
    },
  };
}

const groupA = { id: 'group-a', name: 'Group A' };
const groupB = { id: 'group-b', name: 'Group B' };
const groupC = { id: 'group-c', name: 'Group C' };

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  // Re-setup chain returns after clearing
  Object.values(mockChain).forEach((fn) => fn.mockReturnValue(mockChain));
  mockFrom.mockReturnValue({ ...mockChain });
});

// ============================================================
// Pure function tests (unchanged behavior)
// ============================================================

describe('getBetLeagueName', () => {
  it('extracts league_name from nested join', () => {
    const bet = makeBet('1', 'Premier League');
    expect(getBetLeagueName(bet)).toBe('Premier League');
  });

  it('returns null when nested data missing', () => {
    expect(getBetLeagueName({ id: '1' })).toBeNull();
    expect(getBetLeagueName({ id: '1', league_matches: {} })).toBeNull();
    expect(getBetLeagueName({ id: '1', league_matches: { league_seasons: {} } })).toBeNull();
  });
});

describe('isGroupEligibleForBet', () => {
  it('returns true when group has no preferences (empty map)', () => {
    expect(isGroupEligibleForBet(new Map(), 'Premier League')).toBe(true);
  });

  it('returns true when league is not in preferences (new league)', () => {
    const prefs = new Map([['La Liga', false]]);
    expect(isGroupEligibleForBet(prefs, 'Premier League')).toBe(true);
  });

  it('returns true when league is enabled', () => {
    const prefs = new Map([['Premier League', true]]);
    expect(isGroupEligibleForBet(prefs, 'Premier League')).toBe(true);
  });

  it('returns false when league is disabled', () => {
    const prefs = new Map([['La Liga', false]]);
    expect(isGroupEligibleForBet(prefs, 'La Liga')).toBe(false);
  });

  it('returns true when league_name is null', () => {
    const prefs = new Map([['La Liga', false]]);
    expect(isGroupEligibleForBet(prefs, null)).toBe(true);
  });
});

describe('distributeRoundRobin with league preferences', () => {
  it('distributes all bets when no preferences (retrocompatible)', () => {
    const bets = [
      makeBet('1', 'Premier League'),
      makeBet('2', 'La Liga'),
      makeBet('3', 'Brazil Serie A'),
      makeBet('4', 'Italy Serie A'),
    ];
    const groups = [groupA, groupB];

    // No leaguePrefs → all groups get all bets
    const assignments = distributeRoundRobin(bets, groups, {}, null);
    expect(assignments).toHaveLength(4);
    // Each group should get 2 bets
    const countA = assignments.filter((a) => a.groupId === 'group-a').length;
    const countB = assignments.filter((a) => a.groupId === 'group-b').length;
    expect(countA).toBe(2);
    expect(countB).toBe(2);
  });

  it('filters bets by disabled league for a group', () => {
    const bets = [
      makeBet('1', 'Premier League'),
      makeBet('2', 'La Liga'),
      makeBet('3', 'Brazil Serie A'),
    ];
    const groups = [groupA, groupB];

    // Group A disables La Liga, Group B accepts all
    const leaguePrefs = new Map([
      ['group-a', new Map([['La Liga', false], ['Premier League', true], ['Brazil Serie A', true]])],
      ['group-b', new Map()], // no preferences = accept all
    ]);

    const assignments = distributeRoundRobin(bets, groups, {}, leaguePrefs);
    expect(assignments).toHaveLength(3);

    // La Liga bet should go to group B only
    const laLigaAssignment = assignments.find((a) => a.betId === '2');
    expect(laLigaAssignment.groupId).toBe('group-b');
  });

  it('skips bet when ALL groups have disabled its league', () => {
    const bets = [
      makeBet('1', 'Premier League'),
      makeBet('2', 'La Liga'),
    ];
    const groups = [groupA, groupB];

    // Both groups disable La Liga
    const leaguePrefs = new Map([
      ['group-a', new Map([['La Liga', false]])],
      ['group-b', new Map([['La Liga', false]])],
    ]);

    const assignments = distributeRoundRobin(bets, groups, {}, leaguePrefs);
    // Only Premier League bet assigned (La Liga skipped)
    expect(assignments).toHaveLength(1);
    expect(assignments[0].betId).toBe('1');
  });

  it('treats unknown league as enabled (new league default)', () => {
    const bets = [
      makeBet('1', 'New Championship'),
    ];
    const groups = [groupA];

    // Group A has preferences but not for this league
    const leaguePrefs = new Map([
      ['group-a', new Map([['La Liga', false]])],
    ]);

    const assignments = distributeRoundRobin(bets, groups, {}, leaguePrefs);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].groupId).toBe('group-a');
  });

  it('distributes correctly with mixed preferences across groups', () => {
    const bets = [
      makeBet('1', 'Premier League'),
      makeBet('2', 'La Liga'),
      makeBet('3', 'Brazil Serie A'),
      makeBet('4', 'Premier League'),
    ];
    const groups = [groupA, groupB, groupC];

    // A: only Premier League
    // B: only La Liga + Brazil
    // C: accepts all
    const leaguePrefs = new Map([
      ['group-a', new Map([['Premier League', true], ['La Liga', false], ['Brazil Serie A', false]])],
      ['group-b', new Map([['Premier League', false], ['La Liga', true], ['Brazil Serie A', true]])],
      ['group-c', new Map()], // accept all
    ]);

    const assignments = distributeRoundRobin(bets, groups, {}, leaguePrefs);
    expect(assignments).toHaveLength(4);

    // Premier League bets: eligible for A and C (not B)
    const pl1 = assignments.find((a) => a.betId === '1');
    const pl4 = assignments.find((a) => a.betId === '4');
    expect(['group-a', 'group-c']).toContain(pl1.groupId);
    expect(['group-a', 'group-c']).toContain(pl4.groupId);

    // La Liga: eligible for B and C (not A)
    const ll = assignments.find((a) => a.betId === '2');
    expect(['group-b', 'group-c']).toContain(ll.groupId);

    // Brazil Serie A: eligible for B and C (not A)
    const br = assignments.find((a) => a.betId === '3');
    expect(['group-b', 'group-c']).toContain(br.groupId);
  });
});

// ============================================================
// Junction table refactor tests (GURU-45)
// ============================================================

describe('getUndistributedBets (junction table)', () => {
  it('returns bets with NO assignment in junction table', async () => {
    // First call: bet_group_assignments.select('bet_id') → empty
    const assignmentsChain = {
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    // Second call: suggested_bets query → returns bets
    const betsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [makeBet('bet-1', 'Premier League'), makeBet('bet-2', 'La Liga')],
        error: null,
      }),
    };

    mockFrom
      .mockReturnValueOnce(assignmentsChain)
      .mockReturnValueOnce(betsChain);

    const result = await getUndistributedBets();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
    expect(mockFrom).toHaveBeenCalledWith('suggested_bets');
  });

  it('excludes bets that already have assignments', async () => {
    // First call: junction table has assigned bet IDs
    const assignmentsChain = {
      select: jest.fn().mockResolvedValue({
        data: [{ bet_id: 'bet-1' }, { bet_id: 'bet-3' }],
        error: null,
      }),
    };
    // Second call: suggested_bets query → build a fully chainable + thenable mock
    const queryResult = { data: [makeBet('bet-2', 'La Liga')], error: null };
    const notFn = jest.fn();

    // Create a thenable chain object — every method returns itself, await resolves queryResult
    function makeThenable() {
      const obj = {
        then: (resolve) => resolve(queryResult),
        catch: (fn) => obj,
        select: jest.fn(() => obj),
        eq: jest.fn(() => obj),
        is: jest.fn(() => obj),
        neq: jest.fn(() => obj),
        gte: jest.fn(() => obj),
        lte: jest.fn(() => obj),
        order: jest.fn(() => obj),
        not: notFn,
      };
      // not() also returns a thenable
      notFn.mockReturnValue(obj);
      return obj;
    }

    const betsChain = makeThenable();

    mockFrom
      .mockReturnValueOnce(assignmentsChain)
      .mockReturnValueOnce(betsChain);

    const result = await getUndistributedBets();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('bet-2');
    // Verify .not() was called with the excluded IDs
    expect(notFn).toHaveBeenCalledWith('id', 'in', '(bet-1,bet-3)');
  });

  it('returns error when junction table query fails', async () => {
    const assignmentsChain = {
      select: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      }),
    };

    mockFrom.mockReturnValueOnce(assignmentsChain);

    const result = await getUndistributedBets();

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DB_ERROR');
  });
});

describe('assignBetToGroup (junction table)', () => {
  it('INSERTs into bet_group_assignments', async () => {
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [{ id: 'bga-1', bet_id: 'bet-1', group_id: 'group-a', posting_status: 'pending', post_at: '10:00', created_at: '2026-03-28T12:00:00Z' }],
        error: null,
      }),
    };
    // First call: bet_group_assignments upsert
    // Second call: suggested_bets update (distributed_at)
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(updateChain);

    const result = await assignBetToGroup('bet-1', 'group-a', '10:00');

    expect(result.success).toBe(true);
    expect(result.data.bet_id).toBe('bet-1');
    expect(result.data.group_id).toBe('group-a');
    expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
    expect(chain.upsert).toHaveBeenCalledWith(
      { bet_id: 'bet-1', group_id: 'group-a', posting_status: 'pending', post_at: '10:00' },
      { onConflict: 'bet_id,group_id', ignoreDuplicates: true }
    );
  });

  it('is idempotent — duplicate insert returns success with alreadyDistributed', async () => {
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    mockFrom.mockReturnValueOnce(chain);

    const result = await assignBetToGroup('bet-1', 'group-a');

    expect(result.success).toBe(true);
    expect(result.data.alreadyDistributed).toBe(true);
  });

  it('returns error on DB failure', async () => {
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'unique constraint violation' },
      }),
    };

    mockFrom.mockReturnValueOnce(chain);

    const result = await assignBetToGroup('bet-1', 'group-a');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DISTRIBUTION_ERROR');
  });

  it('does not include post_at when null', async () => {
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [{ id: 'bga-1', bet_id: 'bet-1', group_id: 'group-a', posting_status: 'pending', post_at: null, created_at: '2026-03-28T12:00:00Z' }],
        error: null,
      }),
    };
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(updateChain);

    await assignBetToGroup('bet-1', 'group-a', null);

    expect(chain.upsert).toHaveBeenCalledWith(
      { bet_id: 'bet-1', group_id: 'group-a', posting_status: 'pending' },
      { onConflict: 'bet_id,group_id', ignoreDuplicates: true }
    );
  });
});

describe('getGroupBetCounts (junction table)', () => {
  it('counts from bet_group_assignments', async () => {
    const chain = {
      select: jest.fn().mockResolvedValue({
        data: [
          { group_id: 'group-a' },
          { group_id: 'group-a' },
          { group_id: 'group-b' },
        ],
        error: null,
      }),
    };

    mockFrom.mockReturnValueOnce(chain);

    const counts = await getGroupBetCounts();

    expect(counts).toEqual({ 'group-a': 2, 'group-b': 1 });
    expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
  });

  it('returns empty object on error', async () => {
    const chain = {
      select: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'timeout' },
      }),
    };

    mockFrom.mockReturnValueOnce(chain);

    const counts = await getGroupBetCounts();

    expect(counts).toEqual({});
  });
});

describe('rebalanceIfNeeded (junction table)', () => {
  it('DELETEs non-posted assignments when groups without bets detected', async () => {
    // Query non-posted assignments
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({
        data: [
          { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-a', posting_status: 'pending' },
          { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-a', posting_status: 'pending' },
        ],
        error: null,
      }),
    };
    // Delete assignments
    const deleteChain = {
      delete: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ error: null }),
    };

    mockFrom
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain);

    const result = await rebalanceIfNeeded([groupA, groupB]);

    expect(result.rebalanced).toBe(true);
    expect(result.undistributed).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.in).toHaveBeenCalledWith('id', ['bga-1', 'bga-2']);
  });

  it('preserves posted assignments (never deletes posting_status=posted)', async () => {
    // The query already filters .neq('posting_status', 'posted'),
    // so posted assignments never appear in the delete set
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({
        data: [], // no non-posted assignments
        error: null,
      }),
    };

    mockFrom.mockReturnValueOnce(selectChain);

    const result = await rebalanceIfNeeded([groupA, groupB]);

    expect(result.rebalanced).toBe(false);
    // delete should NOT have been called since there's nothing to delete
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('does not rebalance when all groups have assignments', async () => {
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({
        data: [
          { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-a', posting_status: 'pending' },
          { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-b', posting_status: 'pending' },
        ],
        error: null,
      }),
    };

    mockFrom.mockReturnValueOnce(selectChain);

    const result = await rebalanceIfNeeded([groupA, groupB]);

    expect(result.rebalanced).toBe(false);
  });

  it('returns error on query failure', async () => {
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection lost' },
      }),
    };

    mockFrom.mockReturnValueOnce(selectChain);

    const result = await rebalanceIfNeeded([groupA]);

    expect(result.rebalanced).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('getScheduledCountsPerTime (junction table)', () => {
  it('counts from bet_group_assignments', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({
        data: [
          { post_at: '10:00' },
          { post_at: '10:00' },
          { post_at: '15:00' },
        ],
        error: null,
      }),
    };

    mockFrom.mockReturnValueOnce(chain);

    const counts = await getScheduledCountsPerTime('group-a', ['10:00', '15:00', '20:00']);

    expect(counts).toEqual({ '10:00': 2, '15:00': 1, '20:00': 0 });
    expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
    expect(chain.eq).toHaveBeenCalledWith('group_id', 'group-a');
    expect(chain.neq).toHaveBeenCalledWith('posting_status', 'posted');
  });

  it('returns zero counts on error', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      neq: jest.fn().mockRejectedValue(new Error('timeout')),
    };

    mockFrom.mockReturnValueOnce(chain);

    const counts = await getScheduledCountsPerTime('group-a', ['10:00', '15:00']);

    expect(counts).toEqual({ '10:00': 0, '15:00': 0 });
  });
});

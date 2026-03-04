/**
 * Tests: distributeBets.js - League preference filtering
 * Story 19.2: Distribuição Respeita Filtro de Campeonato
 */

const {
  distributeRoundRobin,
  isGroupEligibleForBet,
  getBetLeagueName,
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

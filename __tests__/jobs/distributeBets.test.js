/**
 * Tests for distributeBets job — Story 5.1: Distribuição Round-robin de Apostas entre Grupos
 * Story 2.4 (GURU-45): Refactored to use bet_group_assignments junction table
 *
 * Tests: round-robin distribution, single group, no groups, idempotency, balanced distribution,
 *        inactive groups excluded, no bets to distribute, rebalance, assignBetToGroup via junction table
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

// Mock dependencies
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

jest.mock('../../bot/services/alertService', () => ({
  alertAdmin: jest.fn().mockResolvedValue({ success: true }),
}));

const { alertAdmin } = require('../../bot/services/alertService');

// Import after mocks
const {
  runDistributeBets,
  getActiveGroups,
  getUndistributedBets,
  getDistributionWindow,
  rebalanceIfNeeded,
  distributeRoundRobin,
  assignBetToGroup,
} = require('../../bot/jobs/distributeBets');

// Helper to create mock groups
function createMockGroups(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `group-uuid-${i + 1}`,
    name: `Grupo ${i + 1}`,
    status: 'active',
    created_at: new Date(2026, 0, i + 1).toISOString(),
  }));
}

// Helper to create mock bets (with nested league_matches for the new code)
function createMockBets(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bet-uuid-${i + 1}`,
    match_id: `match-${i + 1}`,
    elegibilidade: 'elegivel',
    group_id: null,
    distributed_at: null,
    bet_status: 'ready',
    league_matches: {
      kickoff_time: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
      league_seasons: { league_name: 'Premier League' },
    },
  }));
}

// Helper to create a chainable mock that resolves at .order()
function createChainMock(resolveValue) {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockReturnValue(chain);
  chain.gte = jest.fn().mockReturnValue(chain);
  chain.lte = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue(resolveValue);
  chain.then = undefined; // ensure it's not thenable by default
  return chain;
}

// Helper: creates a mock for bet_group_assignments select that resolves immediately at .select()
function createBgaSelectMock(resolveValue) {
  return {
    select: jest.fn().mockResolvedValue(resolveValue),
  };
}

// Helper: creates a mock for rebalanceIfNeeded's first query
// bet_group_assignments.select(...).neq('posting_status', 'posted')
function createRebalanceSelectMock(resolveValue) {
  return {
    select: jest.fn().mockReturnValue({
      neq: jest.fn().mockResolvedValue(resolveValue),
    }),
  };
}

// Helper: creates a mock for rebalance delete
// bet_group_assignments.delete().in('id', [...])
function createRebalanceDeleteMock(resolveValue) {
  return {
    delete: jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue(resolveValue || { error: null }),
    }),
  };
}

// Helper: creates a mock for assignBetToGroup upsert chain
// bet_group_assignments.upsert(...).select(...)
function createUpsertMock(resolveValue, tracker) {
  const upsertFn = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(resolveValue),
  });
  if (tracker) {
    upsertFn.mockImplementation((payload) => {
      tracker.push({ betId: payload.bet_id, groupId: payload.group_id });
      return {
        select: jest.fn().mockResolvedValue(resolveValue),
      };
    });
  }
  return { upsert: upsertFn };
}

// Helper: creates a mock for suggested_bets distributed_at update
// suggested_bets.update({distributed_at}).eq('id', betId).is('distributed_at', null)
function createDistributedAtUpdateMock() {
  return {
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        is: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  };
}

// Helper: creates a mock for loadGroupPostingTimes (groups.select.eq.single)
function createGroupPostingTimesMock(times) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: times ? { posting_schedule: { times } } : null,
          error: times ? null : { message: 'not found' },
        }),
      }),
    }),
  };
}

// Helper: creates a mock for getScheduledCountsPerTime
// bet_group_assignments.select('post_at').eq(...).not(...).neq(...)
function createScheduledCountsMock(data) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          neq: jest.fn().mockResolvedValue({ data: data || [], error: null }),
        }),
      }),
    }),
  };
}

/**
 * Setup supabase.from mock for runDistributeBets full flow.
 *
 * The new implementation calls from() on these tables in order:
 * 1. 'groups' — getActiveGroups
 * 2. 'bet_group_assignments' — rebalanceIfNeeded select (only if groups > 0)
 *    (optionally) 'bet_group_assignments' — rebalance delete
 * 3. 'bet_group_assignments' — getUndistributedBets step 1 (get assigned IDs)
 * 4. 'suggested_bets' — getUndistributedBets step 2 (query bets)
 * 5. 'bet_group_assignments' — getGroupBetCounts
 * 6. 'group_league_preferences' — getAllGroupLeaguePreferences
 * 7. For each group: 'groups' — loadGroupPostingTimes
 * 8. For each group: 'bet_group_assignments' — getScheduledCountsPerTime
 * 9. For each bet: 'bet_group_assignments' — assignBetToGroup upsert
 * 10. For each bet: 'suggested_bets' — update distributed_at
 */
function setupRunDistributeMock(groups, bets, assignedBets, opts = {}) {
  const { rebalanceAssignments = [], failBetIds = new Set() } = opts;

  supabase.from.mockImplementation((table) => {
    if (table === 'groups') {
      // Can be getActiveGroups (has .order) or loadGroupPostingTimes (has .single)
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            neq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: groups, error: null }),
            }),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'no schedule' },
            }),
          }),
        }),
      };
    }

    if (table === 'bet_group_assignments') {
      // Multiple callers use this table — return a flexible mock
      // that works for select('bet_id'), select('group_id'),
      // select('id, ...').neq('posting_status', 'posted'),
      // select('post_at').eq(...).not(...).neq(...),
      // upsert, and delete
      const bgaMock = {};

      // select() branches depending on what the caller does next
      bgaMock.select = jest.fn().mockReturnValue({
        // For getScheduledCountsPerTime: .eq().not().neq()
        eq: jest.fn().mockReturnValue({
          not: jest.fn().mockReturnValue({
            neq: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        // For rebalanceIfNeeded: .neq('posting_status', 'posted')
        neq: jest.fn().mockResolvedValue({
          data: rebalanceAssignments,
          error: null,
        }),
        // For getUndistributedBets step 1 or getGroupBetCounts:
        // .select('bet_id') resolves immediately — handled by mockResolvedValue below
        then: (resolve) => resolve({ data: [], error: null }),
        catch: () => {},
      });
      // Override select to also be directly resolvable for simple selects
      bgaMock.select.mockResolvedValue({ data: [], error: null });

      // For upsert (assignBetToGroup)
      bgaMock.upsert = jest.fn().mockImplementation((payload) => {
        if (assignedBets) {
          assignedBets.push({ betId: payload.bet_id, groupId: payload.group_id });
        }
        if (failBetIds.has(payload.bet_id)) {
          return {
            select: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Insert failed' },
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({
            data: [{
              id: `bga-${payload.bet_id}`,
              bet_id: payload.bet_id,
              group_id: payload.group_id,
              posting_status: 'ready',
              post_at: payload.post_at || null,
              created_at: new Date().toISOString(),
            }],
            error: null,
          }),
        };
      });

      // For delete (rebalance)
      bgaMock.delete = jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ error: null }),
      });

      return bgaMock;
    }

    if (table === 'suggested_bets') {
      // getUndistributedBets step 2 (full chain ending in .order) OR
      // distributed_at update (.update().eq().is())
      const sbMock = {};

      // For the select chain (getUndistributedBets)
      const chainObj = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: bets, error: null }),
      };
      sbMock.select = jest.fn().mockReturnValue(chainObj);

      // For update (distributed_at)
      sbMock.update = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      return sbMock;
    }

    if (table === 'group_league_preferences') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }

    // Default
    return createChainMock({ data: [], error: null });
  });
}

describe('distributeBets job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================
  // AC1 + AC7: Round-robin entre múltiplos grupos ativos
  // ===========================
  describe('AC1 + AC7: distribuição round-robin equilibrada', () => {
    test('6 apostas, 3 grupos → cada grupo recebe 2 apostas (Task 4.1)', async () => {
      const groups = createMockGroups(3);
      const bets = createMockBets(6);
      const assignedBets = [];

      setupRunDistributeMock(groups, bets, assignedBets);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(6);
      expect(result.data.groupCount).toBe(3);

      // Verify round-robin: each group gets 2
      const perGroup = {};
      assignedBets.forEach(({ groupId }) => {
        perGroup[groupId] = (perGroup[groupId] || 0) + 1;
      });
      expect(perGroup['group-uuid-1']).toBe(2);
      expect(perGroup['group-uuid-2']).toBe(2);
      expect(perGroup['group-uuid-3']).toBe(2);
    });

    test('7 apostas, 3 grupos → distribuição equilibrada com diferença máxima de 1 (Task 4.2)', async () => {
      const groups = createMockGroups(3);
      const bets = createMockBets(7);
      const assignedBets = [];

      setupRunDistributeMock(groups, bets, assignedBets);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(7);

      // Verify balanced: max diff of 1 between groups
      const perGroup = {};
      assignedBets.forEach(({ groupId }) => {
        perGroup[groupId] = (perGroup[groupId] || 0) + 1;
      });
      const counts = Object.values(perGroup);
      const maxDiff = Math.max(...counts) - Math.min(...counts);
      expect(maxDiff).toBeLessThanOrEqual(1);
    });
  });

  // ===========================
  // AC2: Grupo único recebe todas
  // ===========================
  describe('AC2: grupo único recebe todas', () => {
    test('5 apostas, 1 grupo → grupo recebe todas as 5 (Task 4.3)', async () => {
      const groups = createMockGroups(1);
      const bets = createMockBets(5);
      const assignedBets = [];

      setupRunDistributeMock(groups, bets, assignedBets);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(5);

      // All assigned to the single group
      const allSameGroup = assignedBets.every(b => b.groupId === 'group-uuid-1');
      expect(allSameGroup).toBe(true);
    });
  });

  // ===========================
  // AC3: Sem grupos ativos — nenhuma distribuição
  // ===========================
  describe('AC3: sem grupos ativos', () => {
    test('0 grupos ativos → nenhuma distribuição, alerta admin (Task 4.4)', async () => {
      setupRunDistributeMock([], []);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(0);
      expect(result.data.reason).toBe('no_active_groups');

      // Verify alertAdmin was called
      expect(alertAdmin).toHaveBeenCalledWith(
        'WARN',
        expect.stringContaining('Nenhum grupo ativo'),
        expect.stringContaining('Nenhum grupo ativo')
      );
    });
  });

  // ===========================
  // No bets to distribute
  // ===========================
  describe('sem apostas para distribuir', () => {
    test('0 apostas para distribuir → log info, sem erro (Task 4.5)', async () => {
      const groups = createMockGroups(3);

      setupRunDistributeMock(groups, []);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(0);
      expect(result.data.reason).toBe('no_bets_to_distribute');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[bets:distribute]'),
        expect.any(Object)
      );
    });
  });

  // ===========================
  // Robustez: falhas parciais devem retornar erro
  // ===========================
  describe('falhas parciais na distribuição', () => {
    test('retorna erro quando parte das atribuições falha', async () => {
      const groups = createMockGroups(2);
      const bets = createMockBets(3);
      const assignedBets = [];

      // bet-uuid-2 fails during upsert
      setupRunDistributeMock(groups, bets, assignedBets, {
        failBetIds: new Set(['bet-uuid-2']),
      });

      const result = await runDistributeBets();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PARTIAL_DISTRIBUTION_FAILURE');
      expect(result.data.distributed).toBe(2);
      expect(result.data.failed).toBe(1);
      expect(alertAdmin).toHaveBeenCalledWith(
        'ERROR',
        expect.stringContaining('Falhas na distribuição'),
        expect.stringContaining('Distribuição parcial')
      );
    });
  });

  // ===========================
  // AC6: Idempotência
  // ===========================
  describe('AC6: idempotência', () => {
    test('rodar 2x seguidas: segunda execução não redistribui (Task 4.6)', async () => {
      const groups = createMockGroups(2);
      const betsFirstRun = createMockBets(4);
      const assignedBets = [];
      let undistributedCallCount = 0;

      // We need a stateful mock: first run returns bets, second run returns empty
      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                neq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: groups, error: null }),
                }),
                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'n/a' } }),
              }),
            }),
          };
        }

        if (table === 'bet_group_assignments') {
          const bgaMock = {};
          bgaMock.select = jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                neq: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            neq: jest.fn().mockResolvedValue({ data: [], error: null }),
            then: (resolve) => resolve({ data: [], error: null }),
            catch: () => {},
          });
          bgaMock.select.mockResolvedValue({ data: [], error: null });

          bgaMock.upsert = jest.fn().mockImplementation((payload) => {
            assignedBets.push({ betId: payload.bet_id, groupId: payload.group_id });
            return {
              select: jest.fn().mockResolvedValue({
                data: [{ id: `bga-${payload.bet_id}`, bet_id: payload.bet_id, group_id: payload.group_id, posting_status: 'ready', post_at: null, created_at: new Date().toISOString() }],
                error: null,
              }),
            };
          });

          bgaMock.delete = jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ error: null }),
          });

          return bgaMock;
        }

        if (table === 'suggested_bets') {
          undistributedCallCount++;
          const currentBets = undistributedCallCount === 1 ? betsFirstRun : [];
          const chainObj = {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: currentBets, error: null }),
          };
          return {
            select: jest.fn().mockReturnValue(chainObj),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === 'group_league_preferences') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }

        return createChainMock({ data: [], error: null });
      });

      const firstRun = await runDistributeBets();
      const secondRun = await runDistributeBets();

      expect(firstRun.success).toBe(true);
      expect(firstRun.data.distributed).toBe(4);
      expect(secondRun.success).toBe(true);
      expect(secondRun.data.distributed).toBe(0);
      expect(secondRun.data.reason).toBe('no_bets_to_distribute');
      expect(assignedBets).toHaveLength(4);
    });

    test('apostas já distribuídas (group_id != NULL) são ignoradas pela query (Task 4.7)', async () => {
      // getUndistributedBets only returns bets with no junction table assignments
      // So if we return empty from the query, it means all bets are already distributed
      const groups = createMockGroups(3);

      setupRunDistributeMock(groups, []);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(0);
      expect(result.data.reason).toBe('no_bets_to_distribute');
    });

    test('assignBetToGroup não redistribui aposta já atribuída (Task 4.6)', async () => {
      // When upsert returns empty data (ignoreDuplicates), it means already assigned
      supabase.from.mockImplementation((table) => {
        if (table === 'bet_group_assignments') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [], // Empty = already distributed (ignoreDuplicates)
                error: null,
              }),
            }),
          };
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(true);
      expect(result.data.alreadyDistributed).toBe(true);
    });
  });

  // ===========================
  // AC1: Grupos pausados/inativos NÃO recebem
  // ===========================
  describe('AC1: grupos inativos excluídos', () => {
    test('grupos pausados/inativos NÃO recebem apostas (Task 4.8)', async () => {
      // getActiveGroups only queries WHERE status = 'active'
      // So paused/inactive groups are never returned
      const activeGroups = createMockGroups(2);
      const bets = createMockBets(4);
      const assignedBets = [];
      const eqMock = jest.fn();

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          const groupsMock = {
            select: jest.fn().mockReturnValue({
              eq: eqMock.mockReturnValue({
                neq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: activeGroups, error: null }),
                }),
                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'n/a' } }),
              }),
            }),
          };
          return groupsMock;
        }

        if (table === 'bet_group_assignments') {
          const bgaMock = {};
          bgaMock.select = jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                neq: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            neq: jest.fn().mockResolvedValue({ data: [], error: null }),
            then: (resolve) => resolve({ data: [], error: null }),
            catch: () => {},
          });
          bgaMock.select.mockResolvedValue({ data: [], error: null });
          bgaMock.upsert = jest.fn().mockImplementation((payload) => {
            assignedBets.push({ betId: payload.bet_id, groupId: payload.group_id });
            return {
              select: jest.fn().mockResolvedValue({
                data: [{ id: `bga-${payload.bet_id}`, bet_id: payload.bet_id, group_id: payload.group_id, posting_status: 'ready', post_at: null, created_at: new Date().toISOString() }],
                error: null,
              }),
            };
          });
          bgaMock.delete = jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ error: null }),
          });
          return bgaMock;
        }

        if (table === 'suggested_bets') {
          const chainObj = {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: bets, error: null }),
          };
          return {
            select: jest.fn().mockReturnValue(chainObj),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === 'group_league_preferences') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }

        return createChainMock({ data: [], error: null });
      });

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      // Only 2 active groups should have received bets
      expect(result.data.groupCount).toBe(2);
      expect(eqMock).toHaveBeenCalledWith('status', 'active');
    });
  });

  // ===========================
  // Unit tests for individual functions
  // ===========================
  describe('getActiveGroups', () => {
    test('retorna grupos ativos ordenados por created_at ASC', async () => {
      const groups = createMockGroups(3);
      const chain = createChainMock({ data: groups, error: null });

      supabase.from.mockImplementation(() => chain);

      const result = await getActiveGroups();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(supabase.from).toHaveBeenCalledWith('groups');
      expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    });

    test('retorna erro de DB graciosamente', async () => {
      supabase.from.mockImplementation(() =>
        createChainMock({ data: null, error: { message: 'DB error' } })
      );

      const result = await getActiveGroups();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('getUndistributedBets', () => {
    test('retorna apostas elegíveis sem group_id ordenadas por kickoff_time ASC com filtro de janela', async () => {
      const bets = createMockBets(5);

      // First call: bet_group_assignments → no assigned bet IDs
      // Second call: suggested_bets → returns bets
      supabase.from.mockImplementation((table) => {
        if (table === 'bet_group_assignments') {
          return createBgaSelectMock({ data: [], error: null });
        }
        if (table === 'suggested_bets') {
          const chain = createChainMock({ data: bets, error: null });
          return chain;
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await getUndistributedBets();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
      expect(supabase.from).toHaveBeenCalledWith('bet_group_assignments');
      expect(supabase.from).toHaveBeenCalledWith('suggested_bets');
    });
  });

  describe('distributeRoundRobin', () => {
    test('distribui bets de forma balanceada entre groups', () => {
      const bets = createMockBets(7);
      const groups = createMockGroups(3);

      const assignments = distributeRoundRobin(bets, groups);

      expect(assignments).toHaveLength(7);
      // With fair distribution, each group should get 2-3 bets (7/3 = 2.33)
      const countPerGroup = {};
      for (const a of assignments) {
        countPerGroup[a.groupId] = (countPerGroup[a.groupId] || 0) + 1;
      }
      // Max difference between any two groups should be at most 1
      const counts = Object.values(countPerGroup);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      // All bets assigned
      expect(assignments.every(a => a.betId && a.groupId)).toBe(true);
    });

    test('grupo único recebe todas as apostas', () => {
      const bets = createMockBets(5);
      const groups = createMockGroups(1);

      const assignments = distributeRoundRobin(bets, groups);

      expect(assignments).toHaveLength(5);
      assignments.forEach(a => {
        expect(a.groupId).toBe('group-uuid-1');
      });
    });

    test('retorna array vazio para bets vazio', () => {
      const groups = createMockGroups(3);
      const assignments = distributeRoundRobin([], groups);
      expect(assignments).toEqual([]);
    });
  });

  // ===========================
  // Janela temporal (getDistributionWindow)
  // ===========================
  describe('getDistributionWindow', () => {
    test('retorna startOfToday e endOfTomorrow como ISO strings', () => {
      const { startOfToday, endOfTomorrow } = getDistributionWindow();

      expect(typeof startOfToday).toBe('string');
      expect(typeof endOfTomorrow).toBe('string');

      const start = new Date(startOfToday);
      const end = new Date(endOfTomorrow);
      expect(start.getTime()).toBeLessThan(end.getTime());
    });

    test('janela cobre aproximadamente 2 dias', () => {
      const { startOfToday, endOfTomorrow } = getDistributionWindow();
      const start = new Date(startOfToday);
      const end = new Date(endOfTomorrow);
      const diffHours = (end - start) / (1000 * 60 * 60);
      // Should be ~47-48 hours (today 00:00 to tomorrow 23:59:59)
      expect(diffHours).toBeGreaterThanOrEqual(47);
      expect(diffHours).toBeLessThanOrEqual(49);
    });
  });

  // ===========================
  // Janela temporal na distribuição
  // ===========================
  describe('janela temporal: filtra apostas por kickoff_time', () => {
    test('apostas com kickoff hoje/amanhã são incluídas, apostas distantes são excluídas pela query', async () => {
      const todayBets = createMockBets(3);

      supabase.from.mockImplementation((table) => {
        if (table === 'bet_group_assignments') {
          return createBgaSelectMock({ data: [], error: null });
        }
        if (table === 'suggested_bets') {
          const chain = createChainMock({ data: todayBets, error: null });
          return chain;
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await getUndistributedBets();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    test('sem apostas na janela → retorna lista vazia', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'bet_group_assignments') {
          return createBgaSelectMock({ data: [], error: null });
        }
        if (table === 'suggested_bets') {
          return createChainMock({ data: [], error: null });
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await getUndistributedBets();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  // ===========================
  // Rebalanceamento (rebalanceIfNeeded) — now uses bet_group_assignments
  // ===========================
  describe('rebalanceIfNeeded', () => {
    test('todos os grupos ativos têm apostas → sem rebalanceamento', async () => {
      const groups = createMockGroups(2);
      const assignments = [
        { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-uuid-1', posting_status: 'ready' },
        { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-uuid-2', posting_status: 'ready' },
        { id: 'bga-3', bet_id: 'bet-3', group_id: 'group-uuid-1', posting_status: 'ready' },
      ];

      supabase.from.mockImplementation(() =>
        createRebalanceSelectMock({ data: assignments, error: null })
      );

      const result = await rebalanceIfNeeded(groups);

      expect(result.rebalanced).toBe(false);
    });

    test('grupo novo sem apostas → undistribute todas e redistribuir', async () => {
      const groups = createMockGroups(3); // 3 groups but bets only in 2
      const assignments = [
        { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-uuid-1', posting_status: 'ready' },
        { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-uuid-2', posting_status: 'ready' },
        { id: 'bga-3', bet_id: 'bet-3', group_id: 'group-uuid-1', posting_status: 'ready' },
        { id: 'bga-4', bet_id: 'bet-4', group_id: 'group-uuid-2', posting_status: 'ready' },
      ];
      let callCount = 0;

      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // select → neq: return assignments (only groups 1 and 2 have bets)
          return createRebalanceSelectMock({ data: assignments, error: null });
        }
        // delete → in: delete all non-posted assignments
        return createRebalanceDeleteMock({ error: null });
      });

      const result = await rebalanceIfNeeded(groups);

      expect(result.rebalanced).toBe(true);
      expect(result.undistributed).toBe(4);
    });

    test('apostas já postadas NÃO são undistribuídas (safety check)', async () => {
      const groups = createMockGroups(3);
      // The query filters .neq('posting_status', 'posted'), so posted assignments never appear
      const nonPostedAssignments = [
        { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-uuid-1', posting_status: 'ready' },
        { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-uuid-2', posting_status: 'ready' },
      ];
      // group-uuid-3 has no non-posted assignments, triggering rebalance
      let callCount = 0;
      const deleteMock = jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ error: null }),
      });

      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createRebalanceSelectMock({ data: nonPostedAssignments, error: null });
        }
        return { delete: deleteMock };
      });

      const result = await rebalanceIfNeeded(groups);

      expect(result.rebalanced).toBe(true);
      // The select query itself filters .neq('posting_status', 'posted')
      // so only non-posted assignments are in the delete set
      expect(result.undistributed).toBe(2);
    });

    test('nenhuma aposta distribuída na janela → sem rebalanceamento', async () => {
      const groups = createMockGroups(2);

      supabase.from.mockImplementation(() =>
        createRebalanceSelectMock({ data: [], error: null })
      );

      const result = await rebalanceIfNeeded(groups);

      expect(result.rebalanced).toBe(false);
    });

    test('erro de DB no rebalance → retorna erro, não quebra o fluxo', async () => {
      const groups = createMockGroups(2);

      supabase.from.mockImplementation(() =>
        createRebalanceSelectMock({ data: null, error: { message: 'DB connection lost' } })
      );

      const result = await rebalanceIfNeeded(groups);

      expect(result.rebalanced).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('DB connection lost');
    });

    test('erro no update do rebalance → retorna erro sem quebrar', async () => {
      const groups = createMockGroups(3);
      const assignments = [
        { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-uuid-1', posting_status: 'ready' },
        { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-uuid-2', posting_status: 'ready' },
      ];
      let callCount = 0;

      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createRebalanceSelectMock({ data: assignments, error: null });
        }
        // Delete fails
        return createRebalanceDeleteMock({ error: { message: 'Delete failed' } });
      });

      const result = await rebalanceIfNeeded(groups);

      expect(result.rebalanced).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================
  // Integração: rebalanceamento no runDistributeBets
  // ===========================
  describe('integração: rebalanceamento + distribuição', () => {
    test('grupo novo adicionado → rebalanceia e redistribui entre todos os grupos', async () => {
      const groups = createMockGroups(3);
      const reundistributedBets = createMockBets(3);
      const assignedBets = [];

      // Rebalance data: bets only in groups 1 and 2 (group 3 is new, no bets)
      const rebalanceData = [
        { id: 'bga-1', bet_id: 'bet-1', group_id: 'group-uuid-1', posting_status: 'ready' },
        { id: 'bga-2', bet_id: 'bet-2', group_id: 'group-uuid-2', posting_status: 'ready' },
        { id: 'bga-3', bet_id: 'bet-3', group_id: 'group-uuid-1', posting_status: 'ready' },
      ];

      let bgaCallCount = 0;

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                neq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: groups, error: null }),
                }),
                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'n/a' } }),
              }),
            }),
          };
        }

        if (table === 'bet_group_assignments') {
          bgaCallCount++;
          const bgaMock = {};

          if (bgaCallCount === 1) {
            // rebalanceIfNeeded select: .select(...).neq('posting_status', 'posted')
            bgaMock.select = jest.fn().mockReturnValue({
              neq: jest.fn().mockResolvedValue({ data: rebalanceData, error: null }),
            });
            return bgaMock;
          }

          if (bgaCallCount === 2) {
            // rebalanceIfNeeded delete: .delete().in('id', [...])
            bgaMock.delete = jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ error: null }),
            });
            return bgaMock;
          }

          // After rebalance: getUndistributedBets, getGroupBetCounts, getScheduledCountsPerTime, upserts
          bgaMock.select = jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                neq: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            neq: jest.fn().mockResolvedValue({ data: [], error: null }),
            then: (resolve) => resolve({ data: [], error: null }),
            catch: () => {},
          });
          bgaMock.select.mockResolvedValue({ data: [], error: null });

          bgaMock.upsert = jest.fn().mockImplementation((payload) => {
            assignedBets.push({ betId: payload.bet_id, groupId: payload.group_id });
            return {
              select: jest.fn().mockResolvedValue({
                data: [{ id: `bga-${payload.bet_id}`, bet_id: payload.bet_id, group_id: payload.group_id, posting_status: 'ready', post_at: null, created_at: new Date().toISOString() }],
                error: null,
              }),
            };
          });

          bgaMock.delete = jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ error: null }),
          });

          return bgaMock;
        }

        if (table === 'suggested_bets') {
          const chainObj = {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: reundistributedBets, error: null }),
          };
          return {
            select: jest.fn().mockReturnValue(chainObj),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }

        if (table === 'group_league_preferences') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }

        return createChainMock({ data: [], error: null });
      });

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(3);
      expect(result.data.groupCount).toBe(3);
      // Verify rebalance was logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Rebalanceamento executado'),
      );
    });
  });

  // ===========================
  // assignBetToGroup — now uses upsert on bet_group_assignments
  // ===========================
  describe('assignBetToGroup', () => {
    test('atribui aposta com sucesso', async () => {
      let calledTable = null;

      supabase.from.mockImplementation((table) => {
        calledTable = table;
        if (table === 'bet_group_assignments') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [{ id: 'bga-1', bet_id: 'bet-1', group_id: 'group-1', posting_status: 'ready', post_at: null, created_at: '2026-02-10T00:00:00.000Z' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'suggested_bets') {
          return createDistributedAtUpdateMock();
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(true);
      expect(result.data.bet_id).toBe('bet-1');
      expect(result.data.group_id).toBe('group-1');
    });

    test('retorna alreadyDistributed quando aposta já foi atribuída', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'bet_group_assignments') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [], // Empty = already distributed (ignoreDuplicates)
                error: null,
              }),
            }),
          };
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(true);
      expect(result.data.alreadyDistributed).toBe(true);
    });

    test('retorna erro em falha de DB', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'bet_group_assignments') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Insert failed' },
              }),
            }),
          };
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISTRIBUTION_ERROR');
    });
  });
});

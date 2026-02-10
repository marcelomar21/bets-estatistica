/**
 * Tests for distributeBets job — Story 5.1: Distribuição Round-robin de Apostas entre Grupos
 * Tests: round-robin distribution, single group, no groups, idempotency, balanced distribution,
 *        inactive groups excluded, no bets to distribute
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

// Helper to create mock bets
function createMockBets(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bet-uuid-${i + 1}`,
    match_id: `match-${i + 1}`,
    elegibilidade: 'elegivel',
    group_id: null,
    distributed_at: null,
    bet_status: 'ready',
    kickoff_time: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
  }));
}

// Helper to create a chainable mock
function createChainMock(resolveValue) {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue(resolveValue);
  return chain;
}

// Helper to create an update chain mock that tracks assignments
function createUpdateChainMock(assignedBets) {
  return jest.fn().mockImplementation((updateData) => {
    const innerChain = {};
    innerChain._betId = null;
    innerChain.eq = jest.fn().mockImplementation((col, val) => {
      if (col === 'id') innerChain._betId = val;
      return innerChain;
    });
    innerChain.is = jest.fn().mockReturnValue(innerChain);
    innerChain.select = jest.fn().mockImplementation(() => {
      if (assignedBets) {
        assignedBets.push({
          betId: innerChain._betId,
          groupId: updateData.group_id,
        });
      }
      return Promise.resolve({
        data: [{ id: innerChain._betId, group_id: updateData.group_id, distributed_at: updateData.distributed_at }],
        error: null,
      });
    });
    return innerChain;
  });
}

// Helper to set up supabase mock for runDistributeBets
function setupRunDistributeMock(groups, bets, assignedBets) {
  supabase.from.mockImplementation((table) => {
    if (table === 'groups') {
      return createChainMock({ data: groups, error: null });
    }
    if (table === 'suggested_bets') {
      const chain = createChainMock({ data: bets, error: null });
      if (assignedBets !== undefined) {
        chain.update = createUpdateChainMock(assignedBets);
      }
      return chain;
    }
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

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return createChainMock({ data: groups, error: null });
        }

        if (table === 'suggested_bets') {
          const chain = createChainMock({ data: bets, error: null });
          chain.update = jest.fn().mockImplementation((updateData) => {
            const innerChain = {};
            innerChain._betId = null;
            innerChain.eq = jest.fn().mockImplementation((col, val) => {
              if (col === 'id') innerChain._betId = val;
              return innerChain;
            });
            innerChain.is = jest.fn().mockReturnValue(innerChain);
            innerChain.select = jest.fn().mockImplementation(() => {
              if (innerChain._betId === 'bet-uuid-2') {
                return Promise.resolve({ data: null, error: { message: 'Update failed' } });
              }
              return Promise.resolve({
                data: [{ id: innerChain._betId, group_id: updateData.group_id, distributed_at: updateData.distributed_at }],
                error: null,
              });
            });
            return innerChain;
          });
          return chain;
        }

        return createChainMock({ data: [], error: null });
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
      let undistributedFetchCount = 0;

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return createChainMock({ data: groups, error: null });
        }

        if (table === 'suggested_bets') {
          const chain = {};
          chain.select = jest.fn().mockReturnValue(chain);
          chain.eq = jest.fn().mockReturnValue(chain);
          chain.is = jest.fn().mockReturnValue(chain);
          chain.neq = jest.fn().mockReturnValue(chain);
          chain.order = jest.fn().mockImplementation(() => {
            undistributedFetchCount++;
            return Promise.resolve({
              data: undistributedFetchCount === 1 ? betsFirstRun : [],
              error: null,
            });
          });
          chain.update = createUpdateChainMock(assignedBets);
          return chain;
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
      // getUndistributedBets only returns bets with group_id IS NULL
      // So if we return empty from the query, it means all bets are already distributed
      const groups = createMockGroups(3);

      setupRunDistributeMock(groups, []);

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      expect(result.data.distributed).toBe(0);
      expect(result.data.reason).toBe('no_bets_to_distribute');
    });

    test('assignBetToGroup não redistribui aposta já atribuída (Task 4.6)', async () => {
      // When group_id IS NULL check fails, update returns empty data
      supabase.from.mockImplementation(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [], // Empty = already distributed
                error: null,
              }),
            }),
          }),
        }),
      }));

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
      const groupsChain = createChainMock({ data: activeGroups, error: null });

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return groupsChain;
        }
        if (table === 'suggested_bets') {
          const chain = createChainMock({ data: bets, error: null });
          chain.update = createUpdateChainMock(assignedBets);
          return chain;
        }
        return createChainMock({ data: [], error: null });
      });

      const result = await runDistributeBets();

      expect(result.success).toBe(true);
      // Only 2 active groups should have received bets
      expect(result.data.groupCount).toBe(2);
      expect(groupsChain.eq).toHaveBeenCalledWith('status', 'active');
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
    test('retorna apostas elegíveis sem group_id ordenadas por kickoff_time ASC', async () => {
      const bets = createMockBets(5);

      supabase.from.mockImplementation(() =>
        createChainMock({ data: bets, error: null })
      );

      const result = await getUndistributedBets();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
      expect(supabase.from).toHaveBeenCalledWith('suggested_bets');
    });
  });

  describe('distributeRoundRobin', () => {
    test('distribui ciclicamente bets entre groups', () => {
      const bets = createMockBets(7);
      const groups = createMockGroups(3);

      const assignments = distributeRoundRobin(bets, groups);

      expect(assignments).toHaveLength(7);
      // bet[0] -> group[0], bet[1] -> group[1], bet[2] -> group[2], bet[3] -> group[0], ...
      expect(assignments[0]).toEqual({ betId: 'bet-uuid-1', groupId: 'group-uuid-1' });
      expect(assignments[1]).toEqual({ betId: 'bet-uuid-2', groupId: 'group-uuid-2' });
      expect(assignments[2]).toEqual({ betId: 'bet-uuid-3', groupId: 'group-uuid-3' });
      expect(assignments[3]).toEqual({ betId: 'bet-uuid-4', groupId: 'group-uuid-1' });
      expect(assignments[4]).toEqual({ betId: 'bet-uuid-5', groupId: 'group-uuid-2' });
      expect(assignments[5]).toEqual({ betId: 'bet-uuid-6', groupId: 'group-uuid-3' });
      expect(assignments[6]).toEqual({ betId: 'bet-uuid-7', groupId: 'group-uuid-1' });
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

  describe('assignBetToGroup', () => {
    test('atribui aposta com sucesso', async () => {
      supabase.from.mockImplementation(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [{ id: 'bet-1', group_id: 'group-1', distributed_at: '2026-02-10T00:00:00.000Z' }],
                error: null,
              }),
            }),
          }),
        }),
      }));

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('bet-1');
      expect(result.data.group_id).toBe('group-1');
    });

    test('retorna alreadyDistributed quando aposta já foi atribuída', async () => {
      supabase.from.mockImplementation(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }));

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(true);
      expect(result.data.alreadyDistributed).toBe(true);
    });

    test('retorna erro em falha de DB', async () => {
      supabase.from.mockImplementation(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
              }),
            }),
          }),
        }),
      }));

      const result = await assignBetToGroup('bet-1', 'group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISTRIBUTION_ERROR');
    });
  });
});

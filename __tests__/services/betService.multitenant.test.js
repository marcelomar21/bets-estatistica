/**
 * Tests for betService.js — Story 5.1: Multi-tenant group_id filtering
 * Tests: getFilaStatus with GROUP_ID, getFilaStatus without GROUP_ID (fallback),
 *        getEligibleBets, getBetsReadyForPosting, getActiveBetsForRepost, getAvailableBets
 */

let mockConfig;

// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock config with mutable membership.groupId
jest.mock('../../lib/config', () => {
  mockConfig = {
    betting: {
      minOdds: 1.60,
      maxActiveBets: 3,
      maxDaysAhead: 2,
    },
    membership: {
      groupId: null, // Default: single-tenant
    },
  };
  return { config: mockConfig };
});

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const {
  getFilaStatus,
  getEligibleBets,
  getBetsReadyForPosting,
  getActiveBetsForRepost,
  getAvailableBets,
} = require('../../bot/services/betService');
const { supabase } = require('../../lib/supabase');

// Helper to create a chainable mock that tracks method calls
function createTrackingChainMock(resolveValue) {
  const calls = [];
  const chain = {};
  chain._calls = calls;
  chain.select = jest.fn().mockImplementation((...args) => { calls.push({ method: 'select', args }); return chain; });
  chain.eq = jest.fn().mockImplementation((...args) => { calls.push({ method: 'eq', args }); return chain; });
  chain.is = jest.fn().mockImplementation((...args) => { calls.push({ method: 'is', args }); return chain; });
  chain.neq = jest.fn().mockImplementation((...args) => { calls.push({ method: 'neq', args }); return chain; });
  chain.in = jest.fn().mockImplementation((...args) => { calls.push({ method: 'in', args }); return chain; });
  chain.gte = jest.fn().mockImplementation((...args) => { calls.push({ method: 'gte', args }); return chain; });
  chain.lte = jest.fn().mockImplementation((...args) => { calls.push({ method: 'lte', args }); return chain; });
  chain.not = jest.fn().mockImplementation((...args) => { calls.push({ method: 'not', args }); return chain; });
  chain.order = jest.fn().mockImplementation((...args) => { calls.push({ method: 'order', args }); return chain; });
  chain.limit = jest.fn().mockImplementation((...args) => {
    calls.push({ method: 'limit', args });
    return Promise.resolve(resolveValue);
  });
  // For queries without .limit() at the end (like getActiveBetsForRepost, getAvailableBets)
  // order is the terminal call, so we need to handle both patterns
  // Override: make order return a promise if it's the last call
  chain.then = (resolve) => resolve(resolveValue);
  chain.catch = () => chain;
  return chain;
}

describe('betService multi-tenant filtering (Story 5.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.membership.groupId = null; // Reset to single-tenant
  });

  // ===========================
  // AC4: getFilaStatus com GROUP_ID retorna apenas apostas do grupo
  // ===========================
  describe('AC4: getFilaStatus com GROUP_ID (Task 4.9)', () => {
    test('com GROUP_ID definido → adiciona filtro .eq(group_id) nas queries', async () => {
      mockConfig.membership.groupId = 'group-uuid-123';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.not = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        // Make chain thenable for queries ending with .order()
        chain.then = (resolve) => resolve({ data: [], error: null });
        chain.catch = () => chain;
        return chain;
      });

      await getFilaStatus();

      // Verify that .eq('group_id', 'group-uuid-123') was called
      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === 'group-uuid-123');
      // Deve filtrar em: ativas + novas + contagem (allBets)
      expect(groupIdFilters.length).toBeGreaterThanOrEqual(3);

      // Não pode haver filtro de group_id com outro valor
      const otherGroupFilters = eqCalls.filter(c => c.col === 'group_id' && c.val !== 'group-uuid-123');
      expect(otherGroupFilters).toHaveLength(0);
    });

    test('groupIdParam explícito deve sobrescrever config.membership.groupId', async () => {
      mockConfig.membership.groupId = 'group-config';
      const explicitGroupId = 'group-param-override';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.not = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        chain.then = (resolve) => resolve({ data: [], error: null });
        chain.catch = () => chain;
        return chain;
      });

      await getFilaStatus(explicitGroupId);

      const explicitGroupFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === explicitGroupId);
      expect(explicitGroupFilters.length).toBeGreaterThanOrEqual(3);

      const configGroupFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === 'group-config');
      expect(configGroupFilters).toHaveLength(0);
    });
  });

  // ===========================
  // AC5: getFilaStatus sem GROUP_ID retorna todas as apostas (fallback)
  // ===========================
  describe('AC5: getFilaStatus sem GROUP_ID (Task 4.10)', () => {
    test('sem GROUP_ID → NÃO adiciona filtro de group_id', async () => {
      mockConfig.membership.groupId = null;

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.not = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        chain.then = (resolve) => resolve({ data: [], error: null });
        chain.catch = () => chain;
        return chain;
      });

      await getFilaStatus();

      // Verify no .eq('group_id', ...) was called
      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id');
      expect(groupIdFilters).toHaveLength(0);
    });

    test('groupIdParam=null explícito desabilita filtro mesmo com config.membership.groupId preenchido', async () => {
      mockConfig.membership.groupId = 'group-from-config';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.not = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        chain.then = (resolve) => resolve({ data: [], error: null });
        chain.catch = () => chain;
        return chain;
      });

      await getFilaStatus(null);

      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id');
      expect(groupIdFilters).toHaveLength(0);
    });
  });

  // ===========================
  // getEligibleBets multi-tenant
  // ===========================
  describe('getEligibleBets multi-tenant', () => {
    test('com GROUP_ID → filtra por group_id', async () => {
      mockConfig.membership.groupId = 'group-uuid-abc';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.in = jest.fn().mockReturnValue(chain);
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      });

      await getEligibleBets();

      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === 'group-uuid-abc');
      expect(groupIdFilters).toHaveLength(1);
    });

    test('sem GROUP_ID → sem filtro de group_id', async () => {
      mockConfig.membership.groupId = null;

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.in = jest.fn().mockReturnValue(chain);
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      });

      await getEligibleBets();

      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id');
      expect(groupIdFilters).toHaveLength(0);
    });
  });

  // ===========================
  // getBetsReadyForPosting multi-tenant
  // ===========================
  describe('getBetsReadyForPosting multi-tenant', () => {
    test('com GROUP_ID → filtra por group_id', async () => {
      mockConfig.membership.groupId = 'group-uuid-xyz';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.not = jest.fn().mockReturnValue(chain);
        chain.in = jest.fn().mockReturnValue(chain);
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      });

      await getBetsReadyForPosting();

      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === 'group-uuid-xyz');
      expect(groupIdFilters).toHaveLength(1);
    });
  });

  // ===========================
  // getActiveBetsForRepost multi-tenant
  // ===========================
  describe('getActiveBetsForRepost multi-tenant', () => {
    test('com GROUP_ID → filtra por group_id', async () => {
      mockConfig.membership.groupId = 'group-uuid-repost';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.lte = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        chain.then = (resolve) => resolve({ data: [], error: null });
        chain.catch = () => chain;
        return chain;
      });

      await getActiveBetsForRepost();

      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === 'group-uuid-repost');
      expect(groupIdFilters).toHaveLength(1);
    });
  });

  // ===========================
  // getAvailableBets multi-tenant
  // ===========================
  describe('getAvailableBets multi-tenant', () => {
    test('com GROUP_ID → filtra por group_id', async () => {
      mockConfig.membership.groupId = 'group-uuid-avail';

      const eqCalls = [];

      supabase.from.mockImplementation(() => {
        const chain = {};
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockImplementation((col, val) => {
          eqCalls.push({ col, val });
          return chain;
        });
        chain.in = jest.fn().mockReturnValue(chain);
        chain.gte = jest.fn().mockReturnValue(chain);
        chain.order = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
        chain.then = (resolve) => resolve({ data: [], error: null });
        chain.catch = () => chain;
        return chain;
      });

      await getAvailableBets();

      const groupIdFilters = eqCalls.filter(c => c.col === 'group_id' && c.val === 'group-uuid-avail');
      expect(groupIdFilters).toHaveLength(1);
    });
  });
});

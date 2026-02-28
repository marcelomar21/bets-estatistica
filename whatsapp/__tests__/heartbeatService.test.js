// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock alertService
jest.mock('../../bot/services/alertService', () => ({
  alertAdmin: jest.fn().mockResolvedValue(undefined),
}));

// Mock failoverService
jest.mock('../services/failoverService', () => ({
  handleFailover: jest.fn().mockResolvedValue({ success: true, data: {} }),
}));

// Mock supabase
const mockSupabase = { from: jest.fn() };

// Helper to build chainable mock
function buildChain(resolveValue) {
  const chain = {};
  const methods = ['select', 'update', 'insert', 'delete', 'eq', 'is', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(resolveValue));
  // Make chain itself a thenable for non-single terminal calls
  chain.then = (resolve) => resolve(resolveValue);
  return chain;
}

jest.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

// Set up default mock behavior
function setupDefaultMocks() {
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'whatsapp_numbers') {
      // select().eq().single() → returns group_id + phone
      const chain = buildChain({ data: { group_id: 'group-1', phone_number: '+5511111' }, error: null });
      // update().eq() → returns success
      chain.update = jest.fn(() => {
        const uChain = {};
        uChain.eq = jest.fn(() => Promise.resolve({ error: null }));
        return uChain;
      });
      return chain;
    }
    if (table === 'bot_health') {
      const chain = buildChain({ data: [], error: null });
      // select().eq().eq().limit() → returns empty array (no existing row) or one row
      // For limit(), resolve directly as Promise
      chain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }));
      // insert() → success
      chain.insert = jest.fn(() => Promise.resolve({ error: null }));
      // update().eq() → success
      chain.update = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      }));
      return chain;
    }
    return buildChain({ data: null, error: null });
  });
}

// Mock clientRegistry — set up BEFORE requiring heartbeatService
const mockClients = new Map();
jest.mock('../clientRegistry', () => ({
  clients: mockClients,
}));

const {
  runHeartbeatCycle,
  resetFailureCounts,
  getFailureCounts,
  UNHEALTHY_THRESHOLD,
  FAILOVER_THRESHOLD,
} = require('../services/heartbeatService');

const { handleFailover } = require('../services/failoverService');
const { alertAdmin } = require('../../bot/services/alertService');
const logger = require('../../lib/logger');

// Helper to create mock client
function createMockClient(numberId, phone, connected) {
  return {
    getStats: () => ({
      numberId,
      phone,
      connected,
      reconnectAttempt: 0,
      totalReconnects: 0,
    }),
  };
}

describe('heartbeatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClients.clear();
    resetFailureCounts();
    setupDefaultMocks();
  });

  describe('runHeartbeatCycle', () => {
    it('returns zero counts when no clients', async () => {
      const result = await runHeartbeatCycle();
      expect(result).toEqual({ checked: 0, healthy: 0, unhealthy: 0, failovers: 0 });
    });

    it('records healthy heartbeat for connected client', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', true));

      const result = await runHeartbeatCycle();

      expect(result.checked).toBe(1);
      expect(result.healthy).toBe(1);
      expect(result.unhealthy).toBe(0);
      // Verify bot_health was written to
      expect(mockSupabase.from).toHaveBeenCalledWith('bot_health');
    });

    it('records offline heartbeat for disconnected client', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      const result = await runHeartbeatCycle();

      expect(result.checked).toBe(1);
      expect(result.unhealthy).toBe(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('bot_health');
    });

    it('tracks consecutive failures across cycles', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      await runHeartbeatCycle();
      expect(getFailureCounts().get('num-1')).toBe(1);

      await runHeartbeatCycle();
      expect(getFailureCounts().get('num-1')).toBe(2);
    });

    it('resets failure counter when client reconnects', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));
      await runHeartbeatCycle();
      await runHeartbeatCycle();
      expect(getFailureCounts().get('num-1')).toBe(2);

      // Client reconnects
      mockClients.set('num-1', createMockClient('num-1', '+5511111', true));
      await runHeartbeatCycle();
      expect(getFailureCounts().has('num-1')).toBe(false);
    });

    it('marks unhealthy after UNHEALTHY_THRESHOLD consecutive failures', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      for (let i = 0; i < UNHEALTHY_THRESHOLD; i++) {
        await runHeartbeatCycle();
      }

      expect(logger.warn).toHaveBeenCalledWith(
        '[heartbeat] Number unhealthy — 3 consecutive failures',
        expect.objectContaining({ numberId: 'num-1', consecutiveFailures: 3 }),
      );
      expect(alertAdmin).toHaveBeenCalledWith(
        expect.stringContaining('perdeu conexao'),
      );
    });

    it('does NOT alert before UNHEALTHY_THRESHOLD', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      for (let i = 0; i < UNHEALTHY_THRESHOLD - 1; i++) {
        await runHeartbeatCycle();
      }

      expect(alertAdmin).not.toHaveBeenCalled();
    });

    it('triggers failover after FAILOVER_THRESHOLD consecutive failures', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      for (let i = 0; i < FAILOVER_THRESHOLD; i++) {
        await runHeartbeatCycle();
      }

      expect(handleFailover).toHaveBeenCalledWith('num-1', 'group-1', 'unhealthy');
    });

    it('does NOT trigger failover before FAILOVER_THRESHOLD', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      for (let i = 0; i < FAILOVER_THRESHOLD - 1; i++) {
        await runHeartbeatCycle();
      }

      expect(handleFailover).not.toHaveBeenCalled();
    });

    it('handles multiple clients independently', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', true));
      mockClients.set('num-2', createMockClient('num-2', '+5522222', false));

      const result = await runHeartbeatCycle();

      expect(result.checked).toBe(2);
      expect(result.healthy).toBe(1);
      expect(result.unhealthy).toBe(1);
      expect(getFailureCounts().has('num-1')).toBe(false);
      expect(getFailureCounts().get('num-2')).toBe(1);
    });

    it('clears failure count after successful failover', async () => {
      handleFailover.mockResolvedValue({ success: true, data: {} });
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));

      for (let i = 0; i < FAILOVER_THRESHOLD; i++) {
        await runHeartbeatCycle();
      }

      expect(getFailureCounts().has('num-1')).toBe(false);
    });
  });

  describe('resetFailureCounts', () => {
    it('clears all failure counters', async () => {
      mockClients.set('num-1', createMockClient('num-1', '+5511111', false));
      await runHeartbeatCycle();
      expect(getFailureCounts().size).toBe(1);

      resetFailureCounts();
      expect(getFailureCounts().size).toBe(0);
    });
  });

  describe('constants', () => {
    it('UNHEALTHY_THRESHOLD is 3', () => {
      expect(UNHEALTHY_THRESHOLD).toBe(3);
    });

    it('FAILOVER_THRESHOLD is 5', () => {
      expect(FAILOVER_THRESHOLD).toBe(5);
    });
  });
});

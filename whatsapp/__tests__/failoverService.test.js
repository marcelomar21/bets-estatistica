// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock numberPoolService
jest.mock('../pool/numberPoolService', () => ({
  handleBan: jest.fn(),
  checkPoolHealth: jest.fn(),
}));

// Mock alertService
jest.mock('../../bot/services/alertService', () => ({
  alertAdmin: jest.fn().mockResolvedValue(undefined),
}));

// Build chainable supabase mock
const mockSupabase = { from: jest.fn() };

jest.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

const { handleFailover } = require('../services/failoverService');
const { handleBan, checkPoolHealth } = require('../pool/numberPoolService');
const { alertAdmin } = require('../../bot/services/alertService');
const logger = require('../../lib/logger');

// Helper to create chainable mock
function createChain(resolveValue) {
  const chain = {};
  const terminalMethods = ['single'];
  const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'is', 'order', 'limit'];
  for (const m of chainMethods) {
    chain[m] = jest.fn(() => chain);
  }
  for (const m of terminalMethods) {
    chain[m] = jest.fn(() => Promise.resolve(resolveValue));
  }
  return chain;
}

describe('failoverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleFailover', () => {
    it('returns INVALID_INPUT when numberId is missing', async () => {
      const result = await handleFailover(null, 'group-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_INPUT');
    });

    it('returns INVALID_INPUT when groupId is missing', async () => {
      const result = await handleFailover('num-1', null);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_INPUT');
    });

    it('returns error when handleBan fails', async () => {
      handleBan.mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'db fail' } });

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
      expect(handleBan).toHaveBeenCalledWith('num-1');
    });

    it('alerts admin when no backup is available', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });

      // Query for backups returns empty
      const backupChain = createChain({ data: [], error: null });
      // Override: limit should resolve directly (not via single)
      backupChain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }));
      mockSupabase.from.mockReturnValue(backupChain);

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_BACKUP');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('SEM BACKUP'));
    });

    it('promotes backup and allocates new backup from pool (happy path)', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });
      checkPoolHealth.mockResolvedValue({ success: true, data: { available: 3, threshold: 5, healthy: false } });

      let callCount = 0;
      mockSupabase.from.mockImplementation((table) => {
        callCount++;
        if (callCount === 1) {
          // Query backups
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({
            data: [{ id: 'backup-1', phone_number: '+5522222', role: 'backup' }],
            error: null,
          }));
          return chain;
        }
        if (callCount === 2) {
          // Promote backup to active
          const chain = createChain({
            data: { id: 'backup-1', phone_number: '+5522222', role: 'active', status: 'active' },
            error: null,
          });
          return chain;
        }
        if (callCount === 3) {
          // Query pool for new backup
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({
            data: [{ id: 'pool-1', phone_number: '+5533333' }],
            error: null,
          }));
          return chain;
        }
        if (callCount === 4) {
          // Allocate new backup
          const chain = createChain({
            data: { id: 'pool-1', phone_number: '+5533333', role: 'backup', status: 'backup' },
            error: null,
          });
          return chain;
        }
        return createChain({ data: null, error: null });
      });

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(true);
      expect(result.data.bannedNumber).toBe('+5511111');
      expect(result.data.promotedNumber).toBe('+5522222');
      expect(result.data.promotedId).toBe('backup-1');
      expect(result.data.newBackup).toBe('+5533333');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('FAILOVER AUTOMATICO EXECUTADO'));
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('+5522222'));
    });

    it('promotes backup but pool is empty (no new backup allocated)', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });
      checkPoolHealth.mockResolvedValue({ success: true, data: { available: 0, threshold: 5, healthy: false } });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Query backups
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({
            data: [{ id: 'backup-1', phone_number: '+5522222', role: 'backup' }],
            error: null,
          }));
          return chain;
        }
        if (callCount === 2) {
          // Promote backup
          return createChain({
            data: { id: 'backup-1', phone_number: '+5522222', role: 'active', status: 'active' },
            error: null,
          });
        }
        if (callCount === 3) {
          // Query pool — empty
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }));
          return chain;
        }
        return createChain({ data: null, error: null });
      });

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(true);
      expect(result.data.newBackup).toBeNull();
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('Nenhum backup foi alocado'));
    });

    it('returns PROMOTE_FAILED when backup promotion fails', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Query backups
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({
            data: [{ id: 'backup-1', phone_number: '+5522222', role: 'backup' }],
            error: null,
          }));
          return chain;
        }
        if (callCount === 2) {
          // Promote fails
          return createChain({ data: null, error: { message: 'conflict' } });
        }
        return createChain({ data: null, error: null });
      });

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PROMOTE_FAILED');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('ERRO DE FAILOVER'));
    });

    it('returns DB_ERROR when backup query fails', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });

      const chain = createChain(null);
      chain.limit = jest.fn(() => Promise.resolve({ data: null, error: { message: 'timeout' } }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
      expect(alertAdmin).toHaveBeenCalledWith(expect.stringContaining('ERRO DE FAILOVER'));
    });

    it('succeeds even when pool backup allocation fails', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });
      checkPoolHealth.mockResolvedValue({ success: true, data: { available: 2, threshold: 5, healthy: false } });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({
            data: [{ id: 'backup-1', phone_number: '+5522222', role: 'backup' }],
            error: null,
          }));
          return chain;
        }
        if (callCount === 2) {
          return createChain({
            data: { id: 'backup-1', phone_number: '+5522222', role: 'active', status: 'active' },
            error: null,
          });
        }
        if (callCount === 3) {
          // Pool query fails
          const chain = createChain(null);
          chain.limit = jest.fn(() => Promise.resolve({ data: null, error: { message: 'pool err' } }));
          return chain;
        }
        return createChain({ data: null, error: null });
      });

      const result = await handleFailover('num-1', 'group-1');
      expect(result.success).toBe(true);
      expect(result.data.newBackup).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        '[failover] Failed to query pool for new backup',
        expect.objectContaining({ error: 'pool err' }),
      );
    });

    it('handles alertAdmin failure gracefully', async () => {
      handleBan.mockResolvedValue({ success: true, data: { phone_number: '+5511111' } });

      const chain = createChain(null);
      chain.limit = jest.fn(() => Promise.resolve({ data: [], error: null }));
      mockSupabase.from.mockReturnValue(chain);

      alertAdmin.mockRejectedValueOnce(new Error('telegram down'));

      const result = await handleFailover('num-1', 'group-1');
      // Should not throw, returns NO_BACKUP
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_BACKUP');
      expect(logger.warn).toHaveBeenCalledWith(
        '[failover] Failed to send no-backup alert',
        expect.objectContaining({ error: 'telegram down' }),
      );
    });
  });
});

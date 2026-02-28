// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    whatsapp: {
      maxNumbersPerGroup: 3,
      poolWarnThreshold: 5,
    },
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Build chainable supabase mock
const mockSupabase = { from: jest.fn() };

jest.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

const {
  addNumber, listNumbers, getNumberById, updateNumberStatus, removeNumber,
  getGroupNumbers, allocateToGroup, deallocateFromGroup, handleBan, checkPoolHealth,
} = require('../pool/numberPoolService');
const logger = require('../../lib/logger');

// Helper to create chainable mock
function createChain(resolveValue) {
  const chain = {};
  const terminalMethods = ['single'];
  const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'order'];
  for (const m of chainMethods) {
    chain[m] = jest.fn(() => chain);
  }
  for (const m of terminalMethods) {
    chain[m] = jest.fn(() => Promise.resolve(resolveValue));
  }
  return chain;
}

describe('numberPoolService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addNumber', () => {
    it('should add a valid E.164 number', async () => {
      const mockData = {
        id: 'uuid-1',
        phone_number: '+5511999887766',
        jid: '5511999887766@s.whatsapp.net',
        status: 'connecting',
      };
      const chain = createChain({ data: mockData, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await addNumber('+5511999887766');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        phone_number: '+5511999887766',
        jid: '5511999887766@s.whatsapp.net',
        status: 'connecting',
      }));
    });

    it('should reject invalid phone number', async () => {
      const result = await addNumber('invalid');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PHONE');
    });

    it('should handle duplicate number', async () => {
      const chain = createChain({ data: null, error: { code: '23505', message: 'duplicate' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await addNumber('+5511999887766');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_NUMBER');
    });

    it('should handle DB errors', async () => {
      const chain = createChain({ data: null, error: { code: 'OTHER', message: 'db fail' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await addNumber('+5511999887766');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('listNumbers', () => {
    it('should list all numbers', async () => {
      const mockData = [{ id: '1', status: 'available' }, { id: '2', status: 'active' }];
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.order = jest.fn(() => Promise.resolve({ data: mockData, error: null }));
      chain.eq = jest.fn(() => Promise.resolve({ data: mockData, error: null }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await listNumbers();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });

    it('should filter by status', async () => {
      const mockData = [{ id: '1', status: 'available' }];
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.order = jest.fn(() => chain);
      chain.eq = jest.fn(() => Promise.resolve({ data: mockData, error: null }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await listNumbers({ status: 'available' });

      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('status', 'available');
    });

    it('should handle DB error', async () => {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.order = jest.fn(() => Promise.resolve({ data: null, error: { message: 'fail' } }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await listNumbers();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('getNumberById', () => {
    it('should get number by ID', async () => {
      const mockData = { id: 'uuid-1', phone_number: '+5511999887766', status: 'available' };
      const chain = createChain({ data: mockData, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getNumberById('uuid-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });

    it('should return NOT_FOUND for missing number', async () => {
      const chain = createChain({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getNumberById('uuid-missing');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('updateNumberStatus', () => {
    it('should update status with valid transition', async () => {
      // First call: getNumberById returns current status
      const getChain = createChain({ data: { id: 'uuid-1', status: 'connecting' }, error: null });
      // Second call: update
      const updateChain = createChain({ data: { id: 'uuid-1', status: 'available' }, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? getChain : updateChain;
      });

      const result = await updateNumberStatus('uuid-1', 'available');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('available');
    });

    it('should reject invalid transition', async () => {
      const chain = createChain({ data: { id: 'uuid-1', status: 'connecting' }, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await updateNumberStatus('uuid-1', 'active');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_TRANSITION');
      expect(result.error.message).toContain("'connecting'");
      expect(result.error.message).toContain("'active'");
    });

    it('should set banned_at when transitioning to banned', async () => {
      const getChain = createChain({ data: { id: 'uuid-1', status: 'active' }, error: null });
      const updateChain = createChain({ data: { id: 'uuid-1', status: 'banned' }, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? getChain : updateChain;
      });

      const result = await updateNumberStatus('uuid-1', 'banned');

      expect(result.success).toBe(true);
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'banned', banned_at: expect.any(String) })
      );
    });

    it('should propagate NOT_FOUND from getNumberById', async () => {
      const chain = createChain({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await updateNumberStatus('uuid-missing', 'available');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('removeNumber', () => {
    it('should remove number from pool', async () => {
      const chain = {};
      chain.delete = jest.fn(() => chain);
      chain.eq = jest.fn(() => Promise.resolve({ error: null }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await removeNumber('uuid-1');

      expect(result.success).toBe(true);
      expect(chain.delete).toHaveBeenCalled();
    });

    it('should handle DB error on remove', async () => {
      const chain = {};
      chain.delete = jest.fn(() => chain);
      chain.eq = jest.fn(() => Promise.resolve({ error: { message: 'fail' } }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await removeNumber('uuid-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('getGroupNumbers', () => {
    it('should return numbers for a group', async () => {
      const mockData = [
        { id: 'n1', group_id: 'g1', role: 'active', status: 'active' },
        { id: 'n2', group_id: 'g1', role: 'backup', status: 'backup' },
      ];
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.order = jest.fn(() => Promise.resolve({ data: mockData, error: null }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await getGroupNumbers('g1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(chain.eq).toHaveBeenCalledWith('group_id', 'g1');
    });

    it('should return empty array for group with no numbers', async () => {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.order = jest.fn(() => Promise.resolve({ data: [], error: null }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await getGroupNumbers('g-empty');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle DB error', async () => {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.order = jest.fn(() => Promise.resolve({ data: null, error: { message: 'db fail' } }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await getGroupNumbers('g1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('allocateToGroup', () => {
    it('should allocate 3 numbers (1 active + 2 backup)', async () => {
      const available = [
        { id: 'n1', phone_number: '+5511000000001', status: 'available' },
        { id: 'n2', phone_number: '+5511000000002', status: 'available' },
        { id: 'n3', phone_number: '+5511000000003', status: 'available' },
      ];

      let fromCallCount = 0;
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++;

        // Call 1: getGroupNumbers (select → eq → order)
        if (fromCallCount === 1) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          };
        }

        // Call 2: fetch available numbers (select → eq → is → order → limit)
        if (fromCallCount === 2) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                is: jest.fn(() => ({
                  order: jest.fn(() => ({
                    limit: jest.fn(() => Promise.resolve({ data: available, error: null })),
                  })),
                })),
              })),
            })),
          };
        }

        // Calls 3-5: update each number
        const idx = fromCallCount - 3;
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({
                  data: { ...available[idx], status: idx === 0 ? 'active' : 'backup', role: idx === 0 ? 'active' : 'backup', group_id: 'g1' },
                  error: null,
                })),
              })),
            })),
          })),
        };
      });

      const result = await allocateToGroup('g1');

      expect(result.success).toBe(true);
      expect(result.data.allocated).toHaveLength(3);
      expect(result.data.allocated[0].role).toBe('active');
      expect(result.data.allocated[1].role).toBe('backup');
      expect(result.data.allocated[2].role).toBe('backup');
    });

    it('should reject when group already has max numbers', async () => {
      const existing = [
        { id: 'n1', role: 'active' },
        { id: 'n2', role: 'backup' },
        { id: 'n3', role: 'backup' },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ data: existing, error: null })),
          })),
        })),
      });

      const result = await allocateToGroup('g1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_FULL');
    });

    it('should return error when no numbers available', async () => {
      let fromCallCount = 0;
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              is: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          })),
        };
      });

      const result = await allocateToGroup('g1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_NUMBERS_AVAILABLE');
    });

    it('should warn on partial allocation', async () => {
      const available = [
        { id: 'n1', phone_number: '+5511000000001', status: 'available' },
      ];

      let fromCallCount = 0;
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          };
        }
        if (fromCallCount === 2) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                is: jest.fn(() => ({
                  order: jest.fn(() => ({
                    limit: jest.fn(() => Promise.resolve({ data: available, error: null })),
                  })),
                })),
              })),
            })),
          };
        }
        return {
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({
                  data: { ...available[0], role: 'active', status: 'active', group_id: 'g1' },
                  error: null,
                })),
              })),
            })),
          })),
        };
      });

      const result = await allocateToGroup('g1');

      expect(result.success).toBe(true);
      expect(result.data.allocated).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Partial allocation — not enough numbers in pool',
        expect.objectContaining({ needed: 3, allocated: 1 })
      );
    });
  });

  describe('deallocateFromGroup', () => {
    it('should deallocate and reset to available', async () => {
      let fromCallCount = 0;
      mockSupabase.from.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return createChain({
            data: { id: 'n1', group_id: 'g1', role: 'active', status: 'active' },
            error: null,
          });
        }
        return createChain({
          data: { id: 'n1', group_id: null, role: null, status: 'available' },
          error: null,
        });
      });

      const result = await deallocateFromGroup('n1');

      expect(result.success).toBe(true);
      expect(result.data.group_id).toBeNull();
      expect(result.data.status).toBe('available');
    });

    it('should reject if number is not allocated', async () => {
      mockSupabase.from.mockReturnValue(
        createChain({ data: { id: 'n1', group_id: null, status: 'available' }, error: null })
      );

      const result = await deallocateFromGroup('n1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_ALLOCATED');
    });

    it('should propagate NOT_FOUND', async () => {
      mockSupabase.from.mockReturnValue(
        createChain({ data: null, error: { code: 'PGRST116', message: 'not found' } })
      );

      const result = await deallocateFromGroup('missing');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('handleBan', () => {
    it('should mark number as banned and clear group', async () => {
      mockSupabase.from.mockReturnValue(
        createChain({
          data: { id: 'n1', status: 'banned', group_id: null, role: null, phone_number: '+5511000000001' },
          error: null,
        })
      );

      const result = await handleBan('n1');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('banned');
      expect(result.data.group_id).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Number banned and deallocated',
        expect.objectContaining({ numberId: 'n1' })
      );
    });

    it('should handle DB error on ban', async () => {
      mockSupabase.from.mockReturnValue(
        createChain({ data: null, error: { message: 'db fail' } })
      );

      const result = await handleBan('n1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('checkPoolHealth', () => {
    it('should return healthy when enough numbers available', async () => {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.is = jest.fn(() => Promise.resolve({
        data: Array(6).fill({ id: 'x' }),
        error: null,
      }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await checkPoolHealth();

      expect(result.success).toBe(true);
      expect(result.data.healthy).toBe(true);
      expect(result.data.available).toBe(6);
      expect(result.data.threshold).toBe(5);
    });

    it('should return unhealthy and warn when below threshold', async () => {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.is = jest.fn(() => Promise.resolve({
        data: Array(2).fill({ id: 'x' }),
        error: null,
      }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await checkPoolHealth();

      expect(result.success).toBe(true);
      expect(result.data.healthy).toBe(false);
      expect(result.data.available).toBe(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Pool stock low',
        expect.objectContaining({ available: 2, threshold: 5 })
      );
    });

    it('should handle DB error', async () => {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.is = jest.fn(() => Promise.resolve({
        data: null,
        error: { message: 'db fail' },
      }));
      mockSupabase.from.mockReturnValue(chain);

      const result = await checkPoolHealth();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('status transition validation', () => {
    const transitions = [
      ['connecting', 'available', true],
      ['connecting', 'banned', true],
      ['connecting', 'active', false],
      ['available', 'active', true],
      ['available', 'backup', true],
      ['available', 'connecting', true],
      ['available', 'cooldown', true],
      ['available', 'banned', false],
      ['active', 'available', true],
      ['active', 'banned', true],
      ['active', 'cooldown', true],
      ['active', 'connecting', false],
      ['backup', 'active', true],
      ['backup', 'available', true],
      ['backup', 'banned', true],
      ['backup', 'cooldown', false],
      ['banned', 'cooldown', true],
      ['banned', 'available', false],
      ['cooldown', 'available', true],
      ['cooldown', 'active', false],
    ];

    test.each(transitions)('%s → %s should be %s', async (from, to, allowed) => {
      const getChain = createChain({ data: { id: 'uuid-1', status: from }, error: null });
      const updateChain = createChain({ data: { id: 'uuid-1', status: to }, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? getChain : updateChain;
      });

      const result = await updateNumberStatus('uuid-1', to);

      if (allowed) {
        expect(result.success).toBe(true);
      } else {
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });
  });
});

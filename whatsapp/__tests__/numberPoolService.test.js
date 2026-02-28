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

const { addNumber, listNumbers, getNumberById, updateNumberStatus, removeNumber } = require('../pool/numberPoolService');

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

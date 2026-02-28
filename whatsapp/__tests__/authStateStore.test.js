const crypto = require('crypto');
const { encrypt, decrypt } = require('../store/encryptionHelper');

// Must use 'mock' prefix for jest.mock hoisting
const mockEncryptionKey = crypto.randomBytes(32).toString('hex');

// Mock Baileys via our shim
const mockInitAuthCreds = jest.fn(() => ({
  registrationId: Math.floor(Math.random() * 65536),
  noiseKey: { private: Buffer.alloc(32), public: Buffer.alloc(32) },
  signedIdentityKey: { private: Buffer.alloc(32), public: Buffer.alloc(32) },
  signedPreKey: { keyPair: { private: Buffer.alloc(32), public: Buffer.alloc(32) }, signature: Buffer.alloc(64), keyId: 1 },
  advSecretKey: 'test-adv-key',
  me: null,
  account: null,
}));

jest.mock('../baileys', () => ({
  loadBaileys: jest.fn(async () => ({
    initAuthCreds: mockInitAuthCreds,
  })),
}));

// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    whatsapp: {
      encryptionKey: mockEncryptionKey,
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
const mockSupabase = {
  from: jest.fn(),
};

jest.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

// Must require AFTER mocks
const { useDatabaseAuthState, loadCreds, saveCreds, loadKeys, saveKeys } = require('../store/authStateStore');

// Helper to create chainable mock
function createChain(resolveValue) {
  const chain = {};
  const methods = ['select', 'eq', 'in', 'single', 'upsert', 'delete'];
  for (const m of methods) {
    chain[m] = jest.fn(() => {
      if (m === 'single' || m === 'upsert' || m === 'delete') {
        return Promise.resolve(resolveValue);
      }
      return chain;
    });
  }
  return chain;
}

describe('authStateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadCreds', () => {
    it('should return null when no creds exist', async () => {
      const chain = createChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadCreds('number-uuid-1');
      expect(result).toBeNull();
      expect(mockSupabase.from).toHaveBeenCalledWith('whatsapp_sessions');
    });

    it('should decrypt and return creds when they exist', async () => {
      const originalCreds = { registrationId: 12345, me: { id: 'test@s.whatsapp.net' } };
      const encrypted = encrypt(originalCreds, mockEncryptionKey);

      const chain = createChain({ data: { creds: encrypted }, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadCreds('number-uuid-1');
      expect(result).toEqual(originalCreds);
    });

    it('should handle Buffer data in creds roundtrip', async () => {
      const credsWithBuffers = {
        registrationId: 42,
        noiseKey: { private: Buffer.from('abc'), public: Buffer.from('def') },
      };
      // Simulate what saveCreds does
      const serialized = JSON.parse(JSON.stringify(credsWithBuffers, (key, value) => {
        if (Buffer.isBuffer(value)) {
          return { type: 'Buffer', data: value.toString('base64') };
        }
        return value;
      }));
      const encrypted = encrypt(serialized, mockEncryptionKey);

      const chain = createChain({ data: { creds: encrypted }, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadCreds('number-uuid-1');
      expect(result.registrationId).toBe(42);
      expect(Buffer.isBuffer(result.noiseKey.private)).toBe(true);
      expect(result.noiseKey.private.toString()).toBe('abc');
    });

    it('should return null on supabase error', async () => {
      const chain = createChain({ data: null, error: { message: 'db error' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadCreds('number-uuid-1');
      expect(result).toBeNull();
    });
  });

  describe('saveCreds', () => {
    it('should encrypt and upsert creds', async () => {
      const creds = { registrationId: 99, me: { id: 'x@s.whatsapp.net' } };
      const chain = createChain({ error: null });
      mockSupabase.from.mockReturnValue(chain);

      await saveCreds('number-uuid-1', creds);

      expect(mockSupabase.from).toHaveBeenCalledWith('whatsapp_sessions');
      expect(chain.upsert).toHaveBeenCalled();

      const upsertArg = chain.upsert.mock.calls[0][0];
      expect(upsertArg.number_id).toBe('number-uuid-1');
      expect(upsertArg.creds.split(':')).toHaveLength(4);

      // Verify we can decrypt it back
      const decrypted = decrypt(upsertArg.creds, mockEncryptionKey);
      expect(decrypted.registrationId).toBe(99);
    });

    it('should throw on supabase error', async () => {
      const chain = createChain({ error: { message: 'write failed' } });
      mockSupabase.from.mockReturnValue(chain);

      await expect(saveCreds('number-uuid-1', {})).rejects.toThrow('Failed to save creds');
    });
  });

  describe('loadKeys', () => {
    it('should load and decrypt keys by type and IDs', async () => {
      const keyData1 = { private: 'abc', public: 'def' };
      const keyData2 = { private: 'ghi', public: 'jkl' };

      const chain = createChain(null);
      chain.in.mockResolvedValue({
        data: [
          { key_id: '1', key_data: encrypt(keyData1, mockEncryptionKey) },
          { key_id: '2', key_data: encrypt(keyData2, mockEncryptionKey) },
        ],
        error: null,
      });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadKeys('number-uuid-1', 'pre-key', ['1', '2']);

      expect(result['1']).toEqual(keyData1);
      expect(result['2']).toEqual(keyData2);
    });

    it('should return empty object when no keys found', async () => {
      const chain = createChain(null);
      chain.in.mockResolvedValue({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadKeys('number-uuid-1', 'pre-key', ['99']);
      expect(result).toEqual({});
    });

    it('should return empty object on error', async () => {
      const chain = createChain(null);
      chain.in.mockResolvedValue({ data: null, error: { message: 'fail' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await loadKeys('number-uuid-1', 'pre-key', ['1']);
      expect(result).toEqual({});
    });
  });

  describe('saveKeys', () => {
    it('should encrypt and upsert keys', async () => {
      const chain = createChain({ error: null });
      mockSupabase.from.mockReturnValue(chain);

      const data = {
        'pre-key': {
          '1': { private: 'a', public: 'b' },
          '2': { private: 'c', public: 'd' },
        },
      };

      await saveKeys('number-uuid-1', data);

      expect(chain.upsert).toHaveBeenCalled();
      const upsertArg = chain.upsert.mock.calls[0][0];
      expect(upsertArg).toHaveLength(2);
      expect(upsertArg[0].key_type).toBe('pre-key');
      expect(upsertArg[0].key_id).toBe('1');
      expect(upsertArg[0].key_data.split(':')).toHaveLength(4);
    });

    it('should delete keys when value is null', async () => {
      const deleteChain = createChain({ error: null });
      deleteChain.delete = jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null })),
          })),
        })),
      }));
      mockSupabase.from.mockReturnValue(deleteChain);

      const data = {
        'pre-key': {
          '1': null,
        },
      };

      await saveKeys('number-uuid-1', data);

      expect(deleteChain.delete).toHaveBeenCalled();
    });

    it('should throw on upsert error', async () => {
      const chain = createChain({ error: { message: 'upsert failed' } });
      mockSupabase.from.mockReturnValue(chain);

      const data = { 'pre-key': { '1': { data: 'x' } } };
      await expect(saveKeys('number-uuid-1', data)).rejects.toThrow('Failed to save keys');
    });
  });

  describe('useDatabaseAuthState', () => {
    it('should return fresh creds when none exist', async () => {
      const chain = createChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const { state, saveCreds: saveCredsFn } = await useDatabaseAuthState('number-uuid-1');

      expect(state.creds).toBeDefined();
      expect(state.creds.registrationId).toBeDefined();
      expect(typeof state.keys.get).toBe('function');
      expect(typeof state.keys.set).toBe('function');
      expect(typeof saveCredsFn).toBe('function');
      expect(mockInitAuthCreds).toHaveBeenCalled();
    });

    it('should return existing creds when they exist', async () => {
      const existingCreds = { registrationId: 42, me: { id: 'x' } };
      const encrypted = encrypt(existingCreds, mockEncryptionKey);

      const chain = createChain({ data: { creds: encrypted }, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const { state } = await useDatabaseAuthState('number-uuid-1');
      expect(state.creds.registrationId).toBe(42);
      expect(mockInitAuthCreds).not.toHaveBeenCalled();
    });

    it('keys.get should call loadKeys', async () => {
      const chain = createChain({ data: null, error: null });
      chain.in = jest.fn(() => Promise.resolve({ data: [], error: null }));
      mockSupabase.from.mockReturnValue(chain);

      const { state } = await useDatabaseAuthState('number-uuid-1');
      const result = await state.keys.get('pre-key', ['1', '2']);
      expect(result).toEqual({});
    });

    it('keys.set should call saveKeys', async () => {
      const loadChain = createChain({ data: null, error: null });
      const saveChain = createChain({ error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? loadChain : saveChain;
      });

      const { state } = await useDatabaseAuthState('number-uuid-1');
      await state.keys.set({ 'pre-key': { '1': { data: 'x' } } });

      expect(saveChain.upsert).toHaveBeenCalled();
    });

    it('saveCreds should persist current creds', async () => {
      const chain = createChain({ data: null, error: null });
      const saveChain = createChain({ error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? chain : saveChain;
      });

      const { saveCreds: saveCredsFn } = await useDatabaseAuthState('number-uuid-1');
      await saveCredsFn();

      expect(saveChain.upsert).toHaveBeenCalled();
      const upsertArg = saveChain.upsert.mock.calls[0][0];
      expect(upsertArg.number_id).toBe('number-uuid-1');
      expect(upsertArg.creds.split(':')).toHaveLength(4);
    });
  });
});

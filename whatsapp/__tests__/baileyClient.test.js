const crypto = require('crypto');

const mockEncryptionKey = crypto.randomBytes(32).toString('hex');

// Mock Baileys shim
const mockSocket = {
  ev: {
    on: jest.fn(),
  },
  end: jest.fn(),
};
const mockMakeWASocket = jest.fn(() => mockSocket);
const mockDisconnectReason = { loggedOut: 401 };

jest.mock('../baileys', () => ({
  loadBaileys: jest.fn(async () => ({
    makeWASocket: mockMakeWASocket,
    DisconnectReason: mockDisconnectReason,
    initAuthCreds: jest.fn(() => ({ registrationId: 1 })),
  })),
}));

// Mock auth state store
const mockSaveCreds = jest.fn();
jest.mock('../store/authStateStore', () => ({
  useDatabaseAuthState: jest.fn(async () => ({
    state: {
      creds: { registrationId: 1 },
      keys: { get: jest.fn(), set: jest.fn() },
    },
    saveCreds: mockSaveCreds,
  })),
}));

// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    whatsapp: {
      encryptionKey: mockEncryptionKey,
      maxReconnectAttempts: 3,
      reconnectBackoffMs: [100, 200, 500],
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

// Mock supabase
const mockUpsert = jest.fn(() => Promise.resolve({ error: null }));
const mockEq = jest.fn(() => Promise.resolve({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: mockUpsert,
      update: mockUpdate,
    })),
  },
}));

const { BaileyClient } = require('../client/baileyClient');
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');

describe('BaileyClient', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    client = new BaileyClient('uuid-123', '+5511999887766');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(client.numberId).toBe('uuid-123');
      expect(client.phoneNumber).toBe('+5511999887766');
      expect(client.jid).toBe('5511999887766@s.whatsapp.net');
      expect(client.socket).toBeNull();
      expect(client.reconnectAttempt).toBe(0);
      expect(client.totalReconnects).toBe(0);
      expect(client.isClosing).toBe(false);
    });

    it('should read maxReconnectAttempts from config', () => {
      expect(client.maxReconnectAttempts).toBe(3);
    });

    it('should read backoffMs from config', () => {
      expect(client.backoffMs).toEqual([100, 200, 500]);
    });
  });

  describe('connect', () => {
    it('should create socket and register event handlers', async () => {
      await client.connect();

      expect(mockMakeWASocket).toHaveBeenCalledWith(
        expect.objectContaining({
          printQRInTerminal: false,
          browser: ['GuruBet', 'Server', '1.0.0'],
        })
      );
      expect(mockSocket.ev.on).toHaveBeenCalledWith('connection.update', expect.any(Function));
      expect(mockSocket.ev.on).toHaveBeenCalledWith('creds.update', expect.any(Function));
    });

    it('should update connection state to connecting', async () => {
      await client.connect();

      expect(supabase.from).toHaveBeenCalledWith('whatsapp_sessions');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          number_id: 'uuid-123',
          connection_state: 'connecting',
        }),
        { onConflict: 'number_id' }
      );
    });
  });

  describe('disconnect', () => {
    it('should save creds, close socket and update state', async () => {
      await client.connect();
      await client.disconnect();

      expect(mockSaveCreds).toHaveBeenCalled();
      expect(mockSocket.end).toHaveBeenCalled();
      expect(client.socket).toBeNull();
      expect(client.isClosing).toBe(true);
    });

    it('should handle saveCreds failure gracefully', async () => {
      await client.connect();
      mockSaveCreds.mockRejectedValueOnce(new Error('DB error'));
      await client.disconnect();

      // Should still disconnect even if saveCreds fails
      expect(client.socket).toBeNull();
      expect(client.isClosing).toBe(true);
    });
  });

  describe('_handleConnectionUpdate', () => {
    let getHandler;

    beforeEach(async () => {
      await client.connect();
      getHandler = () => mockSocket.ev.on.mock.calls
        .find(([event]) => event === 'connection.update')[1];
    });

    it('should save QR code when qr field is present', async () => {
      await getHandler()({ qr: 'base64-qr-data' });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          number_id: 'uuid-123',
          qr_code: 'base64-qr-data',
        }),
        { onConflict: 'number_id' }
      );
    });

    it('should update status to available on open connection', async () => {
      await getHandler()({ connection: 'open' });

      expect(mockUpdate).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'BaileyClient connected',
        expect.objectContaining({ numberId: 'uuid-123', totalReconnects: 0 })
      );
    });

    it('should reset reconnect counter on open', async () => {
      client.reconnectAttempt = 2;
      await getHandler()({ connection: 'open' });

      expect(client.reconnectAttempt).toBe(0);
    });

    it('should increment totalReconnects when reconnecting', async () => {
      client.reconnectAttempt = 1;
      await getHandler()({ connection: 'open' });

      expect(client.totalReconnects).toBe(1);
    });

    it('should not increment totalReconnects on first connect', async () => {
      client.reconnectAttempt = 0;
      await getHandler()({ connection: 'open' });

      expect(client.totalReconnects).toBe(0);
    });

    it('should update heartbeat on open', async () => {
      await getHandler()({ connection: 'open' });

      // heartbeat uses update().eq() on whatsapp_numbers
      expect(supabase.from).toHaveBeenCalledWith('whatsapp_numbers');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ last_heartbeat: expect.any(String) })
      );
    });

    it('should handle logged out (banned) on close with 401', async () => {
      await getHandler()({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'BaileyClient logged out / banned',
        expect.objectContaining({ numberId: 'uuid-123' })
      );
    });

    it('should reconnect with backoff on non-401 close', async () => {
      await getHandler()({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(client.reconnectAttempt).toBe(1);
      expect(logger.info).toHaveBeenCalledWith(
        'BaileyClient reconnecting',
        expect.objectContaining({ attempt: 1, delayMs: 100 })
      );
    });

    it('should use config backoff values', async () => {
      client.reconnectAttempt = 1;
      await getHandler()({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(logger.info).toHaveBeenCalledWith(
        'BaileyClient reconnecting',
        expect.objectContaining({ delayMs: 200 })
      );
    });

    it('should stop reconnecting after maxReconnectAttempts', async () => {
      client.reconnectAttempt = 3; // equals maxReconnectAttempts (3)
      await getHandler()({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(logger.error).toHaveBeenCalledWith(
        'BaileyClient max reconnect attempts reached',
        expect.objectContaining({
          numberId: 'uuid-123',
          attempts: 3,
          maxAttempts: 3,
        })
      );
    });

    it('should set status to cooldown when max attempts reached', async () => {
      client.reconnectAttempt = 3;
      await getHandler()({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cooldown' })
      );
    });

    it('should not reconnect if isClosing', async () => {
      client.isClosing = true;
      await getHandler()({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 500 } } },
      });

      expect(client.reconnectAttempt).toBe(0);
    });
  });

  describe('creds.update handler', () => {
    it('should save creds when triggered', async () => {
      await client.connect();

      const handler = mockSocket.ev.on.mock.calls
        .find(([event]) => event === 'creds.update')[1];

      await handler();

      expect(mockSaveCreds).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return reconnect stats', () => {
      client.reconnectAttempt = 2;
      client.totalReconnects = 5;

      const stats = client.getStats();

      expect(stats).toEqual({
        numberId: 'uuid-123',
        phone: '+5511999887766',
        connected: false,
        reconnectAttempt: 2,
        totalReconnects: 5,
      });
    });

    it('should show connected true when socket exists', async () => {
      await client.connect();
      const stats = client.getStats();
      expect(stats.connected).toBe(true);
    });
  });

  describe('_createPinoAdapter', () => {
    it('should create a pino-compatible logger', () => {
      const adapter = client._createPinoAdapter();

      expect(adapter.level).toBe('silent');
      expect(typeof adapter.trace).toBe('function');
      expect(typeof adapter.debug).toBe('function');
      expect(typeof adapter.info).toBe('function');
      expect(typeof adapter.warn).toBe('function');
      expect(typeof adapter.error).toBe('function');
      expect(typeof adapter.fatal).toBe('function');
      expect(typeof adapter.child).toBe('function');
    });

    it('should forward warn/error to logger', () => {
      const adapter = client._createPinoAdapter();

      adapter.warn('test warning');
      expect(logger.warn).toHaveBeenCalledWith('Baileys warn', expect.objectContaining({ numberId: 'uuid-123' }));

      adapter.error('test error');
      expect(logger.error).toHaveBeenCalledWith('Baileys error', expect.objectContaining({ numberId: 'uuid-123' }));
    });

    it('child() should return a new adapter', () => {
      const adapter = client._createPinoAdapter();
      const child = adapter.child();
      expect(typeof child.warn).toBe('function');
    });
  });
});

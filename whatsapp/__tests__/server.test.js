// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    whatsapp: {
      shutdownTimeoutMs: 1000,
      maxReconnectAttempts: 5,
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

// Mock supabase for hasValidAuthState
const mockSingle = jest.fn();
const mockEqSession = jest.fn(() => ({ single: mockSingle }));
const mockSelectSession = jest.fn(() => ({ eq: mockEqSession }));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table) => {
      if (table === 'whatsapp_sessions') {
        return { select: mockSelectSession };
      }
      return {
        select: jest.fn(() => ({ order: jest.fn(() => Promise.resolve({ data: [], error: null })) })),
        upsert: jest.fn(() => Promise.resolve({ error: null })),
        update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
      };
    }),
  },
}));

// Mock BaileyClient
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockGetStats = jest.fn(() => ({
  numberId: 'num-1',
  phone: '+5511000000001',
  connected: true,
  reconnectAttempt: 0,
  totalReconnects: 0,
}));

const mockSetGroupParticipantsHandler = jest.fn();

jest.mock('../client/baileyClient', () => ({
  BaileyClient: jest.fn().mockImplementation((numberId, phone) => ({
    numberId,
    phoneNumber: phone,
    socket: {},
    connect: mockConnect,
    disconnect: mockDisconnect,
    getStats: mockGetStats,
    setGroupParticipantsHandler: mockSetGroupParticipantsHandler,
  })),
}));

// Mock memberEvents handler
jest.mock('../handlers/memberEvents', () => ({
  handleGroupParticipantsUpdate: jest.fn(),
}));

// Mock numberPoolService
const mockListNumbers = jest.fn();
jest.mock('../pool/numberPoolService', () => ({
  listNumbers: mockListNumbers,
}));

const { createApp, initClients, shutdown } = require('../server');
const { clients } = require('../clientRegistry');
const logger = require('../../lib/logger');

describe('WhatsApp Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clients.clear();
  });

  describe('initClients', () => {
    it('should skip numbers without valid auth state', async () => {
      mockListNumbers.mockResolvedValue({
        success: true,
        data: [
          { id: 'num-1', phone_number: '+5511000000001', status: 'available' },
          { id: 'num-2', phone_number: '+5511000000002', status: 'available' },
        ],
      });

      // num-1 has creds, num-2 does not
      mockSingle
        .mockResolvedValueOnce({ data: { creds: 'encrypted-creds' }, error: null })
        .mockResolvedValueOnce({ data: { creds: null }, error: null });

      await initClients();

      // Only num-1 should be connected
      expect(clients.size).toBe(1);
      expect(clients.has('num-1')).toBe(true);
      expect(clients.has('num-2')).toBe(false);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should skip banned numbers', async () => {
      mockListNumbers.mockResolvedValue({
        success: true,
        data: [
          { id: 'num-1', phone_number: '+5511000000001', status: 'banned' },
          { id: 'num-2', phone_number: '+5511000000002', status: 'available' },
        ],
      });

      mockSingle.mockResolvedValue({ data: { creds: 'encrypted-creds' }, error: null });

      await initClients();

      expect(clients.size).toBe(1);
      expect(clients.has('num-2')).toBe(true);
    });

    it('should connect numbers in parallel', async () => {
      mockListNumbers.mockResolvedValue({
        success: true,
        data: [
          { id: 'num-1', phone_number: '+5511000000001', status: 'available' },
          { id: 'num-2', phone_number: '+5511000000002', status: 'active' },
          { id: 'num-3', phone_number: '+5511000000003', status: 'backup' },
        ],
      });

      mockSingle.mockResolvedValue({ data: { creds: 'encrypted-creds' }, error: null });

      await initClients();

      expect(clients.size).toBe(3);
      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(logger.info).toHaveBeenCalledWith(
        'All clients initialized',
        expect.objectContaining({ connected: 3 })
      );
    });

    it('should handle listNumbers failure', async () => {
      mockListNumbers.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Connection failed' },
      });

      await initClients();

      expect(clients.size).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load WhatsApp numbers',
        expect.any(Object)
      );
    });

    it('should handle individual connect failures gracefully', async () => {
      mockListNumbers.mockResolvedValue({
        success: true,
        data: [
          { id: 'num-1', phone_number: '+5511000000001', status: 'available' },
        ],
      });

      mockSingle.mockResolvedValue({ data: { creds: 'encrypted-creds' }, error: null });
      mockConnect.mockRejectedValueOnce(new Error('Socket error'));

      await initClients();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to init WhatsApp client',
        expect.objectContaining({ numberId: 'num-1' })
      );
      // Failed client should be removed from Map
      expect(clients.has('num-1')).toBe(false);
    });

    it('should log skipped count for numbers without auth state', async () => {
      mockListNumbers.mockResolvedValue({
        success: true,
        data: [
          { id: 'num-1', phone_number: '+5511000000001', status: 'available' },
          { id: 'num-2', phone_number: '+5511000000002', status: 'connecting' },
        ],
      });

      // Both have no creds
      mockSingle.mockResolvedValue({ data: { creds: null }, error: null });

      await initClients();

      expect(clients.size).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 skipped')
      );
    });
  });

  describe('shutdown', () => {
    it('should disconnect all clients', async () => {
      // Simulate connected clients
      clients.set('num-1', { disconnect: mockDisconnect });
      clients.set('num-2', { disconnect: mockDisconnect });
      mockDisconnect.mockResolvedValue(undefined);

      await shutdown();

      expect(mockDisconnect).toHaveBeenCalledTimes(2);
      expect(clients.size).toBe(0);
    });

    it('should handle disconnect errors gracefully', async () => {
      const failDisconnect = jest.fn().mockRejectedValue(new Error('Timeout'));
      clients.set('num-1', { disconnect: failDisconnect });

      await shutdown();

      expect(logger.error).toHaveBeenCalledWith(
        'Error disconnecting client',
        expect.objectContaining({ numberId: 'num-1' })
      );
      expect(clients.size).toBe(0);
    });

    it('should enforce shutdown timeout', async () => {
      jest.useFakeTimers();

      // Simulate a client that never finishes disconnecting
      const neverResolve = new Promise(() => {});
      clients.set('num-1', { disconnect: () => neverResolve });

      const shutdownPromise = shutdown();

      // Advance past the timeout
      jest.advanceTimersByTime(1500);

      await shutdownPromise;

      expect(logger.warn).toHaveBeenCalledWith(
        'Shutdown timeout reached, forcing exit',
        expect.objectContaining({ timeoutMs: 1000 })
      );
      expect(clients.size).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('health endpoint', () => {
    it('should return status with client stats', (done) => {
      const app = createApp();

      // Add a mock client
      clients.set('num-1', {
        getStats: () => ({
          numberId: 'num-1',
          phone: '+5511000000001',
          connected: true,
          reconnectAttempt: 0,
          totalReconnects: 2,
        }),
      });

      const server = app.listen(0, () => {
        const port = server.address().port;
        const http = require('http');
        http.get(`http://127.0.0.1:${port}/health`, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            const body = JSON.parse(data);
            expect(body.status).toBe('ok');
            expect(body.service).toBe('whatsapp');
            expect(body.clients).toBe(1);
            expect(body.details['num-1']).toEqual({
              numberId: 'num-1',
              phone: '+5511000000001',
              connected: true,
              reconnectAttempt: 0,
              totalReconnects: 2,
            });
            server.close(done);
          });
        });
      });
    });
  });
});

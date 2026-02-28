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

jest.mock('../clientRegistry', () => {
  const clients = new Map();
  return {
    clients,
    getClient: jest.fn((id) => clients.get(id)),
  };
});

jest.mock('../services/rateLimiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => ({
    waitForSlot: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../lib/phoneUtils', () => ({
  phoneToJid: jest.fn((phone) => phone.replace('+', '') + '@s.whatsapp.net'),
  validateE164: jest.fn((phone) => {
    if (phone && /^\+[1-9]\d{6,14}$/.test(phone)) return { valid: true };
    return { valid: false, error: 'Invalid E.164 format' };
  }),
}));

const { supabase } = require('../../lib/supabase');
const { clients, getClient } = require('../clientRegistry');
const { sendToGroup, sendMediaToGroup, sendDM } = require('../services/whatsappSender');

// Helper to create a mock client
function createMockClient(numberId) {
  return {
    numberId,
    socket: {},
    sendMessage: jest.fn(),
    sendImage: jest.fn(),
  };
}

// Helper to mock supabase query chain
function mockSupabaseQuery(data, error = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('whatsappSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clients.clear();
  });

  describe('sendToGroup', () => {
    it('should send text message via active client for group', async () => {
      const mockClient = createMockClient('num-1');
      mockClient.sendMessage.mockResolvedValue({ success: true, data: { messageId: 'msg-1' } });
      clients.set('num-1', mockClient);

      mockSupabaseQuery({ id: 'num-1' });
      getClient.mockReturnValue(mockClient);

      const result = await sendToGroup('group-1', '120363xxx@g.us', 'Hello');

      expect(result.success).toBe(true);
      expect(mockClient.sendMessage).toHaveBeenCalledWith('120363xxx@g.us', 'Hello');
    });

    it('should return error when no active number found', async () => {
      mockSupabaseQuery(null, { message: 'not found' });

      const result = await sendToGroup('group-1', '120363xxx@g.us', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_ACTIVE_NUMBER');
    });

    it('should return error when client is not connected', async () => {
      mockSupabaseQuery({ id: 'num-1' });
      getClient.mockReturnValue(undefined);

      const result = await sendToGroup('group-1', '120363xxx@g.us', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CLIENT_NOT_CONNECTED');
    });
  });

  describe('sendMediaToGroup', () => {
    it('should send image via active client for group', async () => {
      const mockClient = createMockClient('num-1');
      mockClient.sendImage.mockResolvedValue({ success: true, data: { messageId: 'img-1' } });
      clients.set('num-1', mockClient);

      mockSupabaseQuery({ id: 'num-1' });
      getClient.mockReturnValue(mockClient);

      const result = await sendMediaToGroup('group-1', '120363xxx@g.us', 'https://img.com/pic.jpg', 'caption');

      expect(result.success).toBe(true);
      expect(mockClient.sendImage).toHaveBeenCalledWith('120363xxx@g.us', 'https://img.com/pic.jpg', 'caption');
    });
  });

  describe('sendDM', () => {
    it('should send DM via group active client when groupId provided', async () => {
      const mockClient = createMockClient('num-1');
      mockClient.sendMessage.mockResolvedValue({ success: true, data: { messageId: 'dm-1' } });
      clients.set('num-1', mockClient);

      mockSupabaseQuery({ id: 'num-1' });
      getClient.mockReturnValue(mockClient);

      const result = await sendDM('+5511999887766', 'Hello', 'group-1');

      expect(result.success).toBe(true);
      expect(mockClient.sendMessage).toHaveBeenCalledWith('5511999887766@s.whatsapp.net', 'Hello');
    });

    it('should fallback to any connected client when groupId not provided', async () => {
      const mockClient = createMockClient('num-2');
      mockClient.sendMessage.mockResolvedValue({ success: true, data: { messageId: 'dm-2' } });
      clients.set('num-2', mockClient);

      const result = await sendDM('+5511999887766', 'Hello');

      expect(result.success).toBe(true);
      expect(mockClient.sendMessage).toHaveBeenCalled();
    });

    it('should return error when no clients available', async () => {
      // No clients in registry, no groupId
      const result = await sendDM('+5511999887766', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_CLIENT');
    });

    it('should return error for invalid phone number', async () => {
      const result = await sendDM('invalid-phone', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PHONE');
    });
  });
});

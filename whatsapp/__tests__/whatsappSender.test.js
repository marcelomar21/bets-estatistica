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
const logger = require('../../lib/logger');
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

// Helper to mock supabase query chain for whatsapp_numbers lookup
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

    it('should retry up to 3 times with backoff on failure', async () => {
      jest.useFakeTimers();
      const mockClient = createMockClient('num-1');
      const sendError = { code: 'SEND_FAILED', message: 'Connection reset' };
      mockClient.sendMessage
        .mockResolvedValueOnce({ success: false, error: sendError })
        .mockResolvedValueOnce({ success: false, error: sendError })
        .mockResolvedValueOnce({ success: true, data: { messageId: 'dm-retry-3' } });
      clients.set('num-1', mockClient);

      // Mock supabase for _logDMDelivery (member lookup + insert)
      const mockMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 42 }, error: null });
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockImplementation((table) => {
        if (table === 'whatsapp_numbers') {
          return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'num-1' }, error: null }) };
        }
        if (table === 'members') {
          return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: mockMaybeSingle };
        }
        if (table === 'member_events') {
          return { insert: mockInsert };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
      });
      getClient.mockReturnValue(mockClient);

      const resultPromise = sendDM('+5511999887766', 'Hello', 'group-1');

      // Advance through backoff delays
      await jest.advanceTimersByTimeAsync(1000); // 1st backoff
      await jest.advanceTimersByTimeAsync(3000); // 2nd backoff

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data.messageId).toBe('dm-retry-3');
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'WhatsApp DM attempt failed, retrying',
        expect.objectContaining({ attempt: 1, maxRetries: 3 })
      );

      jest.useRealTimers();
    });

    it('should flag member for review after all retries exhausted', async () => {
      jest.useFakeTimers();
      const mockClient = createMockClient('num-1');
      const sendError = { code: 'SEND_FAILED', message: 'Number blocked' };
      mockClient.sendMessage.mockResolvedValue({ success: false, error: sendError });
      clients.set('num-1', mockClient);

      const mockUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
      supabase.from.mockImplementation((table) => {
        if (table === 'whatsapp_numbers') {
          return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'num-1' }, error: null }) };
        }
        if (table === 'members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 99, notes: 'existing note' }, error: null }),
            update: mockUpdate,
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
      });
      getClient.mockReturnValue(mockClient);

      const resultPromise = sendDM('+5511999887766', 'Hello', 'group-1');

      // Advance through all backoff delays
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SEND_FAILED');
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        'WhatsApp DM failed after all retries',
        expect.objectContaining({ phone: '+5511999887766', groupId: 'group-1' })
      );

      jest.useRealTimers();
    });

    it('should log DM delivery to member_events on success', async () => {
      const mockClient = createMockClient('num-1');
      mockClient.sendMessage.mockResolvedValue({ success: true, data: { messageId: 'dm-audit-1' } });
      clients.set('num-1', mockClient);

      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockImplementation((table) => {
        if (table === 'whatsapp_numbers') {
          return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'num-1' }, error: null }) };
        }
        if (table === 'members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 55 }, error: null }),
          };
        }
        if (table === 'member_events') {
          return { insert: mockInsert };
        }
        return {};
      });
      getClient.mockReturnValue(mockClient);

      const result = await sendDM('+5511999887766', 'Hello', 'group-1');

      expect(result.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith({
        member_id: 55,
        event_type: 'dm_sent',
        metadata: expect.objectContaining({
          channel: 'whatsapp',
          phone: '+5511999887766',
          number_id: 'num-1',
          message_id: 'dm-audit-1',
        }),
      });
    });

    it('should not crash if audit logging fails', async () => {
      const mockClient = createMockClient('num-1');
      mockClient.sendMessage.mockResolvedValue({ success: true, data: { messageId: 'dm-log-err' } });
      clients.set('num-1', mockClient);

      supabase.from.mockImplementation((table) => {
        if (table === 'whatsapp_numbers') {
          return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'num-1' }, error: null }) };
        }
        // Simulate DB error during audit logging
        throw new Error('DB connection lost');
      });
      getClient.mockReturnValue(mockClient);

      const result = await sendDM('+5511999887766', 'Hello', 'group-1');

      // DM still succeeds even if audit logging fails
      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to log DM delivery',
        expect.objectContaining({ phone: '+5511999887766' })
      );
    });

    it('should skip flagging when no groupId provided', async () => {
      jest.useFakeTimers();
      const mockClient = createMockClient('num-1');
      mockClient.sendMessage.mockResolvedValue({ success: false, error: { code: 'FAIL', message: 'err' } });
      clients.set('num-1', mockClient);

      // No groupId: supabase.from('members') should NOT be called for flagging
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const resultPromise = sendDM('+5511999887766', 'Hello'); // no groupId

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      // logger.info for flagging should NOT have been called
      expect(logger.info).not.toHaveBeenCalledWith(
        'Member flagged for review after DM failure',
        expect.anything()
      );

      jest.useRealTimers();
    });
  });
});

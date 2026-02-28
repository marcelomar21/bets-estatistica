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

jest.mock('../clientRegistry', () => ({
  getClient: jest.fn(),
}));

const { supabase } = require('../../lib/supabase');
const { getClient } = require('../clientRegistry');
const { createWhatsAppGroup } = require('../services/groupService');

describe('groupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create mock Supabase chain
  function mockFrom(table, result) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(result),
      update: jest.fn().mockReturnThis(),
    };

    // Track calls per table
    if (!supabase._mocks) supabase._mocks = {};
    supabase._mocks[table] = chain;

    return chain;
  }

  function setupSupabaseMocks({ group, numbers, updateResult }) {
    const groupChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(group),
    };

    const numbersChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue(numbers),
    };

    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue(updateResult || { error: null }),
    };

    let callCount = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'groups') {
        callCount++;
        if (callCount <= 1) return groupChain;
        return updateChain;
      }
      if (table === 'whatsapp_numbers') return numbersChain;
      return {};
    });

    return { groupChain, numbersChain, updateChain };
  }

  describe('createWhatsAppGroup', () => {
    it('should return error if group not found', async () => {
      setupSupabaseMocks({
        group: { data: null, error: { message: 'not found' } },
        numbers: { data: [], error: null },
      });

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_NOT_FOUND');
    });

    it('should return error if group already has WhatsApp', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'Test', whatsapp_group_jid: '123@g.us', channels: ['telegram', 'whatsapp'] }, error: null },
        numbers: { data: [], error: null },
      });

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_EXISTS');
    });

    it('should return error if no numbers allocated', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] }, error: null },
        numbers: { data: [], error: null },
      });

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_NUMBERS_ALLOCATED');
    });

    it('should return error if no active number', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] }, error: null },
        numbers: { data: [{ id: 'num-1', jid: '551@s.whatsapp.net', role: 'backup', status: 'backup' }], error: null },
      });

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_ACTIVE_NUMBER');
    });

    it('should return error if active client not connected', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] }, error: null },
        numbers: { data: [
          { id: 'num-1', jid: '551@s.whatsapp.net', role: 'active', status: 'active' },
        ], error: null },
      });
      getClient.mockReturnValue(null);

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CLIENT_NOT_CONNECTED');
    });

    it('should create group successfully', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] }, error: null },
        numbers: { data: [
          { id: 'num-1', jid: '551@s.whatsapp.net', role: 'active', status: 'active' },
          { id: 'num-2', jid: '552@s.whatsapp.net', role: 'backup', status: 'backup' },
        ], error: null },
        updateResult: { error: null },
      });

      const mockClient = {
        createGroup: jest.fn().mockResolvedValue({ success: true, data: { groupJid: '120363xxx@g.us' } }),
      };
      getClient.mockReturnValue(mockClient);

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(true);
      expect(result.data.groupJid).toBe('120363xxx@g.us');
      expect(mockClient.createGroup).toHaveBeenCalledWith('Test Group', ['552@s.whatsapp.net']);
    });

    it('should use group name from DB when groupName not provided', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'DB Group Name', whatsapp_group_jid: null, channels: ['telegram'] }, error: null },
        numbers: { data: [
          { id: 'num-1', jid: '551@s.whatsapp.net', role: 'active', status: 'active' },
        ], error: null },
        updateResult: { error: null },
      });

      const mockClient = {
        createGroup: jest.fn().mockResolvedValue({ success: true, data: { groupJid: '120363xxx@g.us' } }),
      };
      getClient.mockReturnValue(mockClient);

      await createWhatsAppGroup('group-1');

      expect(mockClient.createGroup).toHaveBeenCalledWith('DB Group Name', []);
    });

    it('should return error if Baileys createGroup fails', async () => {
      setupSupabaseMocks({
        group: { data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] }, error: null },
        numbers: { data: [
          { id: 'num-1', jid: '551@s.whatsapp.net', role: 'active', status: 'active' },
        ], error: null },
      });

      const mockClient = {
        createGroup: jest.fn().mockResolvedValue({ success: false, error: { code: 'GROUP_CREATE_FAILED', message: 'Baileys error' } }),
      };
      getClient.mockReturnValue(mockClient);

      const result = await createWhatsAppGroup('group-1', 'Test Group');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_CREATE_FAILED');
    });
  });
});

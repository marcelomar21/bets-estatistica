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

jest.mock('../pool/numberPoolService', () => ({
  allocateToGroup: jest.fn(),
}));

jest.mock('../services/groupService', () => ({
  createWhatsAppGroup: jest.fn(),
}));

jest.mock('../services/inviteLinkService', () => ({
  generateInviteLink: jest.fn(),
}));

const { supabase } = require('../../lib/supabase');
const { allocateToGroup } = require('../pool/numberPoolService');
const { createWhatsAppGroup } = require('../services/groupService');
const { generateInviteLink } = require('../services/inviteLinkService');
const { addWhatsAppChannel } = require('../services/addChannelService');

describe('addChannelService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockGroupLookup(result) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(result),
    };
    supabase.from.mockReturnValue(chain);
    return chain;
  }

  describe('addWhatsAppChannel', () => {
    it('should return error if group not found', async () => {
      mockGroupLookup({ data: null, error: { message: 'not found' } });

      const result = await addWhatsAppChannel('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_NOT_FOUND');
    });

    it('should return error if group already has WhatsApp', async () => {
      mockGroupLookup({
        data: { id: 'group-1', name: 'Test', whatsapp_group_jid: '120363@g.us', channels: ['telegram', 'whatsapp'] },
        error: null,
      });

      const result = await addWhatsAppChannel('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_EXISTS');
    });

    it('should return error if allocation fails', async () => {
      mockGroupLookup({
        data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] },
        error: null,
      });
      allocateToGroup.mockResolvedValue({
        success: false,
        error: { code: 'NO_NUMBERS_AVAILABLE', message: 'No available numbers' },
      });

      const result = await addWhatsAppChannel('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_NUMBERS_AVAILABLE');
      expect(result.error.step).toBe('allocate');
    });

    it('should return error if group creation fails', async () => {
      mockGroupLookup({
        data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] },
        error: null,
      });
      allocateToGroup.mockResolvedValue({ success: true, data: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }] });
      createWhatsAppGroup.mockResolvedValue({
        success: false,
        error: { code: 'CLIENT_NOT_CONNECTED', message: 'Not connected' },
      });

      const result = await addWhatsAppChannel('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CLIENT_NOT_CONNECTED');
      expect(result.error.step).toBe('create_group');
    });

    it('should succeed even if invite link fails (partial success)', async () => {
      mockGroupLookup({
        data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] },
        error: null,
      });
      allocateToGroup.mockResolvedValue({ success: true, data: [{ id: 'n1' }, { id: 'n2' }] });
      createWhatsAppGroup.mockResolvedValue({ success: true, data: { groupJid: '120363@g.us' } });
      generateInviteLink.mockResolvedValue({
        success: false,
        error: { code: 'INVITE_LINK_FAILED', message: 'timeout' },
      });

      const result = await addWhatsAppChannel('group-1');

      expect(result.success).toBe(true);
      expect(result.data.groupJid).toBe('120363@g.us');
      expect(result.data.inviteLink).toBeNull();
      expect(result.data.numbersAllocated).toBe(2);
    });

    it('should complete full flow successfully', async () => {
      mockGroupLookup({
        data: { id: 'group-1', name: 'Test', whatsapp_group_jid: null, channels: ['telegram'] },
        error: null,
      });
      allocateToGroup.mockResolvedValue({ success: true, data: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }] });
      createWhatsAppGroup.mockResolvedValue({ success: true, data: { groupJid: '120363@g.us' } });
      generateInviteLink.mockResolvedValue({
        success: true,
        data: { inviteLink: 'https://chat.whatsapp.com/ABC' },
      });

      const result = await addWhatsAppChannel('group-1');

      expect(result.success).toBe(true);
      expect(result.data.groupJid).toBe('120363@g.us');
      expect(result.data.inviteLink).toBe('https://chat.whatsapp.com/ABC');
      expect(result.data.numbersAllocated).toBe(3);

      expect(allocateToGroup).toHaveBeenCalledWith('group-1');
      expect(createWhatsAppGroup).toHaveBeenCalledWith('group-1', 'Test');
      expect(generateInviteLink).toHaveBeenCalledWith('group-1');
    });
  });
});

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
const { generateInviteLink, revokeInviteLink } = require('../services/inviteLinkService');

describe('inviteLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function setupMocks({ group, numbers }) {
    const groupChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(group),
    };

    const numbersChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };

    // Track calls to handle update chain
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    let groupCallCount = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'groups') {
        groupCallCount++;
        if (groupCallCount <= 1) return groupChain;
        return updateChain;
      }
      if (table === 'whatsapp_numbers') {
        // The second .eq call should resolve with numbers data
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
        // Last eq in the chain resolves
        let eqCount = 0;
        chain.eq = jest.fn().mockImplementation(() => {
          eqCount++;
          if (eqCount >= 2) {
            return Promise.resolve(numbers);
          }
          return chain;
        });
        chain.select = jest.fn().mockReturnValue(chain);
        return chain;
      }
      return {};
    });

    return { groupChain, updateChain };
  }

  describe('generateInviteLink', () => {
    it('should return error if group not found', async () => {
      setupMocks({
        group: { data: null, error: { message: 'not found' } },
        numbers: { data: [], error: null },
      });

      const result = await generateInviteLink('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GROUP_NOT_FOUND');
    });

    it('should return error if group has no WhatsApp', async () => {
      setupMocks({
        group: { data: { id: 'group-1', whatsapp_group_jid: null }, error: null },
        numbers: { data: [], error: null },
      });

      const result = await generateInviteLink('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_WHATSAPP_GROUP');
    });

    it('should return error if no active number', async () => {
      setupMocks({
        group: { data: { id: 'group-1', whatsapp_group_jid: '120363@g.us' }, error: null },
        numbers: { data: [], error: null },
      });

      const result = await generateInviteLink('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_ACTIVE_NUMBER');
    });

    it('should return error if client not connected', async () => {
      setupMocks({
        group: { data: { id: 'group-1', whatsapp_group_jid: '120363@g.us' }, error: null },
        numbers: { data: [{ id: 'num-1', role: 'active' }], error: null },
      });
      getClient.mockReturnValue(null);

      const result = await generateInviteLink('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CLIENT_NOT_CONNECTED');
    });

    it('should generate invite link successfully', async () => {
      setupMocks({
        group: { data: { id: 'group-1', whatsapp_group_jid: '120363@g.us' }, error: null },
        numbers: { data: [{ id: 'num-1', role: 'active' }], error: null },
      });

      const mockClient = {
        getGroupInviteLink: jest.fn().mockResolvedValue({
          success: true,
          data: { inviteLink: 'https://chat.whatsapp.com/ABC123' },
        }),
      };
      getClient.mockReturnValue(mockClient);

      const result = await generateInviteLink('group-1');

      expect(result.success).toBe(true);
      expect(result.data.inviteLink).toBe('https://chat.whatsapp.com/ABC123');
    });
  });

  describe('revokeInviteLink', () => {
    it('should revoke and regenerate invite link', async () => {
      setupMocks({
        group: { data: { id: 'group-1', whatsapp_group_jid: '120363@g.us' }, error: null },
        numbers: { data: [{ id: 'num-1', role: 'active' }], error: null },
      });

      const mockClient = {
        revokeGroupInviteLink: jest.fn().mockResolvedValue({
          success: true,
          data: { inviteLink: 'https://chat.whatsapp.com/NEW456' },
        }),
      };
      getClient.mockReturnValue(mockClient);

      const result = await revokeInviteLink('group-1');

      expect(result.success).toBe(true);
      expect(result.data.inviteLink).toBe('https://chat.whatsapp.com/NEW456');
    });

    it('should return error if revoke fails', async () => {
      setupMocks({
        group: { data: { id: 'group-1', whatsapp_group_jid: '120363@g.us' }, error: null },
        numbers: { data: [{ id: 'num-1', role: 'active' }], error: null },
      });

      const mockClient = {
        revokeGroupInviteLink: jest.fn().mockResolvedValue({
          success: false,
          error: { code: 'REVOKE_INVITE_FAILED', message: 'Permission denied' },
        }),
      };
      getClient.mockReturnValue(mockClient);

      const result = await revokeInviteLink('group-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REVOKE_INVITE_FAILED');
    });
  });
});

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

jest.mock('../../bot/services/memberService', () => ({
  getMemberByChannelUserId: jest.fn(),
  createWhatsAppTrialMember: jest.fn(),
  markMemberAsRemoved: jest.fn(),
}));

const {
  getMemberByChannelUserId,
  createWhatsAppTrialMember,
  markMemberAsRemoved,
} = require('../../bot/services/memberService');

const { handleGroupParticipantsUpdate, resolveGroupId } = require('../handlers/memberEvents');

describe('WhatsApp Member Events', () => {
  const mockClient = {
    numberId: 'num-1',
    jid: '5511000000001@s.whatsapp.net',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveGroupId', () => {
    it('should return group ID for known group JID', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'group-uuid-1' },
              error: null,
            }),
          }),
        }),
      });

      const result = await resolveGroupId('120363xxx@g.us');
      expect(result).toBe('group-uuid-1');
    });

    it('should return null for unknown group JID', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const result = await resolveGroupId('unknown@g.us');
      expect(result).toBeNull();
    });
  });

  describe('handleGroupParticipantsUpdate', () => {
    it('should ignore non-group JIDs', async () => {
      await handleGroupParticipantsUpdate(
        { id: '5511999@s.whatsapp.net', participants: ['5511888@s.whatsapp.net'], action: 'add' },
        mockClient
      );
      expect(getMemberByChannelUserId).not.toHaveBeenCalled();
    });

    it('should ignore promote/demote actions', async () => {
      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511888@s.whatsapp.net'], action: 'promote' },
        mockClient
      );
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should skip own number (bot JID)', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'group-uuid-1' },
              error: null,
            }),
          }),
        }),
      });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511000000001@s.whatsapp.net'], action: 'add' },
        mockClient
      );
      // Should not try to create member for own JID
      expect(createWhatsAppTrialMember).not.toHaveBeenCalled();
    });

    it('should create trial member on add action', async () => {
      // Mock resolveGroupId
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: 'group-uuid-1' },
                  error: null,
                }),
              }),
            }),
          };
        }
        // member_events insert
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      getMemberByChannelUserId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });

      createWhatsAppTrialMember.mockResolvedValue({
        success: true,
        data: { id: 42, channel_user_id: '+5511999887766', status: 'trial' },
      });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511999887766@s.whatsapp.net'], action: 'add' },
        mockClient
      );

      expect(createWhatsAppTrialMember).toHaveBeenCalledWith({
        channelUserId: '+5511999887766',
        groupId: 'group-uuid-1',
      });
    });

    it('should skip if member already exists and is active', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'group-uuid-1' },
              error: null,
            }),
          }),
        }),
      });

      getMemberByChannelUserId.mockResolvedValue({
        success: true,
        data: { id: 10, status: 'ativo', channel_user_id: '+5511999887766' },
      });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511999887766@s.whatsapp.net'], action: 'add' },
        mockClient
      );

      expect(createWhatsAppTrialMember).not.toHaveBeenCalled();
    });

    it('should mark member as removed on remove action', async () => {
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: 'group-uuid-1' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      getMemberByChannelUserId.mockResolvedValue({
        success: true,
        data: { id: 10, status: 'ativo' },
      });

      markMemberAsRemoved.mockResolvedValue({ success: true, data: { id: 10 } });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511999887766@s.whatsapp.net'], action: 'remove' },
        mockClient
      );

      expect(markMemberAsRemoved).toHaveBeenCalledWith(10, 'Left WhatsApp group');
    });

    it('should not remove member that is not in active status', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'group-uuid-1' },
              error: null,
            }),
          }),
        }),
      });

      getMemberByChannelUserId.mockResolvedValue({
        success: true,
        data: { id: 10, status: 'removido' },
      });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511999887766@s.whatsapp.net'], action: 'remove' },
        mockClient
      );

      expect(markMemberAsRemoved).not.toHaveBeenCalled();
    });

    it('should handle unregistered group gracefully', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511999887766@s.whatsapp.net'], action: 'add' },
        mockClient
      );

      expect(getMemberByChannelUserId).not.toHaveBeenCalled();
      expect(createWhatsAppTrialMember).not.toHaveBeenCalled();
    });

    it('should reactivate previously removed member on rejoin', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: 'group-uuid-1' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'members') {
          return { update: mockUpdate };
        }
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      });

      getMemberByChannelUserId.mockResolvedValue({
        success: true,
        data: { id: 10, status: 'removido' },
      });

      await handleGroupParticipantsUpdate(
        { id: '120363xxx@g.us', participants: ['5511999887766@s.whatsapp.net'], action: 'add' },
        mockClient
      );

      // Should update the member status back to trial
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'trial',
          kicked_at: null,
        })
      );
      // Should NOT call createWhatsAppTrialMember since member exists
      expect(createWhatsAppTrialMember).not.toHaveBeenCalled();
    });
  });
});

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

jest.mock('../../lib/config', () => ({
  config: { membership: { trialDays: 7 } },
}));

jest.mock('../../bot/lib/configHelper', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../lib/validators', () => ({
  validateMemberId: (id) => ({ valid: true, value: id }),
  validateTelegramId: (id) => ({ valid: true, value: id }),
}));

const { getMemberByChannelUserId, createWhatsAppTrialMember } = require('../../bot/services/memberService');

describe('getMemberByChannelUserId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return member when found', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 10, channel_user_id: '+5511999887766', channel: 'whatsapp', status: 'trial' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getMemberByChannelUserId('+5511999887766', 'group-1', 'whatsapp');
    expect(result.success).toBe(true);
    expect(result.data.channel).toBe('whatsapp');
  });

  it('should return MEMBER_NOT_FOUND when not found', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getMemberByChannelUserId('+5511999887766', 'group-1', 'whatsapp');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('MEMBER_NOT_FOUND');
  });

  it('should require channelUserId', async () => {
    const result = await getMemberByChannelUserId(null, 'group-1');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('should require groupId', async () => {
    const result = await getMemberByChannelUserId('+5511999887766', null);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});

describe('createWhatsAppTrialMember', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create a new WhatsApp trial member', async () => {
    // Mock getMemberByChannelUserId (member not found)
    const mockMaybeSingle = jest.fn()
      .mockResolvedValueOnce({ data: null, error: null }); // Not found

    const mockInsertSingle = jest.fn().mockResolvedValue({
      data: { id: 42, channel: 'whatsapp', channel_user_id: '+5511999887766', status: 'trial' },
      error: null,
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'members') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: mockMaybeSingle,
                }),
              }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: mockInsertSingle,
            }),
          }),
        };
      }
    });

    const result = await createWhatsAppTrialMember({
      channelUserId: '+5511999887766',
      groupId: 'group-1',
    });

    expect(result.success).toBe(true);
    expect(result.data.channel).toBe('whatsapp');
  });

  it('should reject if member already exists', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 10, status: 'trial' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await createWhatsAppTrialMember({
      channelUserId: '+5511999887766',
      groupId: 'group-1',
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('MEMBER_ALREADY_EXISTS');
  });

  it('should require channelUserId and groupId', async () => {
    const result1 = await createWhatsAppTrialMember({ channelUserId: null, groupId: 'g1' });
    expect(result1.success).toBe(false);
    expect(result1.error.code).toBe('INVALID_INPUT');

    const result2 = await createWhatsAppTrialMember({ channelUserId: '+55', groupId: null });
    expect(result2.success).toBe(false);
    expect(result2.error.code).toBe('INVALID_INPUT');
  });
});

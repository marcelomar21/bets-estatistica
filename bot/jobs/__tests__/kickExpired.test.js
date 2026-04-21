jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../lib/configHelper', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../telegram', () => ({
  getAllBots: jest.fn(),
}));

const mockSendPrivateMessage = jest.fn();
const mockFormatFarewellMessage = jest.fn();
const mockSendKickWarningNotification = jest.fn();

jest.mock('../../services/notificationService', () => ({
  sendPrivateMessage: mockSendPrivateMessage,
  formatFarewellMessage: mockFormatFarewellMessage,
  sendKickWarningNotification: mockSendKickWarningNotification,
}));

const mockKickMemberFromGroup = jest.fn();
const mockMarkMemberAsRemoved = jest.fn();
const mockGetMemberById = jest.fn();

jest.mock('../../services/memberService', () => ({
  kickMemberFromGroup: mockKickMemberFromGroup,
  markMemberAsRemoved: mockMarkMemberAsRemoved,
  getMemberById: mockGetMemberById,
}));

const { alertAdmin: mockAlertAdmin } = require('../../services/alertService');

jest.mock('../../services/alertService', () => ({
  alertAdmin: jest.fn(),
}));

const mockRegisterMemberEvent = jest.fn();
jest.mock('../../handlers/memberEvents', () => ({
  registerMemberEvent: mockRegisterMemberEvent,
}));

const mockChannelSendDM = jest.fn();
jest.mock('../../../lib/channelAdapter', () => ({
  sendDM: mockChannelSendDM,
}));

jest.mock('../../../lib/phoneUtils', () => ({
  phoneToJid: jest.fn((phone) => phone.replace('+', '') + '@s.whatsapp.net'),
}));

const mockResolveGroupClient = jest.fn();
const mockRevokeInviteLink = jest.fn();
jest.mock('../../../whatsapp/services/inviteLinkService', () => ({
  resolveGroupClient: mockResolveGroupClient,
  revokeInviteLink: mockRevokeInviteLink,
}));

const { processMemberKick } = require('../membership/kick-expired');

describe('kick-expired — WhatsApp kick flow (Story 15-4)', () => {
  const groupData = {
    id: 'group-uuid-1',
    name: 'Guru da Bet',
    checkout_url: 'https://pay.test/checkout',
    whatsapp_group_jid: '120363xxx@g.us',
  };

  const whatsappMember = {
    id: 'member-wa-1',
    telegram_id: null,
    telegram_username: null,
    channel: 'whatsapp',
    channel_user_id: '+5511999887766',
    group_id: 'group-uuid-1',
    status: 'trial',
  };

  const mockClient = {
    removeGroupParticipant: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkMemberAsRemoved.mockResolvedValue({ success: true, data: { id: 'member-wa-1' } });
    mockRegisterMemberEvent.mockResolvedValue({ success: true });
    mockChannelSendDM.mockResolvedValue({ success: true, data: { messageId: 'dm-farewell' } });
    mockResolveGroupClient.mockResolvedValue({ client: mockClient, groupJid: '120363xxx@g.us' });
    mockClient.removeGroupParticipant.mockResolvedValue({ success: true });
    mockRevokeInviteLink.mockResolvedValue({ success: true, data: { inviteLink: 'https://chat.whatsapp.com/new' } });
  });

  it('should kick WhatsApp member: farewell DM + remove + mark removed + revoke invite', async () => {
    const result = await processMemberKick(whatsappMember, 'trial_expired', groupData);

    expect(result.success).toBe(true);
    expect(result.data.channel).toBe('whatsapp');

    // 1. Farewell DM sent
    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('trial expirou'),
      { channel: 'whatsapp', groupId: 'group-uuid-1' }
    );

    // 2. Removed from WhatsApp group
    expect(mockClient.removeGroupParticipant).toHaveBeenCalledWith(
      '120363xxx@g.us',
      '5511999887766@s.whatsapp.net'
    );

    // 3. Marked as removed
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith('member-wa-1', 'trial_expired');

    // 4. Invite revoked
    expect(mockRevokeInviteLink).toHaveBeenCalledWith('group-uuid-1');

    // 5. Audit event
    expect(mockRegisterMemberEvent).toHaveBeenCalledWith(
      'member-wa-1',
      'kick',
      expect.objectContaining({ channel: 'whatsapp', phone: '+5511999887766', inviteRevoked: true })
    );
  });

  it('should include inadimplencia text for payment_failed reason', async () => {
    const result = await processMemberKick(whatsappMember, 'payment_failed', groupData);

    expect(result.success).toBe(true);
    expect(mockChannelSendDM).toHaveBeenCalledWith(
      '+5511999887766',
      expect.stringContaining('inadimplencia'),
      expect.any(Object)
    );
  });

  it('should include checkout URL in farewell if available', async () => {
    await processMemberKick(whatsappMember, 'trial_expired', groupData);

    const dmText = mockChannelSendDM.mock.calls[0][1];
    expect(dmText).toContain('https://pay.test/checkout');
  });

  it('should skip WhatsApp member without channel_user_id', async () => {
    const noPhoneMember = { ...whatsappMember, channel_user_id: null };
    const result = await processMemberKick(noPhoneMember, 'trial_expired', groupData);

    expect(result.success).toBe(true);
    expect(result.data.skipped).toBe(true);
    expect(result.data.reason).toBe('no_channel_user_id');
    expect(mockMarkMemberAsRemoved).toHaveBeenCalledWith('member-wa-1', 'trial_expired');
    expect(mockClient.removeGroupParticipant).not.toHaveBeenCalled();
  });

  it('should fail gracefully if resolveGroupClient fails', async () => {
    mockResolveGroupClient.mockResolvedValue({ error: { code: 'NO_ACTIVE_NUMBER', message: 'No number' } });

    const result = await processMemberKick(whatsappMember, 'trial_expired', groupData);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NO_ACTIVE_NUMBER');
    expect(mockMarkMemberAsRemoved).not.toHaveBeenCalled();
  });

  it('should still mark as removed even if farewell DM fails', async () => {
    mockChannelSendDM.mockResolvedValue({ success: false, error: { code: 'NO_CLIENT' } });

    const result = await processMemberKick(whatsappMember, 'trial_expired', groupData);

    expect(result.success).toBe(true);
    expect(mockMarkMemberAsRemoved).toHaveBeenCalled();
  });

  it('should succeed even if invite revocation fails (non-blocking)', async () => {
    mockRevokeInviteLink.mockResolvedValue({ success: false, error: { code: 'CLIENT_NOT_CONNECTED' } });

    const result = await processMemberKick(whatsappMember, 'trial_expired', groupData);

    expect(result.success).toBe(true);
    // Audit should reflect revocation failed
    expect(mockRegisterMemberEvent).toHaveBeenCalledWith(
      'member-wa-1',
      'kick',
      expect.objectContaining({ inviteRevoked: false })
    );
  });

  it('should return error and not mark as removed if removeGroupParticipant fails', async () => {
    mockClient.removeGroupParticipant.mockResolvedValue({
      success: false,
      error: { code: 'REMOVE_FAILED', message: 'Not admin' },
    });

    const result = await processMemberKick(whatsappMember, 'trial_expired', groupData);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('REMOVE_FAILED');
    expect(mockMarkMemberAsRemoved).not.toHaveBeenCalled();
    expect(mockRevokeInviteLink).not.toHaveBeenCalled();
  });

  it('should not call Telegram functions for WhatsApp members', async () => {
    await processMemberKick(whatsappMember, 'trial_expired', groupData);

    expect(mockSendPrivateMessage).not.toHaveBeenCalled();
    expect(mockKickMemberFromGroup).not.toHaveBeenCalled();
  });
});

describe('kick-expired — Telegram kick flow (unchanged)', () => {
  const groupData = {
    id: 'group-uuid-1',
    name: 'Guru da Bet',
    telegram_group_id: '-1003363567204',
    checkout_url: 'https://pay.test/checkout',
  };

  const telegramMember = {
    id: 'member-tg-1',
    telegram_id: 12345,
    telegram_username: 'testuser',
    channel: 'telegram',
    channel_user_id: null,
    group_id: 'group-uuid-1',
    status: 'inadimplente',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkMemberAsRemoved.mockResolvedValue({ success: true, data: { id: 'member-tg-1' } });
    mockRegisterMemberEvent.mockResolvedValue({ success: true });
    mockKickMemberFromGroup.mockResolvedValue({ success: true, data: { until_date: 123 } });
    mockFormatFarewellMessage.mockReturnValue('Farewell message');
    mockSendPrivateMessage.mockResolvedValue({ success: true, data: { messageId: 'tg-msg' } });
  });

  it('should kick Telegram member via existing flow', async () => {
    const result = await processMemberKick(telegramMember, 'payment_failed', groupData, { bot: true });

    expect(result.success).toBe(true);
    expect(result.data.kicked).toBe(true);

    // Should use Telegram-specific functions
    expect(mockSendPrivateMessage).toHaveBeenCalled();
    expect(mockKickMemberFromGroup).toHaveBeenCalledWith(12345, '-1003363567204', { bot: true });

    // Should NOT use WhatsApp functions
    expect(mockChannelSendDM).not.toHaveBeenCalled();
    expect(mockResolveGroupClient).not.toHaveBeenCalled();
    expect(mockRevokeInviteLink).not.toHaveBeenCalled();
  });

  it('should default to telegram when member.channel is undefined', async () => {
    const noChannelMember = { ...telegramMember, channel: undefined };
    const result = await processMemberKick(noChannelMember, 'payment_failed', groupData, { bot: true });

    expect(result.success).toBe(true);
    expect(mockKickMemberFromGroup).toHaveBeenCalled();
    expect(mockChannelSendDM).not.toHaveBeenCalled();
  });
});

describe('kick-expired — telegram_group_id normalization (B4 regression)', () => {
  const telegramMember = {
    id: 'member-tg-pos',
    telegram_id: 99999,
    telegram_username: 'positive_group_user',
    channel: 'telegram',
    channel_user_id: null,
    group_id: 'group-uuid-pos',
    status: 'inadimplente',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkMemberAsRemoved.mockResolvedValue({ success: true, data: { id: 'member-tg-pos' } });
    mockRegisterMemberEvent.mockResolvedValue({ success: true });
    mockKickMemberFromGroup.mockResolvedValue({ success: true, data: { until_date: 123 } });
    mockFormatFarewellMessage.mockReturnValue('Farewell');
    mockSendPrivateMessage.mockResolvedValue({ success: true, data: { messageId: 'tg-msg' } });
  });

  it('K1: kicks a telegram member when group.telegram_group_id is stored positive (no -100 prefix)', async () => {
    const groupData = {
      id: 'group-uuid-pos',
      name: 'MEMBROS MIL GRAU',
      telegram_group_id: 3836475731, // positive — stored without -100 prefix
      checkout_url: null,
    };

    const result = await processMemberKick(telegramMember, 'trial_expired', groupData, { bot: true });

    expect(result.success).toBe(true);
    expect(result.data.kicked).toBe(true);
    // kickMemberFromGroup should receive the normalized form
    expect(mockKickMemberFromGroup).toHaveBeenCalledWith(
      99999,
      '-1003836475731',
      { bot: true }
    );
  });

  it('K4: returns INVALID_CHAT_ID error when telegram_group_id is null and no botCtx fallback', async () => {
    const groupData = {
      id: 'group-uuid-pos',
      name: 'Bad group',
      telegram_group_id: null,
      checkout_url: null,
    };

    const result = await processMemberKick(telegramMember, 'trial_expired', groupData, null);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_CHAT_ID');
    expect(mockKickMemberFromGroup).not.toHaveBeenCalled();
  });
});

describe('kick-expired — RACE_CONDITION recheck (B5 fix)', () => {
  const groupData = {
    id: 'group-uuid-race',
    name: 'Race group',
    telegram_group_id: '-1003659711655',
    checkout_url: null,
  };

  const telegramMember = {
    id: 'member-race',
    telegram_id: 42,
    telegram_username: 'racer',
    channel: 'telegram',
    channel_user_id: null,
    group_id: 'group-uuid-race',
    status: 'inadimplente',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterMemberEvent.mockResolvedValue({ success: true });
    mockKickMemberFromGroup.mockResolvedValue({ success: true, data: { until_date: 123 } });
    mockFormatFarewellMessage.mockReturnValue('Farewell');
    mockSendPrivateMessage.mockResolvedValue({ success: true, data: { messageId: 'tg-msg' } });
  });

  it('K2: race + final status = removido → success without alertAdmin', async () => {
    mockMarkMemberAsRemoved.mockResolvedValue({
      success: false,
      error: { code: 'RACE_CONDITION', message: 'race' },
    });
    mockGetMemberById.mockResolvedValue({
      success: true,
      data: { id: 'member-race', status: 'removido' },
    });

    const result = await processMemberKick(telegramMember, 'trial_expired', groupData, { bot: true });

    expect(result.success).toBe(true);
    expect(result.data.raceWithWebhook).toBe(true);
    expect(mockAlertAdmin).not.toHaveBeenCalled();
  });

  it('K3: race + final status != removido → original critical alertAdmin path', async () => {
    mockMarkMemberAsRemoved.mockResolvedValue({
      success: false,
      error: { code: 'RACE_CONDITION', message: 'race' },
    });
    mockGetMemberById.mockResolvedValue({
      success: true,
      data: { id: 'member-race', status: 'ativo' },
    });

    const result = await processMemberKick(telegramMember, 'trial_expired', groupData, { bot: true });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('REMOVE_AFTER_KICK_FAILED');
    expect(mockAlertAdmin).toHaveBeenCalled();
  });
});

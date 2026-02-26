/**
 * Tests: startCommand.js - Story 2-2: TRIAL_MODE branching + internal trial flow
 */

// Mock dependencies
jest.mock('../../../lib/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockGetConfig = jest.fn();
jest.mock('../../lib/configHelper', () => ({
  getConfig: mockGetConfig,
}));

const mockSendMessage = jest.fn().mockResolvedValue({});
const mockCreateChatInviteLink = jest.fn().mockResolvedValue({ invite_link: 'https://t.me/+abc123' });
const mockGetChatMember = jest.fn();
const mockUnbanChatMember = jest.fn().mockResolvedValue({});

jest.mock('../../telegram', () => ({
  getBot: () => ({
    sendMessage: mockSendMessage,
    createChatInviteLink: mockCreateChatInviteLink,
    getChatMember: mockGetChatMember,
    unbanChatMember: mockUnbanChatMember,
  }),
  getDefaultBotCtx: () => ({ publicGroupId: '-1001234567890' }),
}));

const mockGetMemberByTelegramId = jest.fn();
const mockGetMemberByEmail = jest.fn();
const mockCanRejoinGroup = jest.fn();
const mockReactivateMember = jest.fn();
const mockGetTrialDaysRemaining = jest.fn();
const mockLinkTelegramId = jest.fn();
const mockGetTrialDays = jest.fn().mockResolvedValue({ success: true, data: { days: 7, source: 'system_config' } });
const mockCreateTrialMember = jest.fn();

jest.mock('../../services/memberService', () => ({
  getMemberByTelegramId: mockGetMemberByTelegramId,
  getMemberByEmail: mockGetMemberByEmail,
  canRejoinGroup: mockCanRejoinGroup,
  reactivateMember: mockReactivateMember,
  getTrialDaysRemaining: mockGetTrialDaysRemaining,
  linkTelegramId: mockLinkTelegramId,
  getTrialDays: mockGetTrialDays,
  createTrialMember: mockCreateTrialMember,
}));

const mockGetSuccessRateForDays = jest.fn().mockResolvedValue({
  success: true,
  data: { rate: 72.5 },
});
jest.mock('../../services/metricsService', () => ({
  getSuccessRateForDays: mockGetSuccessRateForDays,
}));

jest.mock('../../../lib/config', () => ({
  config: {
    membership: {
      groupId: '-1001234567890',
      checkoutUrl: 'https://checkout.mp/test',
      operatorUsername: 'admin',
      subscriptionPrice: 'R$50/mês',
    },
  },
}));

const mockSupabaseFrom = jest.fn().mockReturnValue({
  update: jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  }),
  insert: jest.fn().mockResolvedValue({ error: null }),
});
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}));

const { handleStartCommand } = require('../startCommand');

// Helper to create a mock Telegram message
function createMsg(overrides = {}) {
  return {
    from: { id: 12345, username: 'testuser', first_name: 'João' },
    chat: { id: 12345, type: 'private' },
    text: '/start',
    ...overrides,
  };
}

describe('Story 2-2: TRIAL_MODE branching in handleStartCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrialDays.mockResolvedValue({ success: true, data: { days: 7, source: 'system_config' } });
  });

  describe('TRIAL_MODE=internal, new user', () => {
    it('creates trial member and sends invite (AC #1)', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockCreateTrialMember.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-1',
          telegram_id: '12345',
          status: 'trial',
          trial_ends_at: '2026-03-04T00:00:00.000Z',
        },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.success).toBe(true);
      expect(mockCreateTrialMember).toHaveBeenCalledWith(
        {
          telegramId: 12345,
          telegramUsername: 'testuser',
          email: null,
          groupId: '-1001234567890',
        },
        7
      );
      // Should NOT ask for email
      const sentMessages = mockSendMessage.mock.calls.map(c => c[1]);
      const emailAsked = sentMessages.some(m => typeof m === 'string' && m.includes('email'));
      expect(emailAsked).toBe(false);
      // Should send welcome with invite
      const welcomeCall = mockSendMessage.mock.calls.find(c =>
        typeof c[1] === 'string' && c[1].includes('Bem-vindo')
      );
      expect(welcomeCall).toBeDefined();
      expect(welcomeCall[1]).toContain('trial de');
      // Verify expiration date is shown (format depends on locale/timezone)
      expect(welcomeCall[1]).toMatch(/Válido até:.*2026/);
    });

    it('sends welcome with checkout button for internal trial (AC #1)', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockCreateTrialMember.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-1',
          telegram_id: '12345',
          status: 'trial',
          trial_ends_at: '2026-03-04T00:00:00.000Z',
        },
      });

      await handleStartCommand(createMsg());

      const welcomeCall = mockSendMessage.mock.calls.find(c =>
        typeof c[1] === 'string' && c[1].includes('Bem-vindo')
      );
      expect(welcomeCall).toBeDefined();
      const opts = welcomeCall[2];
      const keyboard = opts.reply_markup.inline_keyboard;
      // Two buttons: enter group + subscribe
      expect(keyboard).toHaveLength(2);
      expect(keyboard[0][0].text).toContain('ENTRAR NO GRUPO');
      expect(keyboard[1][0].text).toContain('ASSINAR');
      expect(keyboard[1][0].url).toBe('https://checkout.mp/test');
    });
  });

  describe('TRIAL_MODE=mercadopago, new user', () => {
    it('asks for email (original flow unchanged) (AC #2)', async () => {
      mockGetConfig.mockResolvedValue('mercadopago');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.success).toBe(true);
      expect(result.action).toBe('waiting_email');
      // Should ask for email
      const sentMessages = mockSendMessage.mock.calls.map(c => c[1]);
      const emailAsked = sentMessages.some(m => typeof m === 'string' && m.includes('email'));
      expect(emailAsked).toBe(true);
      // Should NOT create trial member
      expect(mockCreateTrialMember).not.toHaveBeenCalled();
    });
  });

  describe('TRIAL_MODE=internal, existing member (AC #3)', () => {
    it('shows trial status for existing trial member already in group', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-2',
          telegram_id: '12345',
          status: 'trial',
          joined_group_at: '2026-02-20T00:00:00.000Z',
        },
      });
      mockGetChatMember.mockResolvedValue({ status: 'member' });
      mockGetTrialDaysRemaining.mockResolvedValue({
        success: true,
        data: { daysRemaining: 5 },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.success).toBe(true);
      expect(result.action).toBe('already_in_group');
      // Should NOT create duplicate
      expect(mockCreateTrialMember).not.toHaveBeenCalled();
      // Should show status
      const statusMsg = mockSendMessage.mock.calls.find(c =>
        typeof c[1] === 'string' && c[1].includes('Dias restantes')
      );
      expect(statusMsg).toBeDefined();
      expect(statusMsg[1]).toContain('5');
    });

    it('does not duplicate member or restart trial', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-2',
          telegram_id: '12345',
          status: 'trial',
          joined_group_at: '2026-02-20T00:00:00.000Z',
        },
      });
      mockGetChatMember.mockResolvedValue({ status: 'member' });
      mockGetTrialDaysRemaining.mockResolvedValue({
        success: true,
        data: { daysRemaining: 3 },
      });

      await handleStartCommand(createMsg());

      expect(mockCreateTrialMember).not.toHaveBeenCalled();
    });
  });

  describe('TRIAL_MODE=internal, removed member (AC #3)', () => {
    it('reactivates removed member with rejoin eligibility', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-3',
          telegram_id: '12345',
          status: 'removido',
        },
      });
      mockCanRejoinGroup.mockResolvedValue({
        success: true,
        data: { canRejoin: true, hoursSinceKick: 12 },
      });
      mockReactivateMember.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-3',
          telegram_id: '12345',
          status: 'trial',
          trial_ends_at: '2026-03-04T00:00:00.000Z',
        },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.success).toBe(true);
      expect(mockReactivateMember).toHaveBeenCalledWith('uuid-3');
      expect(mockUnbanChatMember).toHaveBeenCalled();
    });
  });

  describe('TRIAL_MODE=internal, trial creation failure', () => {
    it('sends error message when createTrialMember fails', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockCreateTrialMember.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'connection refused' },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.success).toBe(false);
      expect(result.action).toBe('trial_creation_failed');
      const errorMsg = mockSendMessage.mock.calls.find(c =>
        typeof c[1] === 'string' && c[1].includes('Erro ao criar seu trial')
      );
      expect(errorMsg).toBeDefined();
    });
  });

  describe('TRIAL_MODE configurable trial days (AC #4)', () => {
    it('uses trial days from system_config', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetTrialDays.mockResolvedValue({ success: true, data: { days: 14, source: 'system_config' } });
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockCreateTrialMember.mockResolvedValue({
        success: true,
        data: {
          id: 'uuid-1',
          telegram_id: '12345',
          status: 'trial',
          trial_ends_at: '2026-03-11T00:00:00.000Z',
        },
      });

      await handleStartCommand(createMsg());

      expect(mockCreateTrialMember).toHaveBeenCalledWith(
        expect.any(Object),
        14
      );
    });
  });

  describe('non-private chat', () => {
    it('ignores /start in group chat', async () => {
      const msg = createMsg({ chat: { id: -100123, type: 'group' } });
      const result = await handleStartCommand(msg);

      expect(result.success).toBe(false);
      expect(result.action).toBe('ignored_non_private');
      expect(mockGetMemberByTelegramId).not.toHaveBeenCalled();
    });
  });
});

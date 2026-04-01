/**
 * Tests: startCommand.js - Story 2-2: TRIAL_MODE branching + internal trial flow
 *                        + Story 3-2: Terms acceptance in /start flow
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
const mockAnswerCallbackQuery = jest.fn().mockResolvedValue({});
const mockEditMessageText = jest.fn().mockResolvedValue({});

jest.mock('../../telegram', () => ({
  getBot: () => ({
    sendMessage: mockSendMessage,
    createChatInviteLink: mockCreateChatInviteLink,
    getChatMember: mockGetChatMember,
    unbanChatMember: mockUnbanChatMember,
    answerCallbackQuery: mockAnswerCallbackQuery,
    editMessageText: mockEditMessageText,
  }),
  getDefaultBotCtx: () => ({ publicGroupId: '-1001234567890', groupId: 'test-group-uuid', groupConfig: { trialDays: 7 } }),
  refreshGroupConfig: jest.fn().mockResolvedValue(null),
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

// Story 3-2: Mock termsService
const mockAcceptTerms = jest.fn();
const mockHasAcceptedVersion = jest.fn();
jest.mock('../../services/termsService', () => ({
  acceptTerms: mockAcceptTerms,
  hasAcceptedVersion: mockHasAcceptedVersion,
}));

jest.mock('../../../lib/config', () => ({
  config: {
    membership: {
      groupId: '-1001234567890',
      checkoutUrl: 'https://checkout.mp/test',
      operatorUsername: 'admin',
      subscriptionPrice: 50,
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

const { handleStartCommand, handleTermsAcceptCallback } = require('../startCommand');

// Helper to create a mock Telegram message
function createMsg(overrides = {}) {
  return {
    from: { id: 12345, username: 'testuser', first_name: 'João' },
    chat: { id: 12345, type: 'private' },
    text: '/start',
    ...overrides,
  };
}

// Helper to create a mock bot for callback tests
function createMockBot() {
  return {
    sendMessage: mockSendMessage,
    createChatInviteLink: mockCreateChatInviteLink,
    getChatMember: mockGetChatMember,
    unbanChatMember: mockUnbanChatMember,
    answerCallbackQuery: mockAnswerCallbackQuery,
    editMessageText: mockEditMessageText,
  };
}

// Helper to create a mock callback query
function createCallbackQuery(overrides = {}) {
  return {
    id: 'callback-123',
    from: { id: 12345, username: 'testuser', first_name: 'João' },
    message: {
      chat: { id: 12345, type: 'private' },
      message_id: 999,
    },
    data: 'terms_accept',
    ...overrides,
  };
}

describe('Story 2-2: TRIAL_MODE branching in handleStartCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrialDays.mockResolvedValue({ success: true, data: { days: 7, source: 'system_config' } });
    // Story 3-2: Default to terms already accepted for Story 2-2 tests
    mockHasAcceptedVersion.mockResolvedValue({
      success: true,
      data: { accepted: true, acceptance: { id: 'existing-acceptance' } },
    });
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
          groupId: 'test-group-uuid',
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
      // Only one button: enter group — no checkoutUrl because getDefaultBotCtx has no groupConfig
      expect(keyboard).toHaveLength(1);
      expect(keyboard[0][0].text).toContain('ENTRAR NO GRUPO');
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
    it('uses trial days from groupConfig', async () => {
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
          trial_ends_at: '2026-03-11T00:00:00.000Z',
        },
      });

      await handleStartCommand(createMsg());

      // Trial days come from groupConfig.trialDays (7 in mock), not getTrialDays()
      expect(mockCreateTrialMember).toHaveBeenCalledWith(
        expect.any(Object),
        7
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

describe('Story 3-2: Terms acceptance in /start flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrialDays.mockResolvedValue({ success: true, data: { days: 7, source: 'system_config' } });
  });

  describe('new user + internal → shows terms (AC #1)', () => {
    it('shows terms when user has NOT accepted current version', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockHasAcceptedVersion.mockResolvedValue({
        success: true,
        data: { accepted: false },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.success).toBe(true);
      expect(result.action).toBe('terms_shown');
      // Should NOT create trial member yet
      expect(mockCreateTrialMember).not.toHaveBeenCalled();
      // Should send terms message with inline button
      const termsCall = mockSendMessage.mock.calls.find(c =>
        typeof c[1] === 'string' && c[1].includes('Termo de Adesão')
      );
      expect(termsCall).toBeDefined();
      expect(termsCall[1]).toContain('Leia o termo completo');
      // Verify inline keyboard with accept button
      const opts = termsCall[2];
      expect(opts.parse_mode).toBe('Markdown');
      const keyboard = opts.reply_markup.inline_keyboard;
      expect(keyboard).toHaveLength(1);
      expect(keyboard[0][0].text).toContain('Li e aceito');
      expect(keyboard[0][0].callback_data).toBe('terms_accept');
    });

    it('does NOT add member to group before accepting terms (AC #1 FR6)', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockHasAcceptedVersion.mockResolvedValue({
        success: true,
        data: { accepted: false },
      });

      await handleStartCommand(createMsg());

      expect(mockCreateTrialMember).not.toHaveBeenCalled();
      expect(mockCreateChatInviteLink).not.toHaveBeenCalled();
    });
  });

  describe('callback accept → registers + creates trial (AC #2)', () => {
    it('registers acceptance and proceeds with trial creation', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockAcceptTerms.mockResolvedValue({
        success: true,
        data: { id: 'acceptance-uuid-1', accepted_at: '2026-02-25T12:00:00Z' },
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

      const bot = createMockBot();
      const result = await handleTermsAcceptCallback(bot, createCallbackQuery());

      // Should register acceptance
      expect(mockAcceptTerms).toHaveBeenCalledWith(
        12345,
        'test-group-uuid',
        expect.any(String), // termsVersion from getConfig
        expect.any(String)  // termsUrl from getConfig
      );
      // Should answer callback
      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith('callback-123', { text: '✅ Termos aceitos!' });
      // Should edit original message
      expect(mockEditMessageText).toHaveBeenCalledWith(
        '✅ Termos aceitos! Preparando seu acesso...',
        { chat_id: 12345, message_id: 999 }
      );
      // Should proceed with trial creation
      expect(mockCreateTrialMember).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('sends error on acceptance failure', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockAcceptTerms.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'connection refused' },
      });

      const bot = createMockBot();
      const result = await handleTermsAcceptCallback(bot, createCallbackQuery());

      expect(result.success).toBe(false);
      expect(result.action).toBe('terms_accept_failed');
      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith('callback-123', {
        text: '❌ Erro ao registrar aceite. Tente novamente.',
      });
      // Should NOT create trial
      expect(mockCreateTrialMember).not.toHaveBeenCalled();
    });
  });

  describe('already accepted current version → skips terms (AC #4)', () => {
    it('proceeds directly to trial when terms already accepted', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockHasAcceptedVersion.mockResolvedValue({
        success: true,
        data: { accepted: true, acceptance: { id: 'prev-acceptance' } },
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
      // Should go straight to trial — no terms message
      const termsCall = mockSendMessage.mock.calls.find(c =>
        typeof c[1] === 'string' && c[1].includes('Termo de Adesão')
      );
      expect(termsCall).toBeUndefined();
      // Should create trial directly
      expect(mockCreateTrialMember).toHaveBeenCalled();
    });
  });

  describe('terms version changed → re-shows terms (AC #5)', () => {
    it('shows terms again when version is updated', async () => {
      // getConfig returns 'internal' for all calls — termsVersion will be 'internal'
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      // User accepted old version, NOT the current one
      mockHasAcceptedVersion.mockResolvedValue({
        success: true,
        data: { accepted: false },
      });

      const result = await handleStartCommand(createMsg());

      expect(result.action).toBe('terms_shown');
      expect(mockCreateTrialMember).not.toHaveBeenCalled();
      // hasAcceptedVersion was called (with current version)
      expect(mockHasAcceptedVersion).toHaveBeenCalledWith(
        12345,
        'test-group-uuid',
        expect.any(String) // termsVersion from getConfig
      );
    });
  });

  describe('TRIAL_MODE=mercadopago → no terms shown (AC #5)', () => {
    it('does not check terms in mercadopago flow', async () => {
      mockGetConfig.mockResolvedValue('mercadopago');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });

      await handleStartCommand(createMsg());

      // Should NOT call hasAcceptedVersion
      expect(mockHasAcceptedVersion).not.toHaveBeenCalled();
      expect(mockAcceptTerms).not.toHaveBeenCalled();
    });
  });

  describe('/start re-entry without acceptance (AC #3)', () => {
    it('re-shows terms when user sends /start again without accepting', async () => {
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockHasAcceptedVersion.mockResolvedValue({
        success: true,
        data: { accepted: false },
      });

      // First /start
      const result1 = await handleStartCommand(createMsg());
      expect(result1.action).toBe('terms_shown');

      jest.clearAllMocks();
      mockGetConfig.mockResolvedValue('internal');
      mockGetMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      mockHasAcceptedVersion.mockResolvedValue({
        success: true,
        data: { accepted: false },
      });

      // Second /start — should re-show terms
      const result2 = await handleStartCommand(createMsg());
      expect(result2.action).toBe('terms_shown');
      expect(mockCreateTrialMember).not.toHaveBeenCalled();
    });
  });
});

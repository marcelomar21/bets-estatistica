/**
 * Tests for memberEvents.js handler
 * Story 16.4: Implementar Detecção de Entrada e Sistema de Trial
 */

// Mock dependencies before importing the handler
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

jest.mock('../../lib/config', () => ({
  config: {
    membership: {
      trialDays: 7,
      checkoutUrl: 'https://test.checkout.com',
      operatorUsername: 'testoperator',
    },
  },
}));

jest.mock('../../bot/telegram', () => ({
  getBot: jest.fn(),
}));

jest.mock('../../bot/services/memberService', () => ({
  getMemberByTelegramId: jest.fn(),
  createTrialMember: jest.fn(),
  canRejoinGroup: jest.fn(),
  reactivateMember: jest.fn(),
  getTrialDays: jest.fn(),
}));

jest.mock('../../bot/services/metricsService', () => ({
  getSuccessRateForDays: jest.fn(),
}));

const {
  handleNewChatMembers,
  processNewMember,
  sendWelcomeMessage,
  sendPaymentRequiredMessage,
  registerMemberEvent,
} = require('../../bot/handlers/memberEvents');
const { getBot } = require('../../bot/telegram');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByTelegramId,
  createTrialMember,
  canRejoinGroup,
  reactivateMember,
  getTrialDays,
} = require('../../bot/services/memberService');
const { getSuccessRateForDays } = require('../../bot/services/metricsService');

describe('memberEvents', () => {
  let mockBot;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 12345 }),
    };
    getBot.mockReturnValue(mockBot);
    getSuccessRateForDays.mockResolvedValue({
      success: true,
      data: { rate: 72.5 },
    });
    getTrialDays.mockResolvedValue({
      success: true,
      data: { days: 7, source: 'mock' },
    });
  });

  // ============================================
  // handleNewChatMembers (AC: #1)
  // ============================================
  describe('handleNewChatMembers', () => {
    test('processa múltiplos novos membros', async () => {
      const msg = {
        new_chat_members: [
          { id: 111, username: 'user1', first_name: 'User1', is_bot: false },
          { id: 222, username: 'user2', first_name: 'User2', is_bot: false },
        ],
      };

      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial' },
      });

      // Mock notification insert
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await handleNewChatMembers(msg);

      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(0);
      expect(createTrialMember).toHaveBeenCalledTimes(2);
    });

    test('ignora bots (1.2)', async () => {
      const msg = {
        new_chat_members: [
          { id: 111, username: 'realuser', first_name: 'Real', is_bot: false },
          { id: 999, username: 'testbot', first_name: 'Bot', is_bot: true },
        ],
      };

      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial' },
      });
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await handleNewChatMembers(msg);

      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(createTrialMember).toHaveBeenCalledTimes(1);
    });

    test('retorna 0 processados para array vazio', async () => {
      const msg = { new_chat_members: [] };

      const result = await handleNewChatMembers(msg);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  // ============================================
  // processNewMember (AC: #2)
  // ============================================
  describe('processNewMember', () => {
    test('cria novo trial member com sucesso (1.5)', async () => {
      const user = { id: 12345, username: 'newuser', first_name: 'New' };

      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial' },
      });
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await processNewMember(user);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('created');
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 12345, telegramUsername: 'newuser' },
        7
      );
    });

    test('ignora membro existente em trial/ativo (1.8)', async () => {
      const user = { id: 12345, username: 'existinguser', first_name: 'Existing' };

      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial', telegram_id: 12345 },
      });

      const result = await processNewMember(user);

      expect(result.processed).toBe(false);
      expect(result.action).toBe('already_exists');
      expect(createTrialMember).not.toHaveBeenCalled();
    });

    test('reativa membro removido < 24h (1.6)', async () => {
      const user = { id: 12345, username: 'returneduser', first_name: 'Returned' };

      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'removido', telegram_id: 12345 },
      });
      canRejoinGroup.mockResolvedValue({
        success: true,
        data: { canRejoin: true, hoursSinceKick: 12 },
      });
      reactivateMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial' },
      });
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await processNewMember(user);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('reactivated');
      expect(reactivateMember).toHaveBeenCalledWith(1);
    });

    test('requer pagamento para membro removido > 24h (1.7)', async () => {
      const user = { id: 12345, username: 'lateuser', first_name: 'Late' };

      getMemberByTelegramId.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'removido', telegram_id: 12345 },
      });
      canRejoinGroup.mockResolvedValue({
        success: true,
        data: { canRejoin: false, hoursSinceKick: 48 },
      });

      const result = await processNewMember(user);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('payment_required');
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
      expect(reactivateMember).not.toHaveBeenCalled();
    });

    test('trata race condition na criação', async () => {
      const user = { id: 12345, username: 'raceuser', first_name: 'Race' };

      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_ALREADY_EXISTS' },
      });

      const result = await processNewMember(user);

      expect(result.processed).toBe(false);
      expect(result.action).toBe('race_condition');
    });
  });

  // ============================================
  // sendWelcomeMessage (AC: #5)
  // ============================================
  describe('sendWelcomeMessage', () => {
    test('envia mensagem de boas-vindas com sucesso', async () => {
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await sendWelcomeMessage(12345, 'TestUser', 1);

      expect(result.success).toBe(true);
      expect(result.data.messageId).toBe(12345);
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.sendMessage.mock.calls[0][0]).toBe(12345);
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('Bem-vindo');
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('TestUser');
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('7 dias grátis');
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('72.5%');
    });

    test('trata erro 403 quando usuário não iniciou chat (4.6)', async () => {
      const telegramError = new Error('Forbidden');
      telegramError.response = { statusCode: 403 };
      mockBot.sendMessage.mockRejectedValue(telegramError);

      const result = await sendWelcomeMessage(12345, 'TestUser', 1);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
    });

    test('registra notificação no banco (4.5)', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockReturnValue({ insert: insertMock });

      await sendWelcomeMessage(12345, 'TestUser', 1);

      expect(supabase.from).toHaveBeenCalledWith('member_notifications');
      expect(insertMock).toHaveBeenCalledWith({
        member_id: 1,
        type: 'welcome',
        channel: 'telegram',
        message_id: '12345',
      });
    });

    test('usa valor default quando getSuccessRateForDays falha', async () => {
      getSuccessRateForDays.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR' },
      });
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await sendWelcomeMessage(12345, 'TestUser', 1);

      expect(result.success).toBe(true);
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('N/A');
    });
  });

  // ============================================
  // sendPaymentRequiredMessage
  // ============================================
  describe('sendPaymentRequiredMessage', () => {
    test('envia mensagem de pagamento com sucesso', async () => {
      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await sendPaymentRequiredMessage(12345, 1);

      expect(result.success).toBe(true);
      expect(result.data.messageId).toBe(12345);
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('ASSINAR');
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('R$50/MÊS');
      expect(mockBot.sendMessage.mock.calls[0][1]).toContain('test.checkout.com');
    });

    test('registra notificação no banco quando memberId fornecido', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockReturnValue({ insert: insertMock });

      await sendPaymentRequiredMessage(12345, 1);

      expect(supabase.from).toHaveBeenCalledWith('member_notifications');
      expect(insertMock).toHaveBeenCalledWith({
        member_id: 1,
        type: 'payment_required',
        channel: 'telegram',
        message_id: '12345',
      });
    });

    test('trata erro 403 quando usuário não iniciou chat', async () => {
      const telegramError = new Error('Forbidden');
      telegramError.response = { statusCode: 403 };
      mockBot.sendMessage.mockRejectedValue(telegramError);

      const result = await sendPaymentRequiredMessage(12345);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_BLOCKED_BOT');
    });
  });

  // ============================================
  // registerMemberEvent (AC: #3)
  // ============================================
  describe('registerMemberEvent', () => {
    test('registra evento join com sucesso', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockReturnValue({ insert: insertMock });

      const result = await registerMemberEvent(1, 'join', {
        telegram_id: 12345,
        source: 'telegram_webhook',
      });

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('member_events');
      expect(insertMock).toHaveBeenCalledWith({
        member_id: 1,
        event_type: 'join',
        payload: { telegram_id: 12345, source: 'telegram_webhook' },
      });
    });

    test('retorna erro quando insert falha', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: { message: 'DB error' } });
      supabase.from.mockReturnValue({ insert: insertMock });

      const result = await registerMemberEvent(1, 'join', {});

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });
});

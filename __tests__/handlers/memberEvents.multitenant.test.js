/**
 * Tests for memberEvents.js multi-tenant functionality
 * Story 3.1: Task 7.5 - Test processNewMember with groupId
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
      groupId: 'mt-group-uuid',
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

jest.mock('../../bot/services/notificationService', () => ({
  registerNotification: jest.fn().mockResolvedValue({ success: true }),
}));

const {
  handleNewChatMembers,
  processNewMember,
} = require('../../bot/handlers/memberEvents');
const { getBot } = require('../../bot/telegram');
const { supabase } = require('../../lib/supabase');
const {
  getMemberByTelegramId,
  createTrialMember,
  getTrialDays,
} = require('../../bot/services/memberService');
const { getSuccessRateForDays } = require('../../bot/services/metricsService');

describe('memberEvents - Multi-tenant (Story 3.1)', () => {
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

    // Default: supabase.from().insert/update succeed
    const mockChain = {
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    supabase.from.mockReturnValue(mockChain);
  });

  describe('handleNewChatMembers passes groupId', () => {
    test('calls processNewMember which passes groupId to getMemberByTelegramId and createTrialMember', async () => {
      const groupId = 'mt-group-uuid'; // from config mock

      // New member → not found → create
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 100, telegram_id: '555', group_id: groupId },
      });

      const msg = {
        new_chat_members: [
          { id: 555, username: 'newuser', first_name: 'Test', is_bot: false },
        ],
      };

      await handleNewChatMembers(msg);

      // Verify getMemberByTelegramId was called with groupId
      expect(getMemberByTelegramId).toHaveBeenCalledWith(555, groupId);

      // Verify createTrialMember was called with groupId in the data
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 555, telegramUsername: 'newuser', groupId },
        7
      );
    });
  });

  describe('processNewMember with groupId', () => {
    test('passes groupId to getMemberByTelegramId', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 200 },
      });

      const user = { id: 777, username: 'user777', first_name: 'Seven' };
      await processNewMember(user, 'custom-group-id');

      expect(getMemberByTelegramId).toHaveBeenCalledWith(777, 'custom-group-id');
    });

    test('passes groupId to createTrialMember for new members', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 300 },
      });

      const user = { id: 888, username: 'user888', first_name: 'Eight' };
      await processNewMember(user, 'another-group');

      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 888, telegramUsername: 'user888', groupId: 'another-group' },
        7
      );
    });

    test('works without groupId (backward compat)', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 400 },
      });

      const user = { id: 999, username: 'user999', first_name: 'Nine' };
      await processNewMember(user);

      // groupId defaults to null
      expect(getMemberByTelegramId).toHaveBeenCalledWith(999, null);
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 999, telegramUsername: 'user999', groupId: null },
        7
      );
    });

    test('uses group checkout_url in welcome message when groupId is provided', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 500 },
      });

      supabase.from.mockImplementation((table) => {
        if (table === 'groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { checkout_url: 'https://group.checkout/specific' },
              error: null,
            }),
          };
        }

        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
      });

      const user = { id: 123123, username: 'checkoutuser', first_name: 'Checkout' };
      await processNewMember(user, 'group-with-checkout');

      expect(mockBot.sendMessage).toHaveBeenCalled();
      const sentMessage = mockBot.sendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('https://group.checkout/specific');
    });
  });
});

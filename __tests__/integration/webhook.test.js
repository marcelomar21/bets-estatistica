/**
 * Integration tests for Telegram webhook endpoint
 * Story 16.4: Tests webhook → handler flow for new_chat_members
 */

// Mock dependencies before importing anything
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
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
    telegram: {
      botToken: 'test-token-123',
      adminGroupId: '-100111111',
      publicGroupId: '-100222222',
    },
    membership: {
      trialDays: 7,
      checkoutUrl: 'https://test.checkout.com',
      operatorUsername: 'testoperator',
    },
  },
  validateConfig: jest.fn(),
}));

jest.mock('../../bot/telegram', () => ({
  initBot: jest.fn(),
  getBot: jest.fn().mockReturnValue({
    sendMessage: jest.fn().mockResolvedValue({ message_id: 12345 }),
  }),
  setWebhook: jest.fn().mockResolvedValue({ success: true }),
  testConnection: jest.fn().mockResolvedValue({
    success: true,
    data: { username: 'test_bot' },
  }),
}));

jest.mock('../../bot/services/memberService', () => ({
  getMemberByTelegramId: jest.fn(),
  createTrialMember: jest.fn(),
  canRejoinGroup: jest.fn(),
  reactivateMember: jest.fn(),
  getTrialDays: jest.fn().mockResolvedValue({ success: true, data: { days: 7, source: 'mock' } }),
}));

jest.mock('../../bot/services/metricsService', () => ({
  getSuccessRateForDays: jest.fn().mockResolvedValue({
    success: true,
    data: { rate: 72.5 },
  }),
}));

jest.mock('../../bot/handlers/adminGroup', () => ({
  handleAdminMessage: jest.fn().mockResolvedValue({}),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const { config } = require('../../lib/config');
const { getBot } = require('../../bot/telegram');
const { handleNewChatMembers } = require('../../bot/handlers/memberEvents');
const {
  getMemberByTelegramId,
  createTrialMember,
} = require('../../bot/services/memberService');

// Create a minimal express app for testing
const app = express();
app.use(express.json());

// Import the handler
const { handleAdminMessage } = require('../../bot/handlers/adminGroup');

app.post(`/webhook/${config.telegram.botToken}`, async (req, res) => {
  try {
    const update = req.body;
    const bot = getBot();

    if (update.message) {
      const msg = update.message;

      // Story 16.4: Detect new members joining the PUBLIC group
      if (msg.new_chat_members && msg.chat.id.toString() === config.telegram.publicGroupId) {
        await handleNewChatMembers(msg);
      }

      // Admin group messages
      if (msg.chat.id.toString() === config.telegram.adminGroupId) {
        await handleAdminMessage(bot, msg);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(200); // Always respond 200 to avoid retries
  }
});

describe('Webhook Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /webhook/:token', () => {
    test('processa new_chat_members no grupo público', async () => {
      getMemberByTelegramId.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createTrialMember.mockResolvedValue({
        success: true,
        data: { id: 1, status: 'trial' },
      });

      const response = await request(app)
        .post(`/webhook/${config.telegram.botToken}`)
        .send({
          update_id: 123456789,
          message: {
            message_id: 1,
            chat: { id: -100222222, type: 'supergroup' },
            new_chat_members: [
              { id: 12345, username: 'newuser', first_name: 'New', is_bot: false },
            ],
          },
        });

      expect(response.status).toBe(200);
      // Story 3.1: groupId is now passed (null when not in multi-tenant config)
      expect(getMemberByTelegramId).toHaveBeenCalledWith(12345, null);
      expect(createTrialMember).toHaveBeenCalledWith(
        { telegramId: 12345, telegramUsername: 'newuser', groupId: null },
        7
      );
    });

    test('ignora new_chat_members de outros grupos', async () => {
      const response = await request(app)
        .post(`/webhook/${config.telegram.botToken}`)
        .send({
          update_id: 123456789,
          message: {
            message_id: 1,
            chat: { id: -100999999, type: 'supergroup' },
            new_chat_members: [
              { id: 12345, username: 'user', first_name: 'User', is_bot: false },
            ],
          },
        });

      expect(response.status).toBe(200);
      expect(getMemberByTelegramId).not.toHaveBeenCalled();
      expect(createTrialMember).not.toHaveBeenCalled();
    });

    test('retorna 200 mesmo quando handler falha (evitar retry)', async () => {
      getMemberByTelegramId.mockRejectedValue(new Error('DB connection failed'));

      const response = await request(app)
        .post(`/webhook/${config.telegram.botToken}`)
        .send({
          update_id: 123456789,
          message: {
            message_id: 1,
            chat: { id: -100222222, type: 'supergroup' },
            new_chat_members: [
              { id: 12345, username: 'user', first_name: 'User', is_bot: false },
            ],
          },
        });

      expect(response.status).toBe(200);
    });

    test('processa mensagem do grupo admin corretamente', async () => {
      const response = await request(app)
        .post(`/webhook/${config.telegram.botToken}`)
        .send({
          update_id: 123456789,
          message: {
            message_id: 1,
            chat: { id: -100111111, type: 'supergroup' },
            text: '/help',
            from: { id: 999, username: 'admin' },
          },
        });

      expect(response.status).toBe(200);
      expect(handleAdminMessage).toHaveBeenCalled();
    });

    test('ignora update sem message', async () => {
      const response = await request(app)
        .post(`/webhook/${config.telegram.botToken}`)
        .send({
          update_id: 123456789,
          callback_query: { id: '123' },
        });

      expect(response.status).toBe(200);
      expect(getMemberByTelegramId).not.toHaveBeenCalled();
    });
  });
});

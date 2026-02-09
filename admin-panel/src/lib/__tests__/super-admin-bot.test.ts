import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock node-telegram-bot-api
const mockSendMessage = vi.fn();
const mockGetMe = vi.fn();

vi.mock('node-telegram-bot-api', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      sendMessage: mockSendMessage,
      getMe: mockGetMe,
    })),
  };
});

vi.mock('@/lib/encryption', () => ({
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

import { sendFounderNotification, sendInvite, testFounderReachability, validateBotTokenViaTelegram } from '../super-admin-bot';

describe('super-admin-bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue({ message_id: 1 });
    mockGetMe.mockResolvedValue({ username: 'test_bot' });
  });

  describe('sendFounderNotification', () => {
    it('should send to all founders successfully', async () => {
      const result = await sendFounderNotification('token', [111, 222], 'Group1', 'Influencer1', 'https://t.me/+abc');
      expect(result.sent).toBe(2);
      expect(result.failed).toHaveLength(0);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures with allSettled', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ message_id: 1 })
        .mockRejectedValueOnce(new Error('Chat not found'));

      const result = await sendFounderNotification('token', [111, 222], 'Group1', 'Influencer1', 'https://t.me/+abc');
      expect(result.sent).toBe(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({ chatId: 222, error: 'Chat not found' });
    });

    it('should handle all failures', async () => {
      mockSendMessage.mockRejectedValue(new Error('Bot blocked'));
      const result = await sendFounderNotification('token', [111, 222], 'Group1', 'Influencer1', 'https://t.me/+abc');
      expect(result.sent).toBe(0);
      expect(result.failed).toHaveLength(2);
    });
  });

  describe('sendInvite', () => {
    it('should send telegram invite successfully', async () => {
      const result = await sendInvite('token', { type: 'telegram', chatId: 123 }, 'Group1', 'https://t.me/+abc');
      expect(result.success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle telegram send failure', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Forbidden'));
      const result = await sendInvite('token', { type: 'telegram', chatId: 123 }, 'Group1', 'https://t.me/+abc');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Forbidden');
    });

    it('should return error for email (not configured)', async () => {
      const result = await sendInvite('token', { type: 'email', email: 'test@test.com' }, 'Group1', 'https://t.me/+abc');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('testFounderReachability', () => {
    it('should return mix of reachable and unreachable', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ message_id: 1 })
        .mockRejectedValueOnce(new Error('Not found'));

      const results = await testFounderReachability('token', [111, 222]);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ chatId: 111, reachable: true });
      expect(results[1]).toEqual({ chatId: 222, reachable: false, error: 'Not found' });
    });
  });

  describe('validateBotTokenViaTelegram', () => {
    it('should return valid with username on success', async () => {
      const result = await validateBotTokenViaTelegram('valid-token');
      expect(result.valid).toBe(true);
      expect(result.username).toBe('test_bot');
    });

    it('should return invalid on failure', async () => {
      mockGetMe.mockRejectedValueOnce(new Error('401 Unauthorized'));
      const result = await validateBotTokenViaTelegram('bad-token');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('401');
    });
  });
});

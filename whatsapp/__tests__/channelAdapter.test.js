// Mock all external dependencies
jest.mock('../../bot/telegram', () => ({
  sendToPublic: jest.fn(),
  sendMediaToPublic: jest.fn(),
}));

jest.mock('../../bot/services/notificationService', () => ({
  sendPrivateMessage: jest.fn(),
}));

jest.mock('../../whatsapp/services/whatsappSender', () => ({
  sendToGroup: jest.fn(),
  sendMediaToGroup: jest.fn(),
  sendDM: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { sendMessage, sendPhoto, sendDM } = require('../../lib/channelAdapter');
const { sendToPublic, sendMediaToPublic } = require('../../bot/telegram');
const { sendPrivateMessage } = require('../../bot/services/notificationService');
const whatsappSender = require('../../whatsapp/services/whatsappSender');

describe('channelAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should return error when channel is not specified', async () => {
      const result = await sendMessage('group-1', 'Hello');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_CHANNEL');
    });

    it('should return error for unknown channel', async () => {
      const result = await sendMessage('group-1', 'Hello', { channel: 'slack' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNKNOWN_CHANNEL');
    });

    it('should delegate to Telegram sendToPublic', async () => {
      const botCtx = { bot: {}, publicGroupId: '-1001234' };
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 123 } });

      const result = await sendMessage('group-1', '*bold* text', { channel: 'telegram', botCtx });

      expect(sendToPublic).toHaveBeenCalledWith('*bold* text', botCtx);
      expect(result.success).toBe(true);
    });

    it('should return error when Telegram botCtx is missing for text', async () => {
      const result = await sendMessage('group-1', 'text', { channel: 'telegram' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_BOT_CTX');
    });

    it('should delegate to WhatsApp sendToGroup with converted text', async () => {
      whatsappSender.sendToGroup.mockResolvedValue({ success: true, data: { messageId: 'wa-123' } });

      const result = await sendMessage('group-1', '[link](https://test.com)', {
        channel: 'whatsapp',
        groupJid: '120363xxx@g.us',
      });

      // Text should be converted: inline link → plain text
      expect(whatsappSender.sendToGroup).toHaveBeenCalledWith('group-1', '120363xxx@g.us', 'link (https://test.com)');
      expect(result.success).toBe(true);
    });

    it('should return error when WhatsApp groupJid is missing', async () => {
      const result = await sendMessage('group-1', 'text', { channel: 'whatsapp' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_GROUP_JID');
    });
  });

  describe('sendPhoto', () => {
    it('should return error when channel is not specified', async () => {
      const result = await sendPhoto('group-1', 'https://img.com/pic.jpg', 'caption');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_CHANNEL');
    });

    it('should delegate to Telegram sendMediaToPublic', async () => {
      const botCtx = { bot: {}, publicGroupId: '-1001234' };
      sendMediaToPublic.mockResolvedValue({ success: true, data: { messageId: 456 } });

      const result = await sendPhoto('group-1', 'https://img.com/pic.jpg', '*caption*', {
        channel: 'telegram',
        botCtx,
      });

      expect(sendMediaToPublic).toHaveBeenCalledWith('image', 'https://img.com/pic.jpg', '*caption*', botCtx);
      expect(result.success).toBe(true);
    });

    it('should return error when Telegram botCtx is missing for media', async () => {
      const result = await sendPhoto('group-1', 'https://img.com/pic.jpg', 'caption', {
        channel: 'telegram',
      });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_BOT_CTX');
    });

    it('should delegate to WhatsApp sendMediaToGroup with converted caption', async () => {
      whatsappSender.sendMediaToGroup.mockResolvedValue({ success: true, data: { messageId: 'wa-456' } });

      const result = await sendPhoto('group-1', 'https://img.com/pic.jpg', '[see](https://link.com)', {
        channel: 'whatsapp',
        groupJid: '120363xxx@g.us',
      });

      expect(whatsappSender.sendMediaToGroup).toHaveBeenCalledWith(
        'group-1', '120363xxx@g.us', 'https://img.com/pic.jpg', 'see (https://link.com)'
      );
      expect(result.success).toBe(true);
    });
  });

  describe('sendDM', () => {
    it('should return error when channel is not specified', async () => {
      const result = await sendDM('user-123', 'Hello');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_CHANNEL');
    });

    it('should delegate to Telegram sendPrivateMessage', async () => {
      sendPrivateMessage.mockResolvedValue({ success: true, data: { messageId: 789 } });

      const result = await sendDM('12345678', 'Hello *user*', { channel: 'telegram' });

      expect(sendPrivateMessage).toHaveBeenCalledWith('12345678', 'Hello *user*', 'Markdown', null);
      expect(result.success).toBe(true);
    });

    it('should pass botInstance to Telegram DM', async () => {
      const botInstance = { sendMessage: jest.fn() };
      sendPrivateMessage.mockResolvedValue({ success: true });

      await sendDM('12345678', 'Hello', { channel: 'telegram', botInstance });

      expect(sendPrivateMessage).toHaveBeenCalledWith('12345678', 'Hello', 'Markdown', botInstance);
    });

    it('should delegate to WhatsApp sendDM with converted text', async () => {
      whatsappSender.sendDM.mockResolvedValue({ success: true, data: { messageId: 'wa-789' } });

      const result = await sendDM('+5511999887766', '[pay here](https://pay.link)', {
        channel: 'whatsapp',
        groupId: 'group-1',
      });

      expect(whatsappSender.sendDM).toHaveBeenCalledWith(
        '+5511999887766', 'pay here (https://pay.link)', 'group-1'
      );
      expect(result.success).toBe(true);
    });
  });
});

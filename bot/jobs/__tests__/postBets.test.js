/**
 * Tests: postBets.js - Job de postagem automatica
 * Story 5.4: Postagem Automatica de Apostas nos Grupos Telegram
 *
 * Tests cover:
 * - runPostBets(true) posts bets with ready status (odds + link)
 * - runPostBets(true) skips bets without deep_link
 * - runPostBets(true) skips bets with odds < 1.60 (except promovida_manual)
 * - runPostBets(true) skips bets with expired kickoff
 * - runPostBets forwards groupId + dynamic postTimes to getFilaStatus(groupId, postTimes)
 * - markBetAsPosted() records telegram_posted_at, message_id, odds_at_post
 * - No bets to post → job finishes without error
 * - sendToPublic failure → bet skipped, others continue
 * - validateBetForPosting() accepts promovida_manual with low odds
 */

// Mock modules before requiring the module under test
jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    betting: { minOdds: 1.60, maxActiveBets: 3 },
    telegram: { adminGroupId: '-100123', publicGroupId: '-100456', botToken: 'test' },
    membership: { groupId: 'test-group-uuid' },
  },
  validateConfig: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] } },
        error: null,
      }),
    })),
  },
}));

jest.mock('../../telegram', () => ({
  sendToPublic: jest.fn(),
  sendToAdmin: jest.fn(),
  getBot: jest.fn(() => ({
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    editMessageText: jest.fn().mockResolvedValue(true),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../../services/betService', () => ({
  getFilaStatus: jest.fn(),
  markBetAsPosted: jest.fn().mockResolvedValue({ success: true }),
  registrarPostagem: jest.fn().mockResolvedValue({ success: true }),
  getAvailableBets: jest.fn().mockResolvedValue({ success: true, data: [] }),
}));

jest.mock('../../services/copyService', () => ({
  generateBetCopy: jest.fn().mockResolvedValue({
    success: true,
    data: { copy: '- Stat 1\n- Stat 2' },
  }),
}));

jest.mock('../jobWarn', () => ({
  sendPostWarn: jest.fn().mockResolvedValue(true),
}));

const { runPostBets, validateBetForPosting } = require('../postBets');
const { sendToPublic } = require('../../telegram');
const { getFilaStatus, markBetAsPosted, registrarPostagem } = require('../../services/betService');

// Helper: create a bet fixture
function makeBet(overrides = {}) {
  return {
    id: overrides.id || 'bet-1',
    homeTeamName: 'Flamengo',
    awayTeamName: 'Palmeiras',
    kickoffTime: new Date(Date.now() + 3600000).toISOString(), // 1h from now
    betMarket: 'Over 2.5',
    odds: 1.85,
    deepLink: 'https://bet365.com/deep/123',
    reasoning: 'Good stats',
    promovidaManual: false,
    ...overrides,
  };
}

describe('postBets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- validateBetForPosting ----

  describe('validateBetForPosting', () => {
    it('should accept bet with valid odds, link, and future kickoff', () => {
      const bet = makeBet();
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(true);
    });

    it('should reject bet without deep_link', () => {
      const bet = makeBet({ deepLink: null });
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No deep link');
    });

    it('should reject bet with empty deep_link', () => {
      const bet = makeBet({ deepLink: '' });
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No deep link');
    });

    it('should reject bet with odds below minimum (1.60)', () => {
      const bet = makeBet({ odds: 1.40 });
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Odds below minimum');
    });

    it('should reject bet with null odds', () => {
      const bet = makeBet({ odds: null });
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Odds below minimum');
    });

    it('should accept promovida_manual=true with low odds (Story 13.5 AC6)', () => {
      const bet = makeBet({ odds: 1.30, promovidaManual: true });
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(true);
    });

    it('should reject bet with kickoff in the past', () => {
      const bet = makeBet({ kickoffTime: new Date(Date.now() - 3600000).toISOString() });
      const result = validateBetForPosting(bet);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Match already started');
    });
  });

  // ---- runPostBets ----

  describe('runPostBets', () => {
    it('should post ready bets with skipConfirmation=true', async () => {
      const bet = makeBet();
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 999 } });

      const result = await runPostBets(true);

      expect(result.posted).toBe(1);
      expect(result.totalSent).toBe(1);
      expect(result.cancelled).toBe(false);
      expect(sendToPublic).toHaveBeenCalledTimes(1);
      expect(markBetAsPosted).toHaveBeenCalledWith('bet-1', 999, 1.85);
      expect(registrarPostagem).toHaveBeenCalledWith('bet-1');
    });

    it('should skip bet without deep_link (validation fail)', async () => {
      const bet = makeBet({ deepLink: null });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should skip bet with odds < 1.60 (except promovida_manual)', async () => {
      const bet = makeBet({ odds: 1.40 });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should skip bet with kickoff in the past', async () => {
      const bet = makeBet({ kickoffTime: new Date(Date.now() - 3600000).toISOString() });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should forward configured groupId and postTimes to getFilaStatus', async () => {
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [] },
      });

      await runPostBets(true);

      expect(getFilaStatus).toHaveBeenCalledWith('test-group-uuid', ['10:00', '15:00', '22:00']);
    });

    it('should record telegram_posted_at, message_id, odds_at_post via markBetAsPosted', async () => {
      const bet = makeBet({ id: 'bet-42', odds: 2.10 });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 777 } });

      await runPostBets(true);

      expect(markBetAsPosted).toHaveBeenCalledWith('bet-42', 777, 2.10);
    });

    it('should finish without error when no bets to post', async () => {
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.reposted).toBe(0);
      expect(result.totalSent).toBe(0);
      expect(result.cancelled).toBe(false);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should skip failed bet and continue with others (partial failure)', async () => {
      const bet1 = makeBet({ id: 'bet-1' });
      const bet2 = makeBet({ id: 'bet-2' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet1, bet2] },
      });
      sendToPublic
        .mockResolvedValueOnce({ success: false, error: { message: 'Telegram error' } })
        .mockResolvedValueOnce({ success: true, data: { messageId: 888 } });

      const result = await runPostBets(true);

      expect(result.posted).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.totalSent).toBe(1);
      expect(sendToPublic).toHaveBeenCalledTimes(2);
      expect(markBetAsPosted).toHaveBeenCalledTimes(1);
      expect(markBetAsPosted).toHaveBeenCalledWith('bet-2', 888, 1.85);
    });

    it('should accept promovida_manual bet with low odds during posting', async () => {
      const bet = makeBet({ odds: 1.30, promovidaManual: true });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 555 } });

      const result = await runPostBets(true);

      expect(result.posted).toBe(1);
      expect(sendToPublic).toHaveBeenCalledTimes(1);
    });

    it('should repost active bets and register repostagem', async () => {
      const activeBet = makeBet({ id: 'active-1' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [activeBet], novas: [] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 333 } });

      const result = await runPostBets(true);

      expect(result.reposted).toBe(1);
      expect(result.posted).toBe(0);
      expect(registrarPostagem).toHaveBeenCalledWith('active-1');
      // markBetAsPosted should NOT be called for reposts (already posted)
      expect(markBetAsPosted).not.toHaveBeenCalled();
    });

    it('should handle getFilaStatus failure gracefully', async () => {
      getFilaStatus.mockResolvedValue({
        success: false,
        error: { message: 'Database error' },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.totalSent).toBe(0);
      expect(sendToPublic).not.toHaveBeenCalled();
    });
  });
});

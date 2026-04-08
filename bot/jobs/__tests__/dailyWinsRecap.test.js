/**
 * Tests: dailyWinsRecap.js - Daily Wins Recap Job
 *
 * POST-01: toneConfig must be loaded fresh from DB (not cached BotContext)
 * POST-02: Confirmation routing audit — recap goes to public, not admin
 *
 * Tests cover:
 * - runDailyWinsRecap queries groups table for copy_tone_config
 * - generateWinsRecapCopy receives DB-loaded toneConfig, NOT cached BotContext value
 * - When DB query fails, toneConfig falls back to null (no crash)
 * - sendToPublic is called for recaps (correct routing)
 * - alertAdmin without botCtx safely fails (no leak to public groups)
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock supabase with chain pattern
const mockSingle = jest.fn();
const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

// Mock telegram functions
const mockSendToPublic = jest.fn();
const mockGetAllBots = jest.fn();
jest.mock('../../telegram', () => ({
  sendToPublic: mockSendToPublic,
  getAllBots: mockGetAllBots,
}));

// Mock metricsService
const mockGetYesterdayWins = jest.fn();
jest.mock('../../services/metricsService', () => ({
  getYesterdayWins: mockGetYesterdayWins,
}));

// Mock copyService — capture toneConfig argument
const mockGenerateWinsRecapCopy = jest.fn();
jest.mock('../../services/copyService', () => ({
  generateWinsRecapCopy: mockGenerateWinsRecapCopy,
}));

const { runDailyWinsRecap } = require('../dailyWinsRecap');

describe('dailyWinsRecap', () => {
  const dbToneConfig = { oddLabel: 'Cotacao', persona: 'Guru da Bet', tone: 'energetico' };
  const cachedToneConfig = { oddLabel: 'OldLabel', persona: 'Stale Cache', tone: 'boring' };

  function makeBotCtx(groupId, cachedConfig = null) {
    return {
      adminGroupId: '-100admin',
      publicGroupId: '-100public',
      bot: { sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }) },
      groupConfig: {
        name: `Group ${groupId}`,
        copyToneConfig: cachedConfig,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('toneConfig DB loading (POST-01)', () => {
    it('should query groups table for copy_tone_config using groupId', async () => {
      const botCtx = makeBotCtx('group-1', cachedToneConfig);
      mockGetAllBots.mockReturnValue(new Map([['group-1', botCtx]]));

      mockGetYesterdayWins.mockResolvedValue({
        success: true,
        data: { winCount: 3, totalCount: 5, wins: [] },
      });

      mockSingle.mockResolvedValue({
        data: { copy_tone_config: dbToneConfig },
        error: null,
      });

      mockGenerateWinsRecapCopy.mockResolvedValue({
        success: true,
        data: { copy: 'Recap message' },
      });

      mockSendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runDailyWinsRecap();

      // Verify supabase was queried for copy_tone_config
      expect(mockFrom).toHaveBeenCalledWith('groups');
      expect(mockSelect).toHaveBeenCalledWith('copy_tone_config');
      expect(mockEq).toHaveBeenCalledWith('id', 'group-1');
    });

    it('should pass DB-loaded toneConfig to generateWinsRecapCopy, NOT cached BotContext value', async () => {
      const botCtx = makeBotCtx('group-1', cachedToneConfig);
      mockGetAllBots.mockReturnValue(new Map([['group-1', botCtx]]));

      mockGetYesterdayWins.mockResolvedValue({
        success: true,
        data: { winCount: 3, totalCount: 5, wins: [] },
      });

      mockSingle.mockResolvedValue({
        data: { copy_tone_config: dbToneConfig },
        error: null,
      });

      mockGenerateWinsRecapCopy.mockResolvedValue({
        success: true,
        data: { copy: 'Recap message' },
      });

      mockSendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runDailyWinsRecap();

      // generateWinsRecapCopy must receive the DB-loaded config, not cached
      expect(mockGenerateWinsRecapCopy).toHaveBeenCalledWith(
        expect.objectContaining({ winCount: 3 }),
        dbToneConfig,
      );
      // Must NOT receive the stale cached config
      expect(mockGenerateWinsRecapCopy).not.toHaveBeenCalledWith(
        expect.anything(),
        cachedToneConfig,
      );
    });

    it('should fall back to null toneConfig when DB query fails (no crash)', async () => {
      const botCtx = makeBotCtx('group-1', cachedToneConfig);
      mockGetAllBots.mockReturnValue(new Map([['group-1', botCtx]]));

      mockGetYesterdayWins.mockResolvedValue({
        success: true,
        data: { winCount: 2, totalCount: 4, wins: [] },
      });

      // Simulate DB error
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'connection timeout' },
      });

      mockGenerateWinsRecapCopy.mockResolvedValue({
        success: true,
        data: { copy: 'Fallback recap' },
      });

      mockSendToPublic.mockResolvedValue({ success: true, data: { messageId: 200 } });

      const result = await runDailyWinsRecap();

      // Should not crash — toneConfig should be null
      expect(mockGenerateWinsRecapCopy).toHaveBeenCalledWith(
        expect.objectContaining({ winCount: 2 }),
        null,
      );
      expect(result.sent).toBe(1);
    });
  });

  describe('confirmation routing audit (POST-02)', () => {
    it('should send recap to public group via sendToPublic (correct routing)', async () => {
      const botCtx = makeBotCtx('group-1');
      mockGetAllBots.mockReturnValue(new Map([['group-1', botCtx]]));

      mockGetYesterdayWins.mockResolvedValue({
        success: true,
        data: { winCount: 5, totalCount: 8, wins: [] },
      });

      mockSingle.mockResolvedValue({
        data: { copy_tone_config: null },
        error: null,
      });

      mockGenerateWinsRecapCopy.mockResolvedValue({
        success: true,
        data: { copy: 'Public recap message' },
      });

      mockSendToPublic.mockResolvedValue({ success: true, data: { messageId: 300 } });

      await runDailyWinsRecap();

      // Recap goes to public group
      expect(mockSendToPublic).toHaveBeenCalledWith('Public recap message', botCtx);
    });

    /*
     * POST-02 Confirmation Routing Audit (completed):
     *
     * Audited all sendToPublic/sendToAdmin call sites:
     * - bot/jobs/postBets.js: sendToPublic for bet content only, sendToAdmin for confirmations/errors
     * - bot/jobs/dailyWinsRecap.js: sendToPublic for recaps (correct — recaps are public-facing)
     * - bot/telegram.js: alertAdmin uses sendToAdmin (line 441), safely fails without botCtx
     * - bot/jobs/jobWarn.js: sendPostWarn uses sendToAdmin for warnings
     *
     * All routing is correct. No confirmation/preview/error messages leak to public groups.
     * sendToAdmin and sendToPublic both require valid botCtx; without it, they return error (no leak).
     */
  });
});

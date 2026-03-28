/**
 * Tests: generateDailyArt.js — GURU-19
 * Validates the job orchestration: fetching bets, generating art, sending to Telegram.
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockFrom = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}));

jest.mock('../../telegram', () => ({
  getAllBots: jest.fn(),
  sendMediaToPublic: jest.fn(),
}));

jest.mock('../../services/artGeneratorService', () => ({
  generateDailyArt: jest.fn(),
  generateCaption: jest.fn(() => 'test caption'),
  cleanupArtFile: jest.fn(),
}));

const { runGenerateDailyArt, getYesterdayBRT, fetchResolvedBets } = require('../generateDailyArt');
const { getAllBots, sendMediaToPublic } = require('../../telegram');
const { generateDailyArt, cleanupArtFile } = require('../../services/artGeneratorService');

// Mock Supabase query builder
function createMockQuery(data, error = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

function createMockGroupsQuery(data, error = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

const GROUP_1 = { id: 'group-1', name: 'GuruBet Tips' };
const GROUP_2 = { id: 'group-2', name: 'Osmar Palpites' };

const RESOLVED_BETS = [
  {
    id: 1,
    bet_market: 'Ambas Marcam',
    bet_pick: 'Sim',
    odds_at_post: 1.85,
    bet_result: 'success',
    result_updated_at: '2026-03-27T20:00:00Z',
    league_matches: { home_team_name: 'Flamengo', away_team_name: 'Vasco' },
  },
  {
    id: 2,
    bet_market: 'Over 2.5',
    bet_pick: 'Over',
    odds_at_post: 1.72,
    bet_result: 'failure',
    result_updated_at: '2026-03-27T21:00:00Z',
    league_matches: { home_team_name: 'Palmeiras', away_team_name: 'Santos' },
  },
  {
    id: 3,
    bet_market: 'Resultado Final',
    bet_pick: 'Liverpool',
    odds_at_post: 2.10,
    bet_result: 'success',
    result_updated_at: '2026-03-27T22:00:00Z',
    league_matches: { home_team_name: 'Liverpool', away_team_name: 'Arsenal' },
  },
];

describe('generateDailyArt job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getYesterdayBRT', () => {
    it('returns start and end of yesterday with targetDate', () => {
      const result = getYesterdayBRT();
      expect(result.startOfDay).toBeDefined();
      expect(result.endOfDay).toBeDefined();
      expect(result.targetDate).toBeInstanceOf(Date);
      // endOfDay should be after startOfDay
      expect(new Date(result.endOfDay).getTime()).toBeGreaterThan(
        new Date(result.startOfDay).getTime()
      );
    });
  });

  describe('runGenerateDailyArt', () => {
    it('generates and sends art for groups with hits', async () => {
      // Setup: 1 group with 2 success + 1 failure
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') return createMockGroupsQuery([GROUP_1]);
        if (table === 'suggested_bets') return createMockQuery(RESOLVED_BETS);
        return createMockQuery([]);
      });

      const mockBotCtx = { bot: {}, publicGroupId: '-1001234', groupId: GROUP_1.id };
      getAllBots.mockReturnValue(new Map([[GROUP_1.id, mockBotCtx]]));
      generateDailyArt.mockResolvedValue({
        success: true,
        data: { filePath: '/tmp/test-art.png' },
      });
      sendMediaToPublic.mockResolvedValue({
        success: true,
        data: { messageId: 999 },
      });

      const result = await runGenerateDailyArt();

      expect(result.generated).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(generateDailyArt).toHaveBeenCalledTimes(1);
      expect(sendMediaToPublic).toHaveBeenCalledWith(
        'image',
        '/tmp/test-art.png',
        'test caption',
        mockBotCtx
      );
      expect(cleanupArtFile).toHaveBeenCalledWith('/tmp/test-art.png');
    });

    it('skips groups with no hits', async () => {
      // All bets are failures
      const onlyFailures = [RESOLVED_BETS[1]]; // failure bet only
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') return createMockGroupsQuery([GROUP_1]);
        if (table === 'suggested_bets') return createMockQuery(onlyFailures);
        return createMockQuery([]);
      });

      const mockBotCtx = { bot: {}, publicGroupId: '-1001234', groupId: GROUP_1.id };
      getAllBots.mockReturnValue(new Map([[GROUP_1.id, mockBotCtx]]));

      const result = await runGenerateDailyArt();

      expect(result.skipped).toBe(1);
      expect(result.generated).toBe(0);
      expect(generateDailyArt).not.toHaveBeenCalled();
    });

    it('skips groups without registered bot', async () => {
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') return createMockGroupsQuery([GROUP_1, GROUP_2]);
        return createMockQuery([]);
      });

      // Only GROUP_1 has a bot
      const mockBotCtx = { bot: {}, publicGroupId: '-1001234', groupId: GROUP_1.id };
      getAllBots.mockReturnValue(new Map([[GROUP_1.id, mockBotCtx]]));

      const result = await runGenerateDailyArt();

      // GROUP_2 skipped (no bot), GROUP_1 skipped (no bets)
      expect(result.skipped).toBe(2);
    });

    it('handles art generation failure gracefully', async () => {
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') return createMockGroupsQuery([GROUP_1]);
        if (table === 'suggested_bets') return createMockQuery(RESOLVED_BETS);
        return createMockQuery([]);
      });

      const mockBotCtx = { bot: {}, publicGroupId: '-1001234', groupId: GROUP_1.id };
      getAllBots.mockReturnValue(new Map([[GROUP_1.id, mockBotCtx]]));
      generateDailyArt.mockResolvedValue({
        success: false,
        error: { code: 'ART_GENERATION_ERROR', message: 'Canvas failed' },
      });

      const result = await runGenerateDailyArt();

      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
      expect(sendMediaToPublic).not.toHaveBeenCalled();
    });

    it('handles Telegram send failure gracefully', async () => {
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') return createMockGroupsQuery([GROUP_1]);
        if (table === 'suggested_bets') return createMockQuery(RESOLVED_BETS);
        return createMockQuery([]);
      });

      const mockBotCtx = { bot: {}, publicGroupId: '-1001234', groupId: GROUP_1.id };
      getAllBots.mockReturnValue(new Map([[GROUP_1.id, mockBotCtx]]));
      generateDailyArt.mockResolvedValue({
        success: true,
        data: { filePath: '/tmp/test-art.png' },
      });
      sendMediaToPublic.mockResolvedValue({
        success: false,
        error: { code: 'TELEGRAM_ERROR', message: 'Network error' },
      });

      const result = await runGenerateDailyArt();

      expect(result.generated).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
      // Should still cleanup the temp file
      expect(cleanupArtFile).toHaveBeenCalledWith('/tmp/test-art.png');
    });

    it('processes multiple groups independently', async () => {
      const group1Bets = [RESOLVED_BETS[0], RESOLVED_BETS[2]]; // 2 success
      const group2Bets = [RESOLVED_BETS[1]]; // 1 failure only

      let callCount = 0;
      mockFrom.mockImplementation((table) => {
        if (table === 'groups') return createMockGroupsQuery([GROUP_1, GROUP_2]);
        if (table === 'suggested_bets') {
          // First call for group-1, second for group-2
          callCount++;
          if (callCount === 1) return createMockQuery(group1Bets);
          return createMockQuery(group2Bets);
        }
        return createMockQuery([]);
      });

      const bot1 = { bot: {}, publicGroupId: '-1001', groupId: GROUP_1.id };
      const bot2 = { bot: {}, publicGroupId: '-1002', groupId: GROUP_2.id };
      getAllBots.mockReturnValue(new Map([
        [GROUP_1.id, bot1],
        [GROUP_2.id, bot2],
      ]));

      generateDailyArt.mockResolvedValue({
        success: true,
        data: { filePath: '/tmp/test-art.png' },
      });
      sendMediaToPublic.mockResolvedValue({
        success: true,
        data: { messageId: 123 },
      });

      const result = await runGenerateDailyArt();

      // GROUP_1: 2 success -> generated + sent
      // GROUP_2: 0 success -> skipped
      expect(result.generated).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });
});

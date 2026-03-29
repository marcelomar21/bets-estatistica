/**
 * Tests: postBets.js - Job de postagem automatica
 * Story 5.4: Postagem Automatica de Apostas nos Grupos Telegram
 * GURU-46: Refactored to use bet_group_assignments (junction table)
 *
 * Tests cover:
 * - runPostBets(true) posts bets with ready status (odds + link)
 * - runPostBets(true) skips bets without deep_link
 * - runPostBets(true) skips bets with odds < 1.60 (except promovida_manual)
 * - runPostBets(true) skips bets with expired kickoff
 * - runPostBets forwards groupId + dynamic postTimes to getFilaStatus(groupId, postTimes)
 * - markBetAsPosted() receives groupId (GURU-46)
 * - registrarPostagem() receives groupId (GURU-46)
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
    betting: { minOdds: 1.60, maxActiveBets: 50 },
    telegram: { adminGroupId: '-100123', publicGroupId: '-100456', botToken: 'test' },
    membership: { groupId: 'test-group-uuid' },
  },
  validateConfig: jest.fn(),
}));

// Flexible supabase mock: returns different data based on select() column
const mockSupabaseFrom = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}));

function setupDefaultSupabaseMock(toneConfig = null, moduleOverrides = null) {
  const defaultModules = ['analytics', 'distribution', 'posting', 'members', 'tone'];
  mockSupabaseFrom.mockImplementation(() => {
    let selectedField = null;
    const chain = {
      select: jest.fn((field) => { selectedField = field; return chain; }),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(() => {
        if (selectedField && selectedField.includes('copy_tone_config')) {
          return Promise.resolve({
            data: {
              copy_tone_config: toneConfig || null,
              enabled_modules: moduleOverrides || defaultModules,
            },
            error: null,
          });
        }
        // Default: posting_schedule
        return Promise.resolve({
          data: { posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] } },
          error: null,
        });
      }),
    };
    return chain;
  });
}

jest.mock('../../telegram', () => ({
  sendToPublic: jest.fn(),
  sendToAdmin: jest.fn(),
  getBot: jest.fn(() => ({
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    editMessageText: jest.fn().mockResolvedValue(true),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
  })),
  getDefaultBotCtx: jest.fn(() => ({
    adminGroupId: '-100123',
    publicGroupId: '-100456',
    botToken: 'test',
  })),
}));

jest.mock('../../services/betService', () => ({
  getFilaStatus: jest.fn(),
  markBetAsPosted: jest.fn().mockResolvedValue({ success: true }),
  registrarPostagem: jest.fn().mockResolvedValue({ success: true }),
  getAvailableBets: jest.fn().mockResolvedValue({ success: true, data: [] }),
  updateGeneratedCopy: jest.fn().mockResolvedValue(),
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

const { runPostBets, validateBetForPosting, getOrGenerateMessage } = require('../postBets');
const { sendToPublic, sendToAdmin } = require('../../telegram');
const { getFilaStatus, markBetAsPosted, registrarPostagem, updateGeneratedCopy } = require('../../services/betService');
const { generateBetCopy } = require('../../services/copyService');

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
    generatedCopy: null,
    ...overrides,
  };
}

describe('postBets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultSupabaseMock(); // default: no tone config
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
      expect(markBetAsPosted).toHaveBeenCalledWith('bet-1', 999, 1.85, 'test-group-uuid');
      expect(registrarPostagem).toHaveBeenCalledWith('bet-1', 'test-group-uuid');
    });

    it('should skip bet without deep_link and return without throwing (validation fail, not send fail)', async () => {
      const bet = makeBet({ deepLink: null });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.sendFailed).toBe(0);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should skip bet with odds < 1.60 and return without throwing (validation fail)', async () => {
      const bet = makeBet({ odds: 1.40 });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.sendFailed).toBe(0);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should skip bet with kickoff in the past and return without throwing (validation fail)', async () => {
      const bet = makeBet({ kickoffTime: new Date(Date.now() - 3600000).toISOString() });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.sendFailed).toBe(0);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should forward configured groupId and postTimes to getFilaStatus', async () => {
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [] },
      });

      await runPostBets(true);

      expect(getFilaStatus).toHaveBeenCalledWith('test-group-uuid', ['10:00', '15:00', '22:00'], { skipMaxDaysFilter: false });
    });

    it('should record telegram_posted_at, message_id, odds_at_post via markBetAsPosted', async () => {
      const bet = makeBet({ id: 'bet-42', odds: 2.10 });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 777 } });

      await runPostBets(true);

      expect(markBetAsPosted).toHaveBeenCalledWith('bet-42', 777, 2.10, 'test-group-uuid');
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
      expect(markBetAsPosted).toHaveBeenCalledWith('bet-2', 888, 1.85, 'test-group-uuid');
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
      expect(registrarPostagem).toHaveBeenCalledWith('active-1', 'test-group-uuid');
      // markBetAsPosted should NOT be called for reposts (already posted)
      expect(markBetAsPosted).not.toHaveBeenCalled();
    });

    it('should throw on getFilaStatus failure (Story 1.1: surfaces to withExecutionLogging)', async () => {
      getFilaStatus.mockResolvedValue({
        success: false,
        error: { message: 'Database error' },
      });

      await expect(runPostBets(true)).rejects.toThrow('Failed to get fila status: Database error');
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should throw when all eligible bets fail to send (Story 1.1: AC#2)', async () => {
      const bet1 = makeBet({ id: 'bet-1' });
      const bet2 = makeBet({ id: 'bet-2' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet1, bet2] },
      });
      sendToPublic.mockResolvedValue({ success: false, error: { message: 'Telegram timeout' } });

      await expect(runPostBets(true)).rejects.toThrow('send failures across all channels');
    });

    it('should attach jobResult to error when all bets fail to send (Story 1.1)', async () => {
      const bet = makeBet({ id: 'bet-1' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: false, error: { message: 'Telegram timeout' } });

      try {
        await runPostBets(true);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err.jobResult).toBeDefined();
        expect(err.jobResult.posted).toBe(0);
        expect(err.jobResult.sendFailed).toBe(1);
        expect(err.jobResult.totalSent).toBe(0);
      }
    });

    it('should NOT throw when some bets succeed (partial success)', async () => {
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

      // Should NOT throw — partial success is still success
      expect(result.posted).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.sendFailed).toBe(1);
      expect(result.totalSent).toBe(1);
    });

    it('should NOT throw when all bets fail validation (no Telegram send failures)', async () => {
      const bet = makeBet({ deepLink: null });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });

      // Validation failures are not send failures — should return without throwing
      const result = await runPostBets(true);
      expect(result.posted).toBe(0);
      expect(result.sendFailed).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should throw when all ativas fail to repost via Telegram (Code Review finding)', async () => {
      const activeBet1 = makeBet({ id: 'active-1' });
      const activeBet2 = makeBet({ id: 'active-2' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [activeBet1, activeBet2], novas: [] },
      });
      sendToPublic.mockResolvedValue({ success: false, error: { message: 'Telegram 429' } });

      await expect(runPostBets(true)).rejects.toThrow('send failures across all channels');
    });

    it('should call sendToAdmin with error message when getFilaStatus fails (Code Review finding)', async () => {
      getFilaStatus.mockResolvedValue({
        success: false,
        error: { message: 'Connection refused' },
      });

      await expect(runPostBets(true)).rejects.toThrow();
      expect(sendToAdmin).toHaveBeenCalledWith(
        expect.stringContaining('Connection refused'),
        null,
      );
    });
  });

  // ---- enabled_modules: posting module check (GURU-16) ----

  describe('enabled_modules posting check (GURU-16)', () => {
    it('should skip posting when posting module is disabled for group', async () => {
      setupDefaultSupabaseMock(null, ['analytics', 'members']);

      const result = await runPostBets(true);

      expect(result.posted).toBe(0);
      expect(result.totalSent).toBe(0);
      expect(result.cancelled).toBe(false);
      expect(sendToPublic).not.toHaveBeenCalled();
      expect(getFilaStatus).not.toHaveBeenCalled();
    });

    it('should proceed with posting when posting module is enabled', async () => {
      setupDefaultSupabaseMock(null, ['analytics', 'posting', 'members']);
      const bet = makeBet();
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      const result = await runPostBets(true);

      expect(result.posted).toBe(1);
      expect(result.totalSent).toBe(1);
      expect(sendToPublic).toHaveBeenCalledTimes(1);
    });

    it('should default to all modules when enabled_modules is null (backwards compat)', async () => {
      // Simulate group without enabled_modules column yet
      mockSupabaseFrom.mockImplementation(() => {
        let selectedField = null;
        const chain = {
          select: jest.fn((field) => { selectedField = field; return chain; }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(() => {
            if (selectedField && selectedField.includes('copy_tone_config')) {
              return Promise.resolve({
                data: { copy_tone_config: null, enabled_modules: null },
                error: null,
              });
            }
            return Promise.resolve({
              data: { posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] } },
              error: null,
            });
          }),
        };
        return chain;
      });

      const bet = makeBet();
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      // enabled_modules=null -> defaults to ALL modules -> includes('posting') -> proceeds
      // This verifies backward compat: groups without the column still work
      const result = await runPostBets(true);
      expect(result.posted).toBe(1);
      expect(sendToPublic).toHaveBeenCalled();
    });
  });

  // ---- allowedBetIds filtering (Post Now single-bet fix) ----

  describe('allowedBetIds filtering', () => {
    it('should post only allowed bets when allowedBetIds is set', async () => {
      const bet1 = makeBet({ id: 'bet-1' });
      const bet2 = makeBet({ id: 'bet-2' });
      const bet3 = makeBet({ id: 'bet-3' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet1, bet2, bet3] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      const result = await runPostBets(true, { allowedBetIds: ['bet-2'] });

      expect(result.posted).toBe(1);
      expect(result.totalSent).toBe(1);
      expect(sendToPublic).toHaveBeenCalledTimes(1);
      expect(markBetAsPosted).toHaveBeenCalledWith('bet-2', 100, 1.85, 'test-group-uuid');
    });

    it('should post all bets when allowedBetIds is null (backward compat)', async () => {
      const bet1 = makeBet({ id: 'bet-1' });
      const bet2 = makeBet({ id: 'bet-2' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet1, bet2] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      const result = await runPostBets(true, { allowedBetIds: null });

      expect(result.posted).toBe(2);
      expect(result.totalSent).toBe(2);
    });

    it('should filter ativas by allowedBetIds too', async () => {
      const active1 = makeBet({ id: 'active-1' });
      const active2 = makeBet({ id: 'active-2' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [active1, active2], novas: [] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 200 } });

      const result = await runPostBets(true, { allowedBetIds: ['active-1'] });

      expect(result.reposted).toBe(1);
      expect(sendToPublic).toHaveBeenCalledTimes(1);
      expect(registrarPostagem).toHaveBeenCalledWith('active-1', 'test-group-uuid');
    });

    it('should return zero when no bets match allowedBetIds', async () => {
      const bet1 = makeBet({ id: 'bet-1' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet1] },
      });

      const result = await runPostBets(true, { allowedBetIds: ['bet-999'] });

      expect(result.posted).toBe(0);
      expect(result.totalSent).toBe(0);
      expect(sendToPublic).not.toHaveBeenCalled();
    });
  });

  // ---- Story 18.1: toneConfig DB loading ----

  describe('toneConfig DB loading (Story 18.1)', () => {
    const sampleToneConfig = {
      tone: 'energético e direto',
      persona: 'Guru da Bet',
      examplePost: '🔥 BORA! Flamengo x Palmeiras...',
      customRules: ['usar emojis de fogo'],
    };

    it('should load toneConfig from DB when botCtx is not provided (singleton scheduler)', async () => {
      setupDefaultSupabaseMock(sampleToneConfig);
      const bet = makeBet({ reasoning: 'Good stats' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: '🔥 Generated with tone', fullMessage: true },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runPostBets(true);

      // generateBetCopy should receive the toneConfig loaded from DB
      expect(generateBetCopy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bet-1' }),
        expect.objectContaining({ tone: 'energético e direto', examplePost: expect.any(String) }),
      );
    });

    it('should ALWAYS query DB for toneConfig even when botCtx provides it', async () => {
      const botCtxTone = { tone: 'from-botCtx', examplePost: 'Via memory' };
      setupDefaultSupabaseMock(sampleToneConfig); // DB has latest config
      const bet = makeBet({ reasoning: 'Good stats' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: 'copy', fullMessage: true },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runPostBets(true, {
        botCtx: {
          groupId: 'test-group-uuid',
          groupConfig: { copyToneConfig: botCtxTone },
        },
      });

      // Should use DB toneConfig (always fresh), not stale botCtx one
      expect(generateBetCopy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bet-1' }),
        expect.objectContaining({ tone: 'energético e direto' }),
      );
    });

    it('should post with null toneConfig when group has no copy_tone_config in DB', async () => {
      setupDefaultSupabaseMock(null); // no tone config
      const bet = makeBet({ reasoning: 'Good stats' });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: '- Stat 1\n- Stat 2' },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runPostBets(true);

      // generateBetCopy called with null toneConfig (fallback behavior)
      expect(generateBetCopy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bet-1' }),
        null,
      );
    });
  });

  // ---- getTemplate (custom headers/footers) ----

  describe('getTemplate (custom headers/footers)', () => {
    it('should return custom header/footer when toneConfig has them', () => {
      const { getTemplate } = require('../postBets');
      const tc = { headers: ['HEADER A', 'HEADER B'], footers: ['FOOTER A', 'FOOTER B'] };
      const t0 = getTemplate(tc, 0);
      expect(t0.header).toBe('HEADER A');
      expect(t0.footer).toBe('FOOTER A');
      const t1 = getTemplate(tc, 1);
      expect(t1.header).toBe('HEADER B');
      expect(t1.footer).toBe('FOOTER B');
      // Cycle back
      const t2 = getTemplate(tc, 2);
      expect(t2.header).toBe('HEADER A');
    });

    it('should fall back to MESSAGE_TEMPLATES when no custom headers', () => {
      const { getTemplate } = require('../postBets');
      const t = getTemplate(null, 0);
      expect(t.header).toBeDefined();
      expect(t.footer).toBeDefined();
    });

    it('should fall back when only headers provided without footers', () => {
      const { getTemplate } = require('../postBets');
      const tc = { headers: ['H1'] };
      const t = getTemplate(tc, 0);
      // Falls back to MESSAGE_TEMPLATES since footers is missing
      expect(t.header).toBeDefined();
      expect(t.footer).toBeDefined();
    });
  });

  // ---- preview-first posting ----

  describe('preview-first posting', () => {
    function setupPreviewSupabaseMock(previewData, toneConfig = null) {
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'post_previews') {
          let updatePayload = null;
          const chain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(() =>
              Promise.resolve({
                data: previewData,
                error: previewData ? null : { message: 'not found' },
              })
            ),
            update: jest.fn((payload) => {
              updatePayload = payload;
              return {
                eq: jest.fn().mockReturnValue(Promise.resolve({ error: null })),
              };
            }),
            _getUpdatePayload: () => updatePayload,
          };
          return chain;
        }
        // Default: groups table
        let selectedField = null;
        const defaultModules = ['analytics', 'distribution', 'posting', 'members', 'tone'];
        const chain = {
          select: jest.fn((field) => { selectedField = field; return chain; }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(() => {
            if (selectedField && selectedField.includes('copy_tone_config')) {
              return Promise.resolve({
                data: {
                  copy_tone_config: toneConfig || null,
                  enabled_modules: defaultModules,
                },
                error: null,
              });
            }
            return Promise.resolve({
              data: { posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] } },
              error: null,
            });
          }),
        };
        return chain;
      });
    }

    it('should use preview message when previewId is provided', async () => {
      const bet = makeBet({ id: 42 });
      setupPreviewSupabaseMock({
        bets: [{ betId: 42, preview: 'Preview text for bet 42' }],
        status: 'draft',
      });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runPostBets(true, { previewId: 'prev_abc123' });

      // Should NOT call generateBetCopy since preview is used
      expect(generateBetCopy).not.toHaveBeenCalled();
      // sendToPublic should receive the preview text
      expect(sendToPublic).toHaveBeenCalledWith(
        'Preview text for bet 42',
        null,
      );
    });

    it('should fall back to LLM when previewId not found', async () => {
      const bet = makeBet();
      setupPreviewSupabaseMock(null); // preview not found
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: '- Stat 1\n- Stat 2' },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      const result = await runPostBets(true, { previewId: 'prev_notfound' });

      expect(result.posted).toBe(1);
      // formatBetMessage calls generateBetCopy internally
      expect(sendToPublic).toHaveBeenCalledTimes(1);
    });

    it('should fall back to LLM for bets not in preview map', async () => {
      const bet1 = makeBet({ id: 42 });
      const bet2 = makeBet({ id: 99 });
      setupPreviewSupabaseMock({
        bets: [{ betId: 42, preview: 'Preview for 42 only' }],
        status: 'draft',
      });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet1, bet2] },
      });
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: '- LLM generated' },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      const result = await runPostBets(true, { previewId: 'prev_partial' });

      expect(result.posted).toBe(2);
      // First call uses preview text, second uses LLM-generated
      expect(sendToPublic).toHaveBeenCalledTimes(2);
      const firstCallMessage = sendToPublic.mock.calls[0][0];
      expect(firstCallMessage).toBe('Preview for 42 only');
    });

    it('should still validate bets even with preview (kickoff, deepLink)', async () => {
      const expiredBet = makeBet({ id: 42, kickoffTime: new Date(Date.now() - 3600000).toISOString() });
      setupPreviewSupabaseMock({
        bets: [{ betId: 42, preview: 'Preview text' }],
        status: 'draft',
      });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [expiredBet] },
      });

      const result = await runPostBets(true, { previewId: 'prev_expired_bet' });

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(sendToPublic).not.toHaveBeenCalled();
    });

    it('should mark preview as confirmed after successful posting', async () => {
      const bet = makeBet({ id: 42 });
      setupPreviewSupabaseMock({
        bets: [{ betId: 42, preview: 'Preview text' }],
        status: 'draft',
      });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runPostBets(true, { previewId: 'prev_confirm' });

      // Verify that post_previews.update({status:'confirmed'}) was called
      const postPreviewsCalls = mockSupabaseFrom.mock.calls.filter(c => c[0] === 'post_previews');
      expect(postPreviewsCalls.length).toBeGreaterThanOrEqual(2); // select + update
    });
  });

  // ---- formatBetMessage with new tone fields ----

  describe('formatBetMessage with new tone fields', () => {
    it('should use custom oddLabel from toneConfig', async () => {
      const { formatBetMessage } = require('../postBets');
      const bet = makeBet();
      const tc = { oddLabel: 'Cotação' };
      const template = { header: '🎯 TEST', footer: '🍀 GL' };
      const msg = await formatBetMessage(bet, template, tc, 0);
      expect(msg).toContain('Cotação:');
      expect(msg).not.toContain('Odd:');
    });

    it('should use default "Odd" when no oddLabel in toneConfig', async () => {
      const { formatBetMessage } = require('../postBets');
      const bet = makeBet();
      const template = { header: '🎯 TEST', footer: '🍀 GL' };
      const msg = await formatBetMessage(bet, template, null, 0);
      expect(msg).toContain('Odd:');
    });

    it('should cycle CTAs from ctaTexts using betIndex', async () => {
      const { formatBetMessage } = require('../postBets');
      const bet = makeBet();
      const tc = { ctaTexts: ['CTA A', 'CTA B', 'CTA C'] };
      const template = { header: '🎯 TEST', footer: '🍀 GL' };
      const msg0 = await formatBetMessage(bet, template, tc, 0);
      expect(msg0).toContain('CTA A');
      const msg1 = await formatBetMessage(bet, template, tc, 1);
      expect(msg1).toContain('CTA B');
      const msg2 = await formatBetMessage(bet, template, tc, 2);
      expect(msg2).toContain('CTA C');
      // Cycle
      const msg3 = await formatBetMessage(bet, template, tc, 3);
      expect(msg3).toContain('CTA A');
    });

    it('should fall back to legacy ctaText when no ctaTexts', async () => {
      const { formatBetMessage } = require('../postBets');
      const bet = makeBet();
      const tc = { ctaText: 'Legacy CTA' };
      const template = { header: '🎯 TEST', footer: '🍀 GL' };
      const msg = await formatBetMessage(bet, template, tc, 0);
      expect(msg).toContain('Legacy CTA');
    });
  });

  // ---- getOrGenerateMessage (copy persistence) ----

  describe('getOrGenerateMessage', () => {
    it('should return persisted generatedCopy in full-message mode', async () => {
      const bet = makeBet({ generatedCopy: 'Persisted copy text' });
      const fullMsgTone = { examplePost: '🔥 Example post...' };
      const result = await getOrGenerateMessage(bet, fullMsgTone, 0);
      expect(result).toBe('Persisted copy text');
      expect(generateBetCopy).not.toHaveBeenCalled();
      expect(updateGeneratedCopy).not.toHaveBeenCalled();
    });

    it('should NOT use persisted copy in template mode (cycling headers)', async () => {
      const bet = makeBet({ generatedCopy: 'Stale template copy' });
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: '- Fresh bullets' },
      });
      // null toneConfig = template mode
      const result = await getOrGenerateMessage(bet, null, 0);
      // Should regenerate, not use persisted copy
      expect(result).not.toBe('Stale template copy');
      expect(result).toBeDefined();
      // Template mode should NOT persist
      expect(updateGeneratedCopy).not.toHaveBeenCalled();
    });

    it('should generate and persist in full-message mode when generatedCopy is null', async () => {
      const bet = makeBet({ generatedCopy: null });
      const fullMsgTone = { examplePosts: ['🔥 Example...'] };
      generateBetCopy.mockResolvedValue({
        success: true,
        data: { copy: '🔥 Generated full message', fullMessage: true },
      });
      const result = await getOrGenerateMessage(bet, fullMsgTone, 0, 'test-group-uuid');
      expect(result).toBeDefined();
      expect(updateGeneratedCopy).toHaveBeenCalledWith('bet-1', expect.any(String), 'test-group-uuid');
    });

    it('should prioritize previewMessages over generatedCopy in runPostBets', async () => {
      const bet = makeBet({ id: 42, generatedCopy: 'Persisted copy' });
      // Setup preview mock that returns a draft
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'post_previews') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { bets: [{ betId: 42, preview: 'Admin edited preview' }], status: 'draft' },
              error: null,
            }),
            update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
          };
        }
        let selectedField = null;
        const defaultModules = ['analytics', 'distribution', 'posting', 'members', 'tone'];
        const chain = {
          select: jest.fn((field) => { selectedField = field; return chain; }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(() => {
            if (selectedField && selectedField.includes('copy_tone_config')) {
              return Promise.resolve({
                data: { copy_tone_config: null, enabled_modules: defaultModules },
                error: null,
              });
            }
            return Promise.resolve({
              data: { posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] } },
              error: null,
            });
          }),
        };
        return chain;
      });
      getFilaStatus.mockResolvedValue({
        success: true,
        data: { ativas: [], novas: [bet] },
      });
      sendToPublic.mockResolvedValue({ success: true, data: { messageId: 100 } });

      await runPostBets(true, { previewId: 'prev_has_edit' });

      // Should use the admin-edited preview, not the persisted generatedCopy
      expect(sendToPublic).toHaveBeenCalledWith('Admin edited preview', null);
    });
  });
});

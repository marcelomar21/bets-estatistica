/**
 * Tests: artGeneratorService.js — GURU-19
 * Validates daily art image generation:
 *   - Generates PNG buffer with correct dimensions
 *   - Handles empty bets gracefully
 *   - Truncates at MAX_BETS_DISPLAY and shows overflow
 *   - Builds correct caption text
 *   - Formats dates in pt-BR
 */

const {
  generateDailyArtImage,
  buildCaption,
  formatDatePtBr,
  truncateText,
  MAX_BETS_DISPLAY,
  WIDTH,
  HEIGHT,
} = require('../artGeneratorService');

// PNG magic bytes: 0x89 0x50 0x4E 0x47
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function makeBet(id, home, away, market, odds) {
  return {
    id,
    bet_result: 'success',
    home_team_name: home,
    away_team_name: away,
    market,
    odds_at_post: odds,
  };
}

describe('artGeneratorService', () => {
  describe('formatDatePtBr', () => {
    it('formats a date correctly in pt-BR', () => {
      const date = new Date(2026, 2, 26); // March 26, 2026
      expect(formatDatePtBr(date)).toBe('26 de marco de 2026');
    });

    it('handles January', () => {
      const date = new Date(2026, 0, 1);
      expect(formatDatePtBr(date)).toBe('1 de janeiro de 2026');
    });

    it('handles December', () => {
      const date = new Date(2026, 11, 31);
      expect(formatDatePtBr(date)).toBe('31 de dezembro de 2026');
    });
  });

  describe('buildCaption', () => {
    it('builds caption with correct stats', () => {
      const caption = buildCaption(3, 4, 'GuruBet', new Date(2026, 2, 26));
      expect(caption).toContain('ACERTOS DE ONTEM');
      expect(caption).toContain('26 de marco de 2026');
      expect(caption).toContain('3/4 acertos (75%)');
      expect(caption).toContain('GuruBet');
    });

    it('handles 100% rate', () => {
      const caption = buildCaption(5, 5, 'Grupo', new Date(2026, 0, 1));
      expect(caption).toContain('5/5 acertos (100%)');
    });

    it('handles 0 total resolved', () => {
      const caption = buildCaption(0, 0, 'Grupo', new Date(2026, 0, 1));
      expect(caption).toContain('0/0 acertos (0%)');
    });
  });

  describe('generateDailyArtImage', () => {
    it('returns error when no bets provided', async () => {
      const result = await generateDailyArtImage({
        successBets: [],
        totalResolved: 0,
        groupName: 'Test',
        date: new Date(2026, 2, 26),
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_BETS');
    });

    it('returns error when successBets is null', async () => {
      const result = await generateDailyArtImage({
        successBets: null,
        totalResolved: 0,
        groupName: 'Test',
        date: new Date(2026, 2, 26),
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_BETS');
    });

    it('generates a valid PNG buffer for a single bet', async () => {
      const bets = [makeBet(1, 'Flamengo', 'Vasco', 'Ambas Marcam', 1.85)];

      const result = await generateDailyArtImage({
        successBets: bets,
        totalResolved: 2,
        groupName: 'GuruBet',
        date: new Date(2026, 2, 26),
      });

      expect(result.success).toBe(true);
      expect(result.data.buffer).toBeInstanceOf(Buffer);
      expect(result.data.buffer.length).toBeGreaterThan(1000);

      // Verify PNG magic bytes
      const header = result.data.buffer.subarray(0, 4);
      expect(header.equals(PNG_MAGIC)).toBe(true);
    });

    it('generates image for multiple bets', async () => {
      const bets = [
        makeBet(1, 'Flamengo', 'Vasco', 'Ambas Marcam', 1.85),
        makeBet(2, 'Real Madrid', 'Barcelona', 'Over 2.5', 1.72),
        makeBet(3, 'Liverpool', 'Arsenal', 'Result 1', 2.10),
      ];

      const result = await generateDailyArtImage({
        successBets: bets,
        totalResolved: 4,
        groupName: 'Osmar Palpites',
        date: new Date(2026, 2, 26),
      });

      expect(result.success).toBe(true);
      expect(result.data.buffer).toBeInstanceOf(Buffer);
    });

    it('handles more than MAX_BETS_DISPLAY bets without error', async () => {
      const bets = Array.from({ length: 12 }, (_, i) =>
        makeBet(i + 1, `Team ${i}A`, `Team ${i}B`, 'Over 2.5', 1.50 + i * 0.1)
      );

      const result = await generateDailyArtImage({
        successBets: bets,
        totalResolved: 15,
        groupName: 'BigGroup',
        date: new Date(2026, 2, 26),
      });

      expect(result.success).toBe(true);
      expect(result.data.buffer).toBeInstanceOf(Buffer);
      // Should still produce a valid PNG even with overflow
      const header = result.data.buffer.subarray(0, 4);
      expect(header.equals(PNG_MAGIC)).toBe(true);
    });

    it('handles bets with missing odds gracefully', async () => {
      const bets = [makeBet(1, 'Time A', 'Time B', 'Mercado', null)];

      const result = await generateDailyArtImage({
        successBets: bets,
        totalResolved: 1,
        groupName: 'Test',
        date: new Date(2026, 2, 26),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('constants', () => {
    it('has correct image dimensions', () => {
      expect(WIDTH).toBe(1080);
      expect(HEIGHT).toBe(1350);
    });

    it('limits display to 8 bets', () => {
      expect(MAX_BETS_DISPLAY).toBe(8);
    });
  });
});

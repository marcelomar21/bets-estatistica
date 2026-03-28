/**
 * Tests: artGeneratorService.js — GURU-19
 * Validates image generation, caption generation, and cleanup.
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  generateDailyArt,
  generateCaption,
  cleanupArtFile,
  formatDatePtBr,
  MAX_BETS_SHOWN,
} = require('../artGeneratorService');

const SAMPLE_BETS = [
  {
    homeTeamName: 'Flamengo',
    awayTeamName: 'Vasco',
    market: 'Ambas Marcam',
    oddsAtPost: 1.85,
  },
  {
    homeTeamName: 'Real Madrid',
    awayTeamName: 'Barcelona',
    market: 'Over 2.5 Gols',
    oddsAtPost: 1.72,
  },
  {
    homeTeamName: 'Liverpool',
    awayTeamName: 'Arsenal',
    market: 'Resultado Final',
    oddsAtPost: 2.10,
  },
];

const TARGET_DATE = new Date('2026-03-27T00:00:00-03:00');

describe('artGeneratorService', () => {
  describe('formatDatePtBr', () => {
    it('formats date in Brazilian Portuguese', () => {
      const result = formatDatePtBr(new Date(2026, 2, 27)); // March 27
      expect(result).toBe('27 de março de 2026');
    });

    it('handles January correctly', () => {
      const result = formatDatePtBr(new Date(2026, 0, 5)); // Jan 5
      expect(result).toBe('5 de janeiro de 2026');
    });

    it('handles December correctly', () => {
      const result = formatDatePtBr(new Date(2026, 11, 25)); // Dec 25
      expect(result).toBe('25 de dezembro de 2026');
    });
  });

  describe('generateDailyArt', () => {
    let filePath;

    afterEach(() => {
      // Cleanup any generated file
      if (filePath) {
        cleanupArtFile(filePath);
        filePath = null;
      }
    });

    it('generates a PNG file with correct dimensions', async () => {
      const result = await generateDailyArt({
        successBets: SAMPLE_BETS,
        totalBets: 4,
        groupName: 'GuruBet Tips',
        targetDate: TARGET_DATE,
      });

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBeDefined();
      filePath = result.data.filePath;

      // File should exist and be a valid PNG
      expect(fs.existsSync(filePath)).toBe(true);
      const buffer = fs.readFileSync(filePath);
      // PNG magic bytes: 137 80 78 71
      expect(buffer[0]).toBe(137);
      expect(buffer[1]).toBe(80);
      expect(buffer[2]).toBe(78);
      expect(buffer[3]).toBe(71);
      // Should be reasonably sized (>10KB for a 1080x1350 image)
      expect(buffer.length).toBeGreaterThan(10000);
    });

    it('generates art with a single bet', async () => {
      const result = await generateDailyArt({
        successBets: [SAMPLE_BETS[0]],
        totalBets: 1,
        groupName: 'Test Group',
        targetDate: TARGET_DATE,
      });

      expect(result.success).toBe(true);
      filePath = result.data.filePath;
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('handles more than MAX_BETS_SHOWN bets (truncation)', async () => {
      // Generate 10+ bets
      const manyBets = Array.from({ length: 12 }, (_, i) => ({
        homeTeamName: `Team ${i}A`,
        awayTeamName: `Team ${i}B`,
        market: 'Over 2.5',
        oddsAtPost: 1.5 + i * 0.1,
      }));

      const result = await generateDailyArt({
        successBets: manyBets,
        totalBets: 15,
        groupName: 'Big Group',
        targetDate: TARGET_DATE,
      });

      expect(result.success).toBe(true);
      filePath = result.data.filePath;
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('creates file in tmp directory', async () => {
      const result = await generateDailyArt({
        successBets: SAMPLE_BETS,
        totalBets: 4,
        groupName: 'Test',
        targetDate: TARGET_DATE,
      });

      expect(result.success).toBe(true);
      filePath = result.data.filePath;
      expect(filePath.startsWith(os.tmpdir())).toBe(true);
    });

    it('sanitizes group name in filename', async () => {
      const result = await generateDailyArt({
        successBets: SAMPLE_BETS,
        totalBets: 4,
        groupName: 'Osmar Palpites (público)',
        targetDate: TARGET_DATE,
      });

      expect(result.success).toBe(true);
      filePath = result.data.filePath;
      const fileName = path.basename(filePath);
      expect(fileName).not.toMatch(/[()]/);
    });
  });

  describe('generateCaption', () => {
    it('generates correct caption with stats', () => {
      const caption = generateCaption({
        successCount: 3,
        totalCount: 4,
        groupName: 'GuruBet Tips',
        targetDate: TARGET_DATE,
      });

      expect(caption).toContain('Acertos de');
      expect(caption).toContain('3/4');
      expect(caption).toContain('75%');
      expect(caption).toContain('GuruBet Tips');
    });

    it('handles 100% success rate', () => {
      const caption = generateCaption({
        successCount: 5,
        totalCount: 5,
        groupName: 'Test',
        targetDate: TARGET_DATE,
      });

      expect(caption).toContain('5/5');
      expect(caption).toContain('100%');
    });

    it('handles 0 total gracefully', () => {
      const caption = generateCaption({
        successCount: 0,
        totalCount: 0,
        groupName: 'Empty',
        targetDate: TARGET_DATE,
      });

      expect(caption).toContain('0/0');
      expect(caption).toContain('0%');
    });
  });

  describe('cleanupArtFile', () => {
    it('deletes an existing file', () => {
      const tmpFile = path.join(os.tmpdir(), `test-cleanup-${Date.now()}.png`);
      fs.writeFileSync(tmpFile, 'test');
      expect(fs.existsSync(tmpFile)).toBe(true);

      cleanupArtFile(tmpFile);
      expect(fs.existsSync(tmpFile)).toBe(false);
    });

    it('handles non-existent file without throwing', () => {
      expect(() => cleanupArtFile('/tmp/nonexistent-file.png')).not.toThrow();
    });

    it('handles null/undefined path without throwing', () => {
      expect(() => cleanupArtFile(null)).not.toThrow();
      expect(() => cleanupArtFile(undefined)).not.toThrow();
    });
  });
});

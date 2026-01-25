/**
 * Tests for lib/utils.js
 * Story 17.5: Consolidar Utilitários Compartilhados
 */

const {
  sleep,
  truncate,
  formatDateBR,
  formatDateTimeBR,
  formatTime,
  getDateKey,
  getTodayKey,
  getTomorrowKey,
  parseNumericId,
  isValidUUID,
  safeStringify,
} = require('../../lib/utils');

describe('lib/utils', () => {
  describe('sleep', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('truncate', () => {
    it('should return empty string for null/undefined', () => {
      expect(truncate(null, 10)).toBe('');
      expect(truncate(undefined, 10)).toBe('');
    });

    it('should not truncate strings shorter than maxLength', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate strings longer than maxLength with default suffix', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should use custom suffix', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });

  describe('formatDateBR', () => {
    it('should format Date object as DD/MM', () => {
      const date = new Date('2026-01-25T12:00:00Z');
      const result = formatDateBR(date);
      expect(result).toMatch(/^\d{2}\/\d{2}$/);
    });

    it('should format date string', () => {
      const result = formatDateBR('2026-01-25T12:00:00Z');
      expect(result).toMatch(/^\d{2}\/\d{2}$/);
    });

    it('should return empty string for invalid date', () => {
      expect(formatDateBR('invalid')).toBe('');
    });
  });

  describe('formatDateTimeBR', () => {
    it('should format as DD/MM HH:MM', () => {
      const date = new Date('2026-01-25T15:30:00Z');
      const result = formatDateTimeBR(date);
      expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
    });

    it('should return empty string for invalid date', () => {
      expect(formatDateTimeBR('invalid')).toBe('');
    });
  });

  describe('formatTime', () => {
    it('should format as HH:MM', () => {
      const date = new Date('2026-01-25T15:30:00Z');
      const result = formatTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should return empty string for invalid date', () => {
      expect(formatTime('invalid')).toBe('');
    });
  });

  describe('getDateKey', () => {
    it('should return YYYY-MM-DD format', () => {
      const date = new Date('2026-01-25T12:00:00Z');
      const result = getDateKey(date, 'UTC');
      expect(result).toBe('2026-01-25');
    });

    it('should handle date string input', () => {
      const result = getDateKey('2026-01-25T12:00:00Z', 'UTC');
      expect(result).toBe('2026-01-25');
    });

    it('should return empty string for invalid date', () => {
      expect(getDateKey('invalid')).toBe('');
    });
  });

  describe('getTodayKey', () => {
    it('should return today in YYYY-MM-DD format', () => {
      const result = getTodayKey('UTC');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Should match current UTC date
      const expected = new Date().toISOString().slice(0, 10);
      expect(result).toBe(expected);
    });
  });

  describe('getTomorrowKey', () => {
    it('should return tomorrow in YYYY-MM-DD format', () => {
      const result = getTomorrowKey('UTC');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Should be one day after today
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expected = tomorrow.toISOString().slice(0, 10);
      expect(result).toBe(expected);
    });
  });

  describe('parseNumericId', () => {
    it('should parse valid number', () => {
      const result = parseNumericId(123);
      expect(result).toEqual({ valid: true, value: 123 });
    });

    it('should parse valid string number', () => {
      const result = parseNumericId('456');
      expect(result).toEqual({ valid: true, value: 456 });
    });

    it('should reject null/undefined', () => {
      expect(parseNumericId(null).valid).toBe(false);
      expect(parseNumericId(undefined).valid).toBe(false);
    });

    it('should reject non-numeric strings', () => {
      expect(parseNumericId('abc').valid).toBe(false);
    });

    it('should reject zero and negative numbers', () => {
      expect(parseNumericId(0).valid).toBe(false);
      expect(parseNumericId(-1).valid).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid UUIDs', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('123')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
    });
  });

  describe('safeStringify', () => {
    it('should stringify objects', () => {
      expect(safeStringify({ a: 1 })).toBe('{"a":1}');
    });

    it('should truncate long strings', () => {
      const long = 'a'.repeat(300);
      const result = safeStringify(long, 50);
      expect(result.length).toBe(50);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle null/undefined', () => {
      expect(safeStringify(null)).toBe('null');
      expect(safeStringify(undefined)).toBe('undefined');
    });

    it('should handle circular references gracefully', () => {
      const obj = { a: 1 };
      obj.self = obj;
      // Should not throw, returns string representation
      const result = safeStringify(obj);
      expect(typeof result).toBe('string');
    });
  });
});

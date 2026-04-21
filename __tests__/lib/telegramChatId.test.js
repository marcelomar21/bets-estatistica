/**
 * Tests for lib/telegramChatId.js
 */

const { normalizeTelegramChatId } = require('../../lib/telegramChatId');

describe('normalizeTelegramChatId', () => {
  describe('already normalized', () => {
    it('U1: accepts -100<id> number input and returns the string form', () => {
      expect(normalizeTelegramChatId(-1003836475731)).toBe('-1003836475731');
    });

    it('U2: passes through already normalized string unchanged', () => {
      expect(normalizeTelegramChatId('-1003836475731')).toBe('-1003836475731');
    });
  });

  describe('legacy/positive inputs (needs -100 prefix)', () => {
    it('U3: prefixes positive number', () => {
      expect(normalizeTelegramChatId(3836475731)).toBe('-1003836475731');
    });

    it('U4: prefixes positive numeric string', () => {
      expect(normalizeTelegramChatId('3836475731')).toBe('-1003836475731');
    });
  });

  describe('negative without -100 prefix', () => {
    it('U5: negative number without -100 gets reshaped', () => {
      expect(normalizeTelegramChatId(-3836475731)).toBe('-1003836475731');
    });

    it('negative numeric string without -100 gets reshaped', () => {
      expect(normalizeTelegramChatId('-3836475731')).toBe('-1003836475731');
    });
  });

  describe('empty / zero / null inputs → null', () => {
    it('U6: null input returns null', () => {
      expect(normalizeTelegramChatId(null)).toBeNull();
    });

    it('U7: undefined input returns null', () => {
      expect(normalizeTelegramChatId(undefined)).toBeNull();
    });

    it('U8: empty string returns null', () => {
      expect(normalizeTelegramChatId('')).toBeNull();
    });

    it('U9: whitespace-only string returns null', () => {
      expect(normalizeTelegramChatId('   ')).toBeNull();
    });

    it('U10: zero number returns null', () => {
      expect(normalizeTelegramChatId(0)).toBeNull();
    });

    it('U11: negative zero string returns null', () => {
      expect(normalizeTelegramChatId('-0')).toBeNull();
    });
  });

  describe('invalid shapes → null', () => {
    it('U12: invalid -100 prefix with non-digits returns null', () => {
      expect(normalizeTelegramChatId('-100abc')).toBeNull();
    });

    it('U13: non-numeric string returns null', () => {
      expect(normalizeTelegramChatId('invalid')).toBeNull();
    });

    it('U14: float number returns null', () => {
      expect(normalizeTelegramChatId(1.5)).toBeNull();
    });

    it('U15: NaN returns null', () => {
      expect(normalizeTelegramChatId(NaN)).toBeNull();
    });

    it('Infinity returns null', () => {
      expect(normalizeTelegramChatId(Infinity)).toBeNull();
    });

    it('negative Infinity returns null', () => {
      expect(normalizeTelegramChatId(-Infinity)).toBeNull();
    });

    it('negative with garbage after - returns null', () => {
      expect(normalizeTelegramChatId('-abc')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('U16: trims whitespace around positive string', () => {
      expect(normalizeTelegramChatId('  3836475731  ')).toBe('-1003836475731');
    });

    it('U17: very large positive number still gets prefixed', () => {
      expect(normalizeTelegramChatId(9007199254740991)).toBe('-1009007199254740991');
    });
  });
});

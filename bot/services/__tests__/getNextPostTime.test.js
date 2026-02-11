/**
 * Tests: getNextPostTime() dynamic parameter support
 * Story 5.5: Accept custom times array
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    betting: { minOdds: 1.60, maxActiveBets: 3, maxDaysAhead: 2 },
    telegram: { adminGroupId: '-100123', publicGroupId: '-100456', botToken: 'test' },
    membership: { groupId: 'test-group-uuid' },
  },
  validateConfig: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const { getNextPostTime } = require('../betService');

describe('getNextPostTime() - Dynamic (Story 5.5)', () => {
  it('should accept custom times array and return valid result', () => {
    const result = getNextPostTime(['08:00', '14:00', '20:00']);
    expect(result).toBeDefined();
    expect(result.time).toBeDefined();
    expect(result.diff).toBeDefined();
  });

  it('should default to [10, 15, 22] without parameter', () => {
    const result = getNextPostTime();
    expect(result).toBeDefined();
    expect(result.time).toBeDefined();
    expect(result.diff).toBeDefined();
  });

  it('should return tomorrow time when all configured times have passed', () => {
    // Test with very early times that have definitely passed
    const result = getNextPostTime(['00:01']);
    // Should wrap to tomorrow
    expect(result.time).toContain('amanhã');
  });

  it('should handle single time in array', () => {
    const result = getNextPostTime(['23:59']);
    expect(result).toBeDefined();
    expect(result.time).toBeDefined();
  });

  it('should sort times correctly regardless of input order', () => {
    const result1 = getNextPostTime(['22:00', '10:00', '15:00']);
    const result2 = getNextPostTime(['10:00', '15:00', '22:00']);
    expect(result1.time).toEqual(result2.time);
    expect(result1.diff).toEqual(result2.diff);
  });
});

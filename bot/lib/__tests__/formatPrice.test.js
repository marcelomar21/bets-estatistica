const { formatBRL } = require('../formatPrice');

describe('formatBRL', () => {
  it('formats 49.90 as R$ 49,90', () => {
    expect(formatBRL(49.90)).toBe('R$ 49,90');
  });

  it('formats 0 as R$ 0,00', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('returns null for null input', () => {
    expect(formatBRL(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatBRL(undefined)).toBeNull();
  });

  it('formats 1000 with thousands separator', () => {
    expect(formatBRL(1000)).toBe('R$ 1.000,00');
  });

  it('formats 99999.99 with thousands separator', () => {
    expect(formatBRL(99999.99)).toBe('R$ 99.999,99');
  });

  it('formats 0.01 as R$ 0,01', () => {
    expect(formatBRL(0.01)).toBe('R$ 0,01');
  });

  it('formats string number correctly', () => {
    expect(formatBRL('29.90')).toBe('R$ 29,90');
  });

  it('returns null for NaN', () => {
    expect(formatBRL(NaN)).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(formatBRL('abc')).toBeNull();
  });
});

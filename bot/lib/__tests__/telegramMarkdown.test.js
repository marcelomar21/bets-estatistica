const { sanitizeTelegramMarkdown, enforceOddLabel } = require('../telegramMarkdown');

describe('sanitizeTelegramMarkdown', () => {
  it('returns text without formatting unchanged', () => {
    expect(sanitizeTelegramMarkdown('Hello world')).toBe('Hello world');
  });

  it('keeps balanced *bold*', () => {
    expect(sanitizeTelegramMarkdown('*bold text*')).toBe('*bold text*');
  });

  it('removes orphan * when unbalanced', () => {
    const result = sanitizeTelegramMarkdown('*bold sem fechar');
    expect(result).not.toContain('*');
    expect(result).toContain('bold sem fechar');
  });

  it('keeps balanced _italic_', () => {
    expect(sanitizeTelegramMarkdown('_italic text_')).toBe('_italic text_');
  });

  it('removes orphan _ when unbalanced', () => {
    const result = sanitizeTelegramMarkdown('_italic sem fechar');
    expect(result).not.toContain('_');
    expect(result).toContain('italic sem fechar');
  });

  it('keeps balanced `code`', () => {
    expect(sanitizeTelegramMarkdown('`code block`')).toBe('`code block`');
  });

  it('removes orphan ` when unbalanced', () => {
    const result = sanitizeTelegramMarkdown('`code sem fechar');
    expect(result).not.toContain('`');
    expect(result).toContain('code sem fechar');
  });

  it('keeps valid [link](url)', () => {
    expect(sanitizeTelegramMarkdown('[click here](https://example.com)')).toBe('[click here](https://example.com)');
  });

  it('removes broken [link without closing', () => {
    const result = sanitizeTelegramMarkdown('[link sem fechar');
    expect(result).not.toContain('[');
    expect(result).toContain('link sem fechar');
  });

  it('removes broken [link](url without )', () => {
    const result = sanitizeTelegramMarkdown('[link](https://broken');
    expect(result).toContain('link');
  });

  it('resolves *_nested_* by removing outer markers', () => {
    const result = sanitizeTelegramMarkdown('*_aninhado_*');
    expect(result).toBe('aninhado');
  });

  it('fixes multiple problems in one text', () => {
    const input = '*bold ok* and _broken italic and `orphan code';
    const result = sanitizeTelegramMarkdown(input);
    expect(result).toContain('*bold ok*');
    // orphan _ and ` should be removed
    const starCount = (result.match(/\*/g) || []).length;
    const underCount = (result.match(/_/g) || []).length;
    const backtickCount = (result.match(/`/g) || []).length;
    expect(starCount % 2).toBe(0);
    expect(underCount % 2).toBe(0);
    expect(backtickCount % 2).toBe(0);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeTelegramMarkdown('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeTelegramMarkdown(null)).toBe('');
    expect(sanitizeTelegramMarkdown(undefined)).toBe('');
  });

  it('does not strip underscores inside link URLs', () => {
    const input = '_italic text_ [Apostar](https://bet365.com/some_path_here)';
    const result = sanitizeTelegramMarkdown(input);
    expect(result).toContain('_italic text_');
    expect(result).toContain('https://bet365.com/some_path_here');
  });

  it('handles URLs with multiple underscores and balanced italic', () => {
    const input = '_bold_ and [link](https://site.com/a_b_c_d)';
    const result = sanitizeTelegramMarkdown(input);
    expect(result).toContain('_bold_');
    expect(result).toContain('https://site.com/a_b_c_d');
  });
});

describe('enforceOddLabel', () => {
  it('replaces "Odd:" with configured label', () => {
    expect(enforceOddLabel('Odd: 1.85', 'Cotação')).toBe('Cotação: 1.85');
  });

  it('replaces "Odds:" with configured label', () => {
    expect(enforceOddLabel('Odds: 1.85', 'Cotação')).toBe('Cotação: 1.85');
  });

  it('replaces lowercase "odd:"', () => {
    expect(enforceOddLabel('odd: 1.85', 'Cotação')).toBe('Cotação: 1.85');
  });

  it('replaces "Odd :" with extra space', () => {
    expect(enforceOddLabel('Odd : 1.85', 'Cotação')).toBe('Cotação: 1.85');
  });

  it('returns text unchanged when oddLabel is null', () => {
    expect(enforceOddLabel('Odd: 1.85', null)).toBe('Odd: 1.85');
  });

  it('returns text unchanged when oddLabel is undefined', () => {
    expect(enforceOddLabel('Odd: 1.85', undefined)).toBe('Odd: 1.85');
  });

  it('returns text unchanged when oddLabel is empty string', () => {
    expect(enforceOddLabel('Odd: 1.85', '')).toBe('Odd: 1.85');
  });

  it('returns text unchanged when no "Odd" found', () => {
    expect(enforceOddLabel('Price: 1.85', 'Cotação')).toBe('Price: 1.85');
  });

  it('replaces multiple occurrences', () => {
    const input = 'Odd: 1.85\nOdds: 2.10';
    const result = enforceOddLabel(input, 'Cotação');
    expect(result).toBe('Cotação: 1.85\nCotação: 2.10');
  });

  it('does not replace "Odd" when not followed by colon', () => {
    expect(enforceOddLabel('Odd number is 3', 'Cotação')).toBe('Odd number is 3');
  });
});

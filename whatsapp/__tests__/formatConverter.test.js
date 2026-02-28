const { telegramToWhatsApp, whatsAppToTelegram } = require('../../lib/formatConverter');

describe('formatConverter', () => {
  describe('telegramToWhatsApp', () => {
    it('should return empty string for null/undefined input', () => {
      expect(telegramToWhatsApp(null)).toBe('');
      expect(telegramToWhatsApp(undefined)).toBe('');
      expect(telegramToWhatsApp('')).toBe('');
    });

    it('should return non-string input as empty string', () => {
      expect(telegramToWhatsApp(123)).toBe('');
    });

    it('should preserve bold formatting (*text*)', () => {
      expect(telegramToWhatsApp('*bold text*')).toBe('*bold text*');
    });

    it('should preserve italic formatting (_text_)', () => {
      expect(telegramToWhatsApp('_italic text_')).toBe('_italic text_');
    });

    it('should preserve monospace formatting (`code`)', () => {
      expect(telegramToWhatsApp('`code here`')).toBe('`code here`');
    });

    it('should preserve emojis', () => {
      expect(telegramToWhatsApp('🎯 *APOSTA DO DIA* ⚽')).toBe('🎯 *APOSTA DO DIA* ⚽');
    });

    it('should convert inline links to plain text with URL', () => {
      expect(telegramToWhatsApp('[Click here](https://example.com)'))
        .toBe('Click here (https://example.com)');
    });

    it('should convert multiple inline links', () => {
      const input = 'Check [link1](https://a.com) and [link2](https://b.com)';
      const expected = 'Check link1 (https://a.com) and link2 (https://b.com)';
      expect(telegramToWhatsApp(input)).toBe(expected);
    });

    it('should handle mixed formatting with links', () => {
      const input = '*Bold* text with [a link](https://test.com) and _italic_';
      const expected = '*Bold* text with a link (https://test.com) and _italic_';
      expect(telegramToWhatsApp(input)).toBe(expected);
    });

    it('should handle a full bet message', () => {
      const input = [
        '🎯 *APOSTA DO DIA*',
        '',
        '⚽ Palmeiras x Corinthians',
        '⏰ 16:00',
        '',
        '📊 *Mercado:* Ambas Marcam',
        '💰 *Odds:* 1.85',
        '',
        '• 75% dos jogos tiveram gols de ambos',
        '• Média de 3.2 gols nos últimos 5 jogos',
        '',
        '👉 [Aposte aqui](https://bet365.com/deep/123)',
      ].join('\n');

      const result = telegramToWhatsApp(input);

      // Bold, italic, emojis preserved
      expect(result).toContain('🎯 *APOSTA DO DIA*');
      expect(result).toContain('📊 *Mercado:*');
      expect(result).toContain('💰 *Odds:*');

      // Link converted
      expect(result).toContain('👉 Aposte aqui (https://bet365.com/deep/123)');
      expect(result).not.toContain('[Aposte aqui]');
    });

    it('should handle text without any special formatting', () => {
      expect(telegramToWhatsApp('plain text message')).toBe('plain text message');
    });
  });

  describe('whatsAppToTelegram', () => {
    it('should return empty string for null/undefined input', () => {
      expect(whatsAppToTelegram(null)).toBe('');
      expect(whatsAppToTelegram(undefined)).toBe('');
    });

    it('should pass through text unchanged', () => {
      expect(whatsAppToTelegram('*bold* _italic_ `code`')).toBe('*bold* _italic_ `code`');
    });
  });
});

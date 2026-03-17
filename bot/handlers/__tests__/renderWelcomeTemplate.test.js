/**
 * Tests: renderWelcomeTemplate + DEFAULT_WELCOME_TEMPLATE
 * F17: Unit tests for the welcome message template system
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    telegram: { adminGroupId: '-100123', publicGroupId: '-100456', botToken: 'test' },
    membership: { groupId: 'test-group-uuid' },
  },
}));

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../telegram', () => ({
  getBot: jest.fn(),
  getDefaultBotCtx: jest.fn(),
}));
jest.mock('../../services/memberService', () => ({}));
jest.mock('../../services/metricsService', () => ({}));
jest.mock('../../services/termsService', () => ({}));
jest.mock('../../services/notificationHelper', () => ({}));
jest.mock('../../lib/configHelper', () => ({ getConfig: jest.fn() }));
jest.mock('../../../lib/utils', () => ({ formatFullDateBR: jest.fn() }));

const { _internal } = require('../startCommand');
const { renderWelcomeTemplate, DEFAULT_WELCOME_TEMPLATE } = _internal;

describe('renderWelcomeTemplate', () => {
  const baseVars = {
    nome: 'João',
    grupo: 'Guru da Bet',
    dias_trial: 7,
    data_expiracao: '23/03/2026',
    taxa_acerto: '66.6',
    preco: 'R$ 49,90/mês',
  };

  it('replaces all placeholders correctly', () => {
    const template = '{nome} - {grupo} - {dias_trial} - {data_expiracao} - {taxa_acerto} - {preco}';
    const result = renderWelcomeTemplate(template, baseVars);

    expect(result).toBe('João - Guru da Bet - 7 - 23/03/2026 - 66.6 - R$ 49,90/mês');
  });

  it('uses fallback values when vars are empty', () => {
    const template = '{nome} - {grupo} - {dias_trial} - {data_expiracao} - {taxa_acerto} - {preco}';
    const result = renderWelcomeTemplate(template, {});

    expect(result).toBe('apostador -  - 7 - — - 0 - ');
  });

  it('generates price line with price when preco is provided', () => {
    const template = '{linha_preco}';
    const result = renderWelcomeTemplate(template, { preco: 'R$ 49,90/mês' });

    expect(result).toContain('R$ 49,90/mês');
    expect(result).toContain('assine por apenas');
  });

  it('generates fallback price line when preco is empty', () => {
    const template = '{linha_preco}';
    const result = renderWelcomeTemplate(template, { preco: '' });

    expect(result).toBe('Para continuar após o trial, consulte o operador.');
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const template = '{nome} e {nome}';
    const result = renderWelcomeTemplate(template, { nome: 'João' });

    expect(result).toBe('João e João');
  });

  it('leaves unknown placeholders untouched', () => {
    const template = '{unknown_placeholder}';
    const result = renderWelcomeTemplate(template, baseVars);

    expect(result).toBe('{unknown_placeholder}');
  });

  it('handles null/undefined vars gracefully via fallbacks', () => {
    const template = '{nome}';
    const result = renderWelcomeTemplate(template, { nome: null });

    expect(result).toBe('apostador');
  });
});

describe('DEFAULT_WELCOME_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof DEFAULT_WELCOME_TEMPLATE).toBe('string');
    expect(DEFAULT_WELCOME_TEMPLATE.length).toBeGreaterThan(50);
  });

  it('contains all expected placeholders', () => {
    expect(DEFAULT_WELCOME_TEMPLATE).toContain('{grupo}');
    expect(DEFAULT_WELCOME_TEMPLATE).toContain('{nome}');
    expect(DEFAULT_WELCOME_TEMPLATE).toContain('{dias_trial}');
    expect(DEFAULT_WELCOME_TEMPLATE).toContain('{data_expiracao}');
    expect(DEFAULT_WELCOME_TEMPLATE).toContain('{taxa_acerto}');
    expect(DEFAULT_WELCOME_TEMPLATE).toContain('{linha_preco}');
  });

  it('renders correctly with renderWelcomeTemplate', () => {
    const result = renderWelcomeTemplate(DEFAULT_WELCOME_TEMPLATE, {
      nome: 'Maria',
      grupo: 'Test Group',
      dias_trial: 5,
      data_expiracao: '20/03/2026',
      taxa_acerto: '72.1',
      preco: 'R$ 39,90',
    });

    expect(result).toContain('Maria');
    expect(result).toContain('Test Group');
    expect(result).toContain('5 dias');
    expect(result).toContain('20/03/2026');
    expect(result).toContain('72.1%');
    expect(result).toContain('R$ 39,90');
  });
});

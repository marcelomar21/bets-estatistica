/**
 * Tests for marketInterpreter.js
 * Story 11.3: Criar testes unitários críticos
 */

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock OpenAI/LangChain (we're only testing pure functions, not AI calls)
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn(),
  })),
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const {
  isUnsupportedMarket,
  fallbackParsing,
  SUPPORTED_MARKETS,
  UNSUPPORTED_MARKETS,
} = require('../../bot/services/marketInterpreter');

describe('marketInterpreter', () => {
  describe('isUnsupportedMarket', () => {
    describe('detecta mercados não suportados', () => {
      test('detecta escanteios', () => {
        expect(isUnsupportedMarket('Mais de 8.5 escanteios')).toBe(true);
        expect(isUnsupportedMarket('Over 9.5 corners')).toBe(true);
        expect(isUnsupportedMarket('Total de corners acima de 10')).toBe(true);
      });

      test('detecta cartões', () => {
        expect(isUnsupportedMarket('Mais de 3.5 cartões')).toBe(true);
        expect(isUnsupportedMarket('Total de cartões amarelos')).toBe(true);
        expect(isUnsupportedMarket('Cartões vermelhos no jogo')).toBe(true);
        expect(isUnsupportedMarket('Over 4.5 bookings')).toBe(true);
      });

      test('detecta chutes', () => {
        expect(isUnsupportedMarket('Mais de 5.5 chutes no alvo')).toBe(true);
        expect(isUnsupportedMarket('Total shots on target')).toBe(true);
        expect(isUnsupportedMarket('Finalizações acima de 15')).toBe(true);
      });

      test('detecta faltas', () => {
        expect(isUnsupportedMarket('Total de faltas acima de 20')).toBe(true);
        expect(isUnsupportedMarket('Over 25 fouls')).toBe(true);
      });

      test('detecta impedimentos', () => {
        expect(isUnsupportedMarket('Mais de 3.5 impedimentos')).toBe(true);
        expect(isUnsupportedMarket('Total offsides over 4')).toBe(true);
      });
    });

    describe('permite mercados suportados', () => {
      test('permite mercado de gols', () => {
        expect(isUnsupportedMarket('Mais de 2.5 gols')).toBe(false);
        expect(isUnsupportedMarket('Under 3.5 goals')).toBe(false);
        expect(isUnsupportedMarket('Over 1.5 gols no jogo')).toBe(false);
      });

      test('permite BTTS', () => {
        expect(isUnsupportedMarket('Ambas equipes marcam - Sim')).toBe(false);
        expect(isUnsupportedMarket('Both teams to score - Yes')).toBe(false);
        expect(isUnsupportedMarket('BTTS - No')).toBe(false);
      });

      test('permite resultado da partida', () => {
        expect(isUnsupportedMarket('Vitória do mandante')).toBe(false);
        expect(isUnsupportedMarket('Empate')).toBe(false);
        expect(isUnsupportedMarket('Time visitante vence')).toBe(false);
      });

      test('permite handicap', () => {
        expect(isUnsupportedMarket('Time da casa -1.5')).toBe(false);
        expect(isUnsupportedMarket('Handicap asiático +0.5')).toBe(false);
      });
    });

    test('é case-insensitive', () => {
      expect(isUnsupportedMarket('ESCANTEIOS')).toBe(true);
      expect(isUnsupportedMarket('Corners')).toBe(true);
      expect(isUnsupportedMarket('CARTÕES')).toBe(true);
    });
  });

  describe('fallbackParsing', () => {
    describe('mercado totals (Over/Under)', () => {
      test('interpreta "Mais de X gols" como totals over', () => {
        const result = fallbackParsing('Mais de 2.5 gols');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('over');
        expect(result.line).toBe(2.5);
        expect(result.supported).toBe(true);
      });

      test('interpreta "Menos de X gols" como totals under', () => {
        const result = fallbackParsing('Menos de 3.5 gols');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('under');
        expect(result.line).toBe(3.5);
        expect(result.supported).toBe(true);
      });

      test('interpreta "Over X" como totals over', () => {
        const result = fallbackParsing('Over 1.5 goals');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('over');
        expect(result.line).toBe(1.5);
        expect(result.supported).toBe(true);
      });

      test('interpreta "Under X" como totals under', () => {
        const result = fallbackParsing('Under 2.5');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('under');
        expect(result.line).toBe(2.5);
        expect(result.supported).toBe(true);
      });

      test('interpreta "Acima de X" como totals over', () => {
        const result = fallbackParsing('Gols acima de 2,5');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('over');
        expect(result.line).toBe(2.5);
        expect(result.supported).toBe(true);
      });

      test('interpreta "Abaixo de X" como totals under', () => {
        const result = fallbackParsing('Gols abaixo de 1,5');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('under');
        expect(result.line).toBe(1.5);
        expect(result.supported).toBe(true);
      });

      test('extrai linha com vírgula decimal', () => {
        const result = fallbackParsing('Mais de 2,5 gols no jogo');
        expect(result.line).toBe(2.5);
      });

      test('extrai linha com ponto decimal', () => {
        const result = fallbackParsing('Over 3.5 gols');
        expect(result.line).toBe(3.5);
      });

      test('interpreta menção genérica de gols como over', () => {
        const result = fallbackParsing('Aposta em gols');
        expect(result.market).toBe('totals');
        expect(result.type).toBe('over');
        expect(result.supported).toBe(true);
      });
    });

    describe('mercado BTTS', () => {
      test('interpreta "Ambas equipes marcam" como btts yes', () => {
        const result = fallbackParsing('Ambas equipes marcam');
        expect(result.market).toBe('btts');
        expect(result.type).toBe('yes');
        expect(result.supported).toBe(true);
      });

      test('interpreta "Ambas não marcam" como btts no', () => {
        const result = fallbackParsing('Ambas equipes não marcam');
        expect(result.market).toBe('btts');
        expect(result.type).toBe('no');
        expect(result.supported).toBe(true);
      });

      test('interpreta "BTTS" como btts yes', () => {
        const result = fallbackParsing('BTTS - Sim');
        expect(result.market).toBe('btts');
        expect(result.type).toBe('yes');
        expect(result.supported).toBe(true);
      });

      test('interpreta "BTTS - No" como btts no', () => {
        const result = fallbackParsing('BTTS - No ');
        expect(result.market).toBe('btts');
        expect(result.type).toBe('no');
        expect(result.supported).toBe(true);
      });
    });

    describe('mercado h2h (1x2)', () => {
      test('interpreta "Vitória" do time da casa como h2h home', () => {
        const result = fallbackParsing('Vitória do time da casa');
        expect(result.market).toBe('h2h');
        expect(result.type).toBe('home');
        expect(result.supported).toBe(true);
      });

      test('interpreta "Vitória do mandante" como h2h home', () => {
        const result = fallbackParsing('Vitória do mandante');
        expect(result.market).toBe('h2h');
        expect(result.type).toBe('home');
        expect(result.supported).toBe(true);
      });

      test('interpreta "Vitória do visitante" como h2h away', () => {
        const result = fallbackParsing('Vitória do visitante');
        expect(result.market).toBe('h2h');
        expect(result.type).toBe('away');
        expect(result.supported).toBe(true);
      });

      test('interpreta "Vencer fora" como h2h away', () => {
        const result = fallbackParsing('Time visitante vencer');
        expect(result.market).toBe('h2h');
        expect(result.type).toBe('away');
        expect(result.supported).toBe(true);
      });

      test('interpreta "Empate" como h2h draw', () => {
        const result = fallbackParsing('Empate no jogo');
        expect(result.market).toBe('h2h');
        expect(result.type).toBe('draw');
        expect(result.supported).toBe(true);
      });
    });

    describe('mercados não suportados', () => {
      test('retorna supported=false para escanteios', () => {
        const result = fallbackParsing('Mais de 8.5 escanteios');
        expect(result.supported).toBe(false);
        expect(result.market).toBeNull();
        expect(result.reason).toBe('Unsupported market');
      });

      test('retorna supported=false para cartões', () => {
        const result = fallbackParsing('Over 3.5 cartões');
        expect(result.supported).toBe(false);
        expect(result.market).toBeNull();
      });

      test('retorna supported=false para mercado não identificável', () => {
        const result = fallbackParsing('Qualquer coisa aleatória');
        expect(result.supported).toBe(false);
        expect(result.market).toBeNull();
        expect(result.reason).toBe('Could not identify market');
      });
    });

    describe('extração de linha', () => {
      test('extrai linha 0.5', () => {
        const result = fallbackParsing('Over 0.5 gols');
        expect(result.line).toBe(0.5);
      });

      test('extrai linha 1.5', () => {
        const result = fallbackParsing('Mais de 1,5 gols');
        expect(result.line).toBe(1.5);
      });

      test('extrai linha 2.5', () => {
        const result = fallbackParsing('Under 2.5');
        expect(result.line).toBe(2.5);
      });

      test('extrai linha 3.5', () => {
        const result = fallbackParsing('Acima de 3,5 gols');
        expect(result.line).toBe(3.5);
      });

      test('retorna null para linha não especificada', () => {
        const result = fallbackParsing('Ambas equipes marcam');
        expect(result.line).toBeNull();
      });
    });
  });

  describe('constants', () => {
    test('SUPPORTED_MARKETS contém mercados esperados', () => {
      expect(SUPPORTED_MARKETS).toHaveProperty('totals');
      expect(SUPPORTED_MARKETS).toHaveProperty('btts');
      expect(SUPPORTED_MARKETS).toHaveProperty('h2h');
      expect(SUPPORTED_MARKETS).toHaveProperty('spreads');
      expect(SUPPORTED_MARKETS).toHaveProperty('draw_no_bet');
      expect(SUPPORTED_MARKETS).toHaveProperty('double_chance');
    });

    test('UNSUPPORTED_MARKETS contém termos esperados', () => {
      expect(UNSUPPORTED_MARKETS).toContain('corners');
      expect(UNSUPPORTED_MARKETS).toContain('escanteios');
      expect(UNSUPPORTED_MARKETS).toContain('cards');
      expect(UNSUPPORTED_MARKETS).toContain('cartões');
      expect(UNSUPPORTED_MARKETS).toContain('shots');
      expect(UNSUPPORTED_MARKETS).toContain('chutes');
    });
  });
});

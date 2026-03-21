/**
 * Tests for copyService.js
 * Story 11.3: Criar testes unitários críticos
 *
 * Cache was removed — persistence is now in generated_copy column.
 * These tests validate LLM generation only.
 */

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock OpenAI/LangChain
const mockChainInvoke = jest.fn();
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    // llm instance — used by chatPrompt.pipe(llm)
  })),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue({
        invoke: mockChainInvoke,
      }),
    }),
  },
}));

// Alias for backward-compatible test references
const mockInvoke = mockChainInvoke;

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { generateBetCopy } = require('../../bot/services/copyService');

describe('copyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBetCopy', () => {
    const validBet = {
      id: 123,
      homeTeamName: 'Flamengo',
      awayTeamName: 'Palmeiras',
      betMarket: 'Mais de 2.5 gols',
      betPick: 'Over 2.5',
      odds: 1.85,
      reasoning: 'Partida com alto potencial de gols',
    };

    test('retorna erro para bet null', async () => {
      const result = await generateBetCopy(null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_BET');
      expect(result.error.message).toBe('No bet provided');
    });

    test('retorna erro para bet undefined', async () => {
      const result = await generateBetCopy(undefined);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_BET');
    });

    test('gera copy com sucesso via LLM', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: '• Flamengo: 65% jogos com gols\n• Palmeiras: 70% ambas marcam\n• Média: 2,8 gols/jogo',
      });

      const result = await generateBetCopy(validBet);

      expect(result.success).toBe(true);
      expect(result.data.copy).toContain('• Flamengo');
      expect(result.data.fromCache).toBe(false);
    });

    test('calls LLM every time (no cache)', async () => {
      mockInvoke
        .mockResolvedValueOnce({ content: '• Estatística: 80% de acerto\n• Dado importante aqui' })
        .mockResolvedValueOnce({ content: '• Estatística: 80% de acerto\n• Dado importante aqui' });

      await generateBetCopy(validBet);
      await generateBetCopy(validBet);

      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    test('retorna erro quando LLM retorna texto sem bullets', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: 'Texto sem formato de bullet points',
      });

      const result = await generateBetCopy(validBet);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_FORMAT');
    });

    test('retorna erro quando LLM retorna vazio', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: '',
      });

      const result = await generateBetCopy(validBet);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_FORMAT');
    });

    test('limita a 5 bullets no máximo', async () => {
      const manyBullets = '• Bullet 1\n• Bullet 2\n• Bullet 3\n• Bullet 4\n• Bullet 5\n• Bullet 6\n• Bullet 7';
      mockInvoke.mockResolvedValueOnce({
        content: manyBullets,
      });

      const result = await generateBetCopy(validBet);

      expect(result.success).toBe(true);
      const bulletCount = (result.data.copy.match(/•/g) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(5);
    });

    test('retorna erro quando LLM falha', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const result = await generateBetCopy(validBet);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toBe('API rate limit exceeded');
    });

    test('filtra linhas que não são bullets', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: 'Texto inicial\n• Bullet válido\nOutro texto\n• Segundo bullet',
      });

      const result = await generateBetCopy(validBet);

      expect(result.success).toBe(true);
      expect(result.data.copy).toBe('• Bullet válido\n• Segundo bullet');
    });

    test('funciona com bet sem odds', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: '• Estatística sem odds: 75%',
      });

      const betSemOdds = { ...validBet, odds: null };
      const result = await generateBetCopy(betSemOdds);

      expect(result.success).toBe(true);
    });

    test('funciona com bet sem reasoning', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: '• Dado extraído: valor',
      });

      const betSemReasoning = { ...validBet, reasoning: null };
      const result = await generateBetCopy(betSemReasoning);

      expect(result.success).toBe(true);
    });

    test('full-message mode passa kickoffTime formatado em BRT para LLM', async () => {
      const { ChatPromptTemplate } = require('@langchain/core/prompts');

      mockInvoke.mockResolvedValueOnce({
        content: '🎯 Flamengo x Palmeiras\n📅 21/03 17:00\n📊 Over 2.5\n💰 Odd: 1.85',
      });

      const betWithKickoff = {
        ...validBet,
        kickoffTime: '2026-03-21T20:00:00.000Z', // 20:00 UTC = 17:00 BRT
        deepLink: 'https://bet.link/123',
      };

      const toneConfig = {
        examplePost: '🎯 Time A x Time B\n📅 21/03 15:00\n📊 Mercado\n💰 Odd: 1.50',
      };

      await generateBetCopy(betWithKickoff, toneConfig);

      // Verify the prompt sent to LLM contains BRT-formatted time, not raw UTC
      const fromMessagesCall = ChatPromptTemplate.fromMessages.mock.calls;
      const lastCall = fromMessagesCall[fromMessagesCall.length - 1];
      const humanMessage = lastCall[0].find(([role]) => role === 'human')[1];

      expect(humanMessage).toContain('21/03 17:00');
      expect(humanMessage).not.toContain('2026-03-21T20:00:00');
    });
  });
});

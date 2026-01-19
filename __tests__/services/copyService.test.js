/**
 * Tests for copyService.js
 * Story 11.3: Criar testes unitários críticos
 */

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock OpenAI/LangChain
const mockInvoke = jest.fn();
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
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
  generateBetCopy,
  clearCache,
  clearBetCache,
  getCacheStats,
} = require('../../bot/services/copyService');

describe('copyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache(); // Clear cache before each test
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

    test('retorna copy do cache na segunda chamada', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: '• Estatística: 80% de acerto\n• Dado importante aqui',
      });

      // First call - goes to LLM
      const result1 = await generateBetCopy(validBet);
      expect(result1.success).toBe(true);
      expect(result1.data.fromCache).toBe(false);

      // Second call - should come from cache
      const result2 = await generateBetCopy(validBet);
      expect(result2.success).toBe(true);
      expect(result2.data.fromCache).toBe(true);
      expect(result2.data.copy).toBe(result1.data.copy);

      // LLM should only be called once
      expect(mockInvoke).toHaveBeenCalledTimes(1);
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
  });

  describe('clearCache', () => {
    test('limpa todo o cache', async () => {
      mockInvoke.mockResolvedValue({
        content: '• Dado para cache: 50%',
      });

      // Generate some cached copies
      await generateBetCopy({ id: 1, homeTeamName: 'A', awayTeamName: 'B', betMarket: 'Test' });
      await generateBetCopy({ id: 2, homeTeamName: 'C', awayTeamName: 'D', betMarket: 'Test' });

      const statsBefore = getCacheStats();
      expect(statsBefore.size).toBe(2);

      clearCache();

      const statsAfter = getCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('clearBetCache', () => {
    test('limpa cache de aposta específica', async () => {
      mockInvoke.mockResolvedValue({
        content: '• Dado para cache específico: 75%',
      });

      // Generate cached copy
      const bet = { id: 123, homeTeamName: 'A', awayTeamName: 'B', betMarket: 'Test' };
      await generateBetCopy(bet);

      const statsBefore = getCacheStats();
      expect(statsBefore.size).toBe(1);

      const deleted = clearBetCache(123);
      expect(deleted).toBe(true);

      const statsAfter = getCacheStats();
      expect(statsAfter.size).toBe(0);
    });

    test('retorna false quando bet não está no cache', () => {
      const deleted = clearBetCache(999);
      expect(deleted).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    test('retorna estatísticas corretas do cache', () => {
      const stats = getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttlMs');
      expect(typeof stats.size).toBe('number');
      expect(stats.maxSize).toBe(200);
      expect(stats.ttlMs).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    test('reflete tamanho atual do cache', async () => {
      mockInvoke.mockResolvedValue({
        content: '• Estatística para teste: 90%',
      });

      expect(getCacheStats().size).toBe(0);

      await generateBetCopy({ id: 1, homeTeamName: 'A', awayTeamName: 'B', betMarket: 'Test' });
      expect(getCacheStats().size).toBe(1);

      await generateBetCopy({ id: 2, homeTeamName: 'C', awayTeamName: 'D', betMarket: 'Test' });
      expect(getCacheStats().size).toBe(2);
    });
  });
});

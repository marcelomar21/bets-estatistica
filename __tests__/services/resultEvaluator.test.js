/**
 * Tests for resultEvaluator.js
 * Tech-Spec: Avaliar Resultados de Bets com LLM
 */

// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock config (necessario para config.apis e config.llm)
jest.mock('../../lib/config', () => ({
  config: {
    apis: {
      openaiApiKey: 'test-api-key',
    },
    llm: {
      resultEvaluatorModel: 'gpt-5.2',
    },
  },
}));

// Mock para invoke que sera chamado pelo chain
const mockInvoke = jest.fn();

// Mock LangChain - chain.invoke() e chamado apos prompt.pipe(structuredLlm)
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      // structuredLlm - este objeto sera passado para prompt.pipe()
    }),
  })),
}));

// Mock ChatPromptTemplate - prompt.pipe(structuredLlm) retorna chain com invoke
jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue({
        invoke: mockInvoke,
      }),
    }),
  },
}));

const { extractMatchData, evaluateBetsWithLLM } = require('../../bot/services/resultEvaluator');

describe('resultEvaluator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractMatchData', () => {
    test('extrai dados corretamente do raw_match completo', () => {
      const rawMatch = {
        homeGoalCount: 2,
        awayGoalCount: 1,
        totalGoalCount: 3,
        team_a_corners: 5,
        team_b_corners: 3,
        totalCornerCount: 8,
        team_a_yellow_cards: 2,
        team_b_yellow_cards: 3,
        team_a_red_cards: 0,
        team_b_red_cards: 1,
        btts: true,
      };

      const result = extractMatchData(rawMatch);

      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
      expect(result.totalGoals).toBe(3);
      expect(result.homeCorners).toBe(5);
      expect(result.awayCorners).toBe(3);
      expect(result.totalCorners).toBe(8);
      expect(result.homeYellow).toBe(2);
      expect(result.awayYellow).toBe(3);
      expect(result.totalYellow).toBe(5);
      expect(result.homeRed).toBe(0);
      expect(result.awayRed).toBe(1);
      expect(result.totalRed).toBe(1);
      expect(result.totalCards).toBe(6);
      expect(result.btts).toBe(true);
    });

    test('calcula btts quando nao fornecido pela API', () => {
      const rawMatch = {
        homeGoalCount: 2,
        awayGoalCount: 1,
        // btts nao definido
      };

      const result = extractMatchData(rawMatch);

      expect(result.btts).toBe(true); // Calculado: 2 > 0 && 1 > 0
    });

    test('retorna null para campos ausentes', () => {
      const rawMatch = {
        homeGoalCount: 2,
        awayGoalCount: 0,
        // Sem dados de escanteios
      };

      const result = extractMatchData(rawMatch);

      expect(result.homeCorners).toBeNull();
      expect(result.awayCorners).toBeNull();
      expect(result.totalCorners).toBeNull();
    });

    test('usa home_score/away_score como fallback', () => {
      const rawMatch = {
        home_score: 3,
        away_score: 2,
        // homeGoalCount/awayGoalCount nao definidos
      };

      const result = extractMatchData(rawMatch);

      expect(result.homeScore).toBe(3);
      expect(result.awayScore).toBe(2);
    });

    // F15: BTTS null quando scores sao null
    test('retorna btts null quando scores sao null', () => {
      const rawMatch = {
        // Sem homeGoalCount nem awayGoalCount
      };

      const result = extractMatchData(rawMatch);

      expect(result.homeScore).toBeNull();
      expect(result.awayScore).toBeNull();
      expect(result.btts).toBeNull(); // Nao deve ser false, deve ser null
    });
  });

  describe('evaluateBetsWithLLM', () => {
    test('retorna array vazio para lista vazia de apostas', async () => {
      const result = await evaluateBetsWithLLM(
        { homeTeamName: 'Team A', awayTeamName: 'Team B', rawMatch: {} },
        []
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    test('retorna unknown quando dados do jogo estao incompletos', async () => {
      const result = await evaluateBetsWithLLM(
        {
          homeTeamName: 'Team A',
          awayTeamName: 'Team B',
          rawMatch: {}, // Sem placar
        },
        [{ id: 1, betMarket: 'Over 2.5', betPick: 'Sim' }]
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(1);
      expect(result.data[0].result).toBe('unknown');
      expect(result.data[0].reason).toContain('incompletos');
    });

    test('chama LLM e retorna resultado estruturado', async () => {
      const mockResponse = {
        results: [
          { id: 1, result: 'success', reason: 'Placar 2x1, total 3 gols > 2.5' },
          { id: 2, result: 'failure', reason: 'Placar 2x1, total 3 gols < 3.5' },
        ],
      };

      mockInvoke.mockResolvedValue(mockResponse);

      const result = await evaluateBetsWithLLM(
        {
          matchId: 123,
          homeTeamName: 'Flamengo',
          awayTeamName: 'Vasco',
          rawMatch: {
            homeGoalCount: 2,
            awayGoalCount: 1,
            totalGoalCount: 3,
          },
        },
        [
          { id: 1, betMarket: 'Over 2.5 gols', betPick: 'Sim' },
          { id: 2, betMarket: 'Over 3.5 gols', betPick: 'Sim' },
        ]
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].result).toBe('success');
      expect(result.data[1].result).toBe('failure');
    });

    test('faz retry em caso de erro da API', async () => {
      // Primeira chamada falha, segunda sucede
      mockInvoke
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce({
          results: [{ id: 1, result: 'success', reason: 'Test' }],
        });

      const result = await evaluateBetsWithLLM(
        {
          matchId: 123,
          homeTeamName: 'Team A',
          awayTeamName: 'Team B',
          rawMatch: {
            homeGoalCount: 2,
            awayGoalCount: 1,
          },
        },
        [{ id: 1, betMarket: 'Test', betPick: 'Test' }]
      );

      expect(result.success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    test('retorna erro apos exceder maximo de retries', async () => {
      mockInvoke.mockRejectedValue(new Error('API error'));

      const result = await evaluateBetsWithLLM(
        {
          matchId: 123,
          homeTeamName: 'Team A',
          awayTeamName: 'Team B',
          rawMatch: {
            homeGoalCount: 2,
            awayGoalCount: 1,
          },
        },
        [{ id: 1, betMarket: 'Test', betPick: 'Test' }]
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LLM_ERROR');
      expect(mockInvoke).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
    });
  });
});

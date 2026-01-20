/**
 * Tests for metricsService.js
 * Story 11.3: Criar testes unitários críticos
 */

// Mock supabase before importing the service
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock logger to prevent console output during tests
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { formatStatsMessage, getSuccessRate, getDetailedStats } = require('../../bot/services/metricsService');
const { supabase } = require('../../lib/supabase');

describe('metricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatStatsMessage', () => {
    test('retorna mensagem padrão para null', () => {
      expect(formatStatsMessage(null)).toBe('Estatísticas não disponíveis');
    });

    test('retorna mensagem padrão para undefined', () => {
      expect(formatStatsMessage(undefined)).toBe('Estatísticas não disponíveis');
    });

    test('formata corretamente com dados válidos completos', () => {
      const stats = {
        last30Days: { success: 7, total: 10, rate: 70 },
        allTime: { success: 15, total: 20, rate: 75 },
      };
      const result = formatStatsMessage(stats);

      expect(result).toContain('📊 *Estatísticas de Acerto*');
      expect(result).toContain('7/10');
      expect(result).toContain('70.0%');
      expect(result).toContain('15/20');
      expect(result).toContain('75.0%');
      expect(result).toContain('*Últimos 30 dias:*');
      expect(result).toContain('*Histórico total:*');
    });

    test('formata corretamente com dados vazios (zeros)', () => {
      const stats = {
        last30Days: { success: 0, total: 0, rate: null },
        allTime: { success: 0, total: 0, rate: null },
      };
      const result = formatStatsMessage(stats);

      expect(result).toContain('📊 *Estatísticas de Acerto*');
      expect(result).toContain('_Ainda não há resultados registrados._');
    });

    test('formata corretamente apenas com dados de 30 dias', () => {
      const stats = {
        last30Days: { success: 5, total: 8, rate: 62.5 },
        allTime: { success: 0, total: 0, rate: null },
      };
      const result = formatStatsMessage(stats);

      expect(result).toContain('5/8');
      expect(result).toContain('62.5%');
      expect(result).not.toContain('*Histórico total:*');
    });

    test('formata corretamente apenas com dados históricos', () => {
      const stats = {
        last30Days: { success: 0, total: 0, rate: null },
        allTime: { success: 10, total: 15, rate: 66.67 },
      };
      const result = formatStatsMessage(stats);

      expect(result).toContain('10/15');
      expect(result).toContain('66.7%');
      expect(result).not.toContain('*Últimos 30 dias:*');
    });

    test('formata taxa com uma casa decimal', () => {
      const stats = {
        last30Days: { success: 1, total: 3, rate: 33.333333 },
        allTime: { success: 0, total: 0, rate: null },
      };
      const result = formatStatsMessage(stats);

      expect(result).toContain('33.3%');
      expect(result).not.toContain('33.333%');
    });
  });

  describe('getSuccessRate', () => {
    test('retorna stats corretas com dados válidos', async () => {
      // Mock all-time query (now uses bet_result)
      const mockAllTimeData = [
        { id: 1, bet_result: 'success' },
        { id: 2, bet_result: 'success' },
        { id: 3, bet_result: 'failure' },
      ];

      // Mock recent (30 days) query (now uses bet_result)
      const mockRecentData = [
        { id: 1, bet_result: 'success', result_updated_at: new Date().toISOString() },
        { id: 2, bet_result: 'failure', result_updated_at: new Date().toISOString() },
      ];

      // Setup mock chain for all-time query
      const allTimeSelectMock = jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ data: mockAllTimeData, error: null }),
      });

      // Setup mock chain for recent query
      const recentSelectMock = jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          gte: jest.fn().mockResolvedValue({ data: mockRecentData, error: null }),
        }),
      });

      // First call returns all-time, second call returns recent
      let callCount = 0;
      supabase.from.mockImplementation(() => ({
        select: jest.fn().mockImplementation((fields) => {
          callCount++;
          if (callCount === 1) {
            return {
              in: jest.fn().mockResolvedValue({ data: mockAllTimeData, error: null }),
            };
          } else {
            return {
              in: jest.fn().mockReturnValue({
                gte: jest.fn().mockResolvedValue({ data: mockRecentData, error: null }),
              }),
            };
          }
        }),
      }));

      const result = await getSuccessRate();

      expect(result.success).toBe(true);
      expect(result.data.allTime.success).toBe(2);
      expect(result.data.allTime.total).toBe(3);
      expect(result.data.allTime.rate).toBeCloseTo(66.67, 1);
      expect(result.data.last30Days.success).toBe(1);
      expect(result.data.last30Days.total).toBe(2);
      expect(result.data.last30Days.rate).toBe(50);
    });

    test('retorna erro quando falha query de all-time', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' }
          }),
        }),
      });

      const result = await getSuccessRate();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });

    test('retorna taxa null quando não há resultados', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      // For all-time call
      let callCount = 0;
      supabase.from.mockImplementation(() => ({
        select: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            };
          } else {
            return {
              in: jest.fn().mockReturnValue({
                gte: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
        }),
      }));

      const result = await getSuccessRate();

      expect(result.success).toBe(true);
      expect(result.data.allTime.rate).toBeNull();
      expect(result.data.last30Days.rate).toBeNull();
    });
  });

  describe('getDetailedStats', () => {
    test('retorna stats detalhadas por mercado', async () => {
      // Mock data now uses bet_result for success/failure and bet_status='posted' for all
      const mockData = [
        { id: 1, bet_market: 'totals', bet_status: 'posted', bet_result: 'success', odds_at_post: 1.85, result_updated_at: '2026-01-10', telegram_posted_at: '2026-01-09' },
        { id: 2, bet_market: 'totals', bet_status: 'posted', bet_result: 'failure', odds_at_post: 1.90, result_updated_at: '2026-01-10', telegram_posted_at: '2026-01-09' },
        { id: 3, bet_market: 'btts', bet_status: 'posted', bet_result: 'success', odds_at_post: 2.00, result_updated_at: '2026-01-10', telegram_posted_at: '2026-01-09' },
        { id: 4, bet_market: 'btts', bet_status: 'posted', bet_result: 'pending', odds_at_post: 1.75, result_updated_at: null, telegram_posted_at: '2026-01-11' },
      ];

      // Query now uses .eq('bet_status', 'posted') instead of .in()
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const result = await getDetailedStats();

      expect(result.success).toBe(true);
      expect(result.data.totalPosted).toBe(4);
      expect(result.data.totalCompleted).toBe(3);
      expect(result.data.byMarket.totals.success).toBe(1);
      expect(result.data.byMarket.totals.failure).toBe(1);
      expect(result.data.byMarket.btts.success).toBe(1);
      expect(result.data.averageOdds).toBeCloseTo(1.917, 2);
    });

    test('retorna erro quando query falha', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Query failed' }
            }),
          }),
        }),
      });

      const result = await getDetailedStats();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });
});

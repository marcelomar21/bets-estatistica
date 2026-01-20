/**
 * Tests for betService.js
 * Story 11.3: Criar testes unitários críticos
 */

// Mock supabase before importing the service
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    betting: {
      minOdds: 1.60,
      maxActiveBets: 3,
      maxDaysAhead: 2,
    },
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { tryAutoPromote, updateBetStatus, updateBetOdds, updateBetLink } = require('../../bot/services/betService');
const { supabase } = require('../../lib/supabase');

describe('betService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tryAutoPromote', () => {
    test('promove aposta quando todas condições são atendidas', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'pending_link',
        odds: 1.85,
        deep_link: 'https://bet365.com/bet/123',
        eligible: true,
      };

      // Mock fetch
      const selectSingleMock = jest.fn().mockResolvedValue({ data: mockBet, error: null });
      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: selectSingleMock,
        }),
      });

      // Mock update
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: selectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(true);
    });

    test('não promove aposta já em status ready', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'ready',
        odds: 1.85,
        deep_link: 'https://bet365.com/bet/123',
        eligible: true,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBet, error: null }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('Already ready');
    });

    test('não promove aposta já postada', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'posted',
        odds: 1.85,
        deep_link: 'https://bet365.com/bet/123',
        eligible: true,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBet, error: null }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('Already posted');
    });

    test('não promove aposta sem deep_link', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'pending_link',
        odds: 1.85,
        deep_link: null,
        eligible: true,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBet, error: null }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('No deep_link');
    });

    test('não promove aposta com odds abaixo do mínimo', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'pending_link',
        odds: 1.50, // Below minOdds (1.60)
        deep_link: 'https://bet365.com/bet/123',
        eligible: true,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBet, error: null }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain('1.5');
      expect(result.reason).toContain('< 1.6');
    });

    test('não promove aposta com odds null', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'pending_link',
        odds: null,
        deep_link: 'https://bet365.com/bet/123',
        eligible: true,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBet, error: null }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain('null');
    });

    test('não promove aposta não elegível', async () => {
      const mockBet = {
        id: 123,
        bet_status: 'pending_link',
        odds: 1.85,
        deep_link: 'https://bet365.com/bet/123',
        eligible: false,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBet, error: null }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(123);

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('Not eligible');
    });

    test('retorna erro quando aposta não existe', async () => {
      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' }
          }),
        }),
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await tryAutoPromote(999);

      expect(result.promoted).toBe(false);
      expect(result.reason).toBe('Bet not found');
    });

    // Note: Tests for 'success' and 'failure' status removed.
    // After migration 013, these are now bet_result values, not bet_status.
    // Apostas posted com bet_result='success'/'failure' já são cobertas pelo teste "já postada".
  });

  describe('updateBetStatus', () => {
    test('atualiza status com sucesso', async () => {
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      supabase.from.mockReturnValue({ update: updateMock });

      const result = await updateBetStatus(123, 'ready');

      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({ bet_status: 'ready' });
    });

    test('atualiza status com campos extras', async () => {
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      supabase.from.mockReturnValue({ update: updateMock });

      const extraFields = {
        telegram_posted_at: '2026-01-12T10:00:00Z',
        telegram_message_id: 456,
      };

      const result = await updateBetStatus(123, 'posted', extraFields);

      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({
        bet_status: 'posted',
        telegram_posted_at: '2026-01-12T10:00:00Z',
        telegram_message_id: 456,
      });
    });

    test('retorna erro quando update falha', async () => {
      const updateEqMock = jest.fn().mockResolvedValue({
        error: { message: 'Database error' }
      });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      supabase.from.mockReturnValue({ update: updateMock });

      const result = await updateBetStatus(123, 'ready');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('updateBetOdds', () => {
    test('atualiza odds e tenta auto-promoção', async () => {
      // Story 14.8: updateBetOdds agora faz SELECT antes de UPDATE para registrar historico
      // Ordem das chamadas: 1) SELECT odds atual, 2) UPDATE, 3) INSERT historico, 4) SELECT tryAutoPromote

      // Mock for update
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      // Mock for insert (odds_update_history) - best effort
      const insertMock = jest.fn().mockResolvedValue({ error: null });

      // Mock for SELECT (get current odds, then tryAutoPromote)
      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 123,
              bet_status: 'pending_link',
              odds: 1.50, // OLD value - must be different from new (2.00)
              deep_link: null,
              eligible: true,
            },
            error: null,
          }),
        }),
      });

      let callCount = 0;
      supabase.from.mockImplementation((table) => {
        callCount++;
        if (table === 'odds_update_history') {
          return { insert: insertMock };
        }
        if (callCount === 1) {
          // First call: SELECT to get current odds
          return { select: selectMock };
        } else if (callCount === 2) {
          // Second call: UPDATE
          return { update: updateMock };
        } else {
          // Third+ calls: SELECT for tryAutoPromote
          return { select: selectMock };
        }
      });

      const result = await updateBetOdds(123, 2.00);

      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({ odds: 2.00 });
    });

    test('atualiza odds com notas', async () => {
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      const insertMock = jest.fn().mockResolvedValue({ error: null });

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 123, bet_status: 'ready', odds: 1.50, deep_link: null, eligible: true },
            error: null,
          }),
        }),
      });

      let callCount = 0;
      supabase.from.mockImplementation((table) => {
        callCount++;
        if (table === 'odds_update_history') {
          return { insert: insertMock };
        }
        if (callCount === 1) {
          return { select: selectMock };
        } else if (callCount === 2) {
          return { update: updateMock };
        } else {
          return { select: selectMock };
        }
      });

      const result = await updateBetOdds(123, 2.00, 'Odds manual via /odd');

      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({
        odds: 2.00,
        notes: 'Odds manual via /odd',
      });
    });

    test('nao atualiza quando odds nao mudou (Story 14.8 AC3)', async () => {
      // Story 14.8: Nao duplica registros quando odds nao muda
      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { odds: 2.00 }, // Same as new value
            error: null,
          }),
        }),
      });

      supabase.from.mockImplementation(() => {
        return { select: selectMock };
      });

      const result = await updateBetOdds(123, 2.00);

      expect(result.success).toBe(true);
      expect(result.promoted).toBe(false);
    });
  });

  describe('updateBetLink', () => {
    test('atualiza link e tenta auto-promoção', async () => {
      // Mock for update
      const updateEqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      // Mock for tryAutoPromote - will promote
      const mockBetAfterUpdate = {
        id: 123,
        bet_status: 'pending_link',
        odds: 1.85,
        deep_link: 'https://bet365.com/bet/123',
        eligible: true,
      };

      const selectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockBetAfterUpdate, error: null }),
        }),
      });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { update: updateMock };
        } else if (callCount === 2) {
          return { select: selectMock };
        } else {
          // For the promotion update
          return { update: updateMock };
        }
      });

      const result = await updateBetLink(123, 'https://bet365.com/bet/123');

      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({ deep_link: 'https://bet365.com/bet/123' });
    });

    test('retorna erro quando update falha', async () => {
      const updateEqMock = jest.fn().mockResolvedValue({
        error: { message: 'Database error' }
      });
      const updateMock = jest.fn().mockReturnValue({
        eq: updateEqMock,
      });

      supabase.from.mockReturnValue({ update: updateMock });

      const result = await updateBetLink(123, 'https://bet365.com/bet/123');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('validações de status', () => {
    const validStatuses = ['generated', 'pending_link', 'ready', 'posted', 'success', 'failure', 'cancelled'];

    validStatuses.forEach(status => {
      test(`permite status "${status}"`, async () => {
        const updateEqMock = jest.fn().mockResolvedValue({ error: null });
        const updateMock = jest.fn().mockReturnValue({
          eq: updateEqMock,
        });

        supabase.from.mockReturnValue({ update: updateMock });

        const result = await updateBetStatus(123, status);

        expect(result.success).toBe(true);
      });
    });
  });
});

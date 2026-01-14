/**
 * Tests for jobWarn.js
 * Story 14.2: Criar módulo de warns
 */

// Mock telegram before importing the module
jest.mock('../../bot/telegram', () => ({
  sendToAdmin: jest.fn().mockResolvedValue({ success: true, data: { messageId: 123 } }),
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const {
  sendPostWarn,
  sendScrapingWarn,
  sendAnalysisWarn,
  getPeriodName,
  getNextPostTime,
  groupBetsByDay,
  formatBetLine,
  formatPostedBetsList,
  getBetStatusDisplay,
} = require('../../bot/jobs/jobWarn');
const { sendToAdmin } = require('../../bot/telegram');

describe('jobWarn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPeriodName', () => {
    test('retorna MANHA para morning', () => {
      expect(getPeriodName('morning')).toBe('MANHA');
    });

    test('retorna TARDE para afternoon', () => {
      expect(getPeriodName('afternoon')).toBe('TARDE');
    });

    test('retorna NOITE para night', () => {
      expect(getPeriodName('night')).toBe('NOITE');
    });

    test('retorna uppercase para periodo desconhecido', () => {
      expect(getPeriodName('custom')).toBe('CUSTOM');
    });
  });

  describe('getNextPostTime', () => {
    test('retorna proximo horario de postagem', () => {
      const result = getNextPostTime();
      expect(['10:00', '15:00', '22:00', '10:00 (amanha)']).toContain(result);
    });
  });

  describe('getBetStatusDisplay', () => {
    test('retorna Pronta para status ready', () => {
      expect(getBetStatusDisplay({ betStatus: 'ready' })).toContain('Pronta');
    });

    test('retorna Pronta para bet_status ready (snake_case)', () => {
      expect(getBetStatusDisplay({ bet_status: 'ready' })).toContain('Pronta');
    });

    test('retorna Sem link quando deepLink ausente', () => {
      expect(getBetStatusDisplay({ betStatus: 'pending_link' })).toContain('Sem link');
    });

    test('retorna Pronta quando tem link e odds ok', () => {
      expect(getBetStatusDisplay({ deepLink: 'http://bet.com', odds: 1.8 })).toContain('Pronta');
    });
  });

  describe('groupBetsByDay', () => {
    test('agrupa apostas por dia', () => {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const bets = [
        { id: 1, matchTime: today.toISOString() },
        { id: 2, matchTime: tomorrow.toISOString() },
        { id: 3, matchTime: today.toISOString() },
      ];

      const grouped = groupBetsByDay(bets);
      const keys = Object.keys(grouped);

      expect(keys.length).toBe(2);
      expect(keys[0]).toContain('HOJE');
      expect(keys[1]).toContain('AMANHA');
    });

    test('suporta snake_case match_time', () => {
      const today = new Date();
      const bets = [{ id: 1, match_time: today.toISOString() }];

      const grouped = groupBetsByDay(bets);
      expect(Object.keys(grouped).length).toBe(1);
    });
  });

  describe('formatPostedBetsList', () => {
    test('formata lista de apostas postadas', () => {
      const bets = [
        {
          id: 45,
          homeTeamName: 'Liverpool',
          awayTeamName: 'Arsenal',
          betMarket: 'Over 2.5',
          odds: 1.85,
        },
      ];

      const result = formatPostedBetsList(bets);
      expect(result).toContain('#45');
      expect(result).toContain('Liverpool');
      expect(result).toContain('Arsenal');
      expect(result).toContain('Over 2.5');
      expect(result).toContain('1.85');
    });

    test('retorna mensagem padrao para lista vazia', () => {
      expect(formatPostedBetsList([])).toBe('Nenhuma aposta postada');
      expect(formatPostedBetsList(null)).toBe('Nenhuma aposta postada');
    });

    test('suporta snake_case fields', () => {
      const bets = [
        {
          id: 45,
          home_team_name: 'Liverpool',
          away_team_name: 'Arsenal',
          bet_market: 'Over 2.5',
          odds: 1.85,
        },
      ];

      const result = formatPostedBetsList(bets);
      expect(result).toContain('Liverpool');
    });
  });

  describe('formatBetLine', () => {
    test('formata linha de aposta com horario', () => {
      const bet = {
        id: 52,
        homeTeamName: 'Man City',
        awayTeamName: 'Chelsea',
        betMarket: 'Under 3.5',
        betPick: 'Under',
        odds: 1.68,
        matchTime: '2026-01-14T17:00:00Z',
      };

      const result = formatBetLine(bet, true);
      expect(result).toContain('#52');
      expect(result).toContain('Man City');
      expect(result).toContain('Chelsea');
      expect(result).toContain('Under 3.5');
      expect(result).toContain('1.68');
    });

    test('formata linha sem horario quando includeTime false', () => {
      const bet = {
        id: 52,
        homeTeamName: 'Man City',
        awayTeamName: 'Chelsea',
        betMarket: 'Under 3.5',
        betPick: 'Under',
        odds: 1.68,
        matchTime: '2026-01-14T17:00:00Z',
      };

      const result = formatBetLine(bet, false);
      expect(result).toContain('#52');
      expect(result).not.toMatch(/\d{2}:\d{2}/); // No time format
    });
  });

  describe('sendPostWarn', () => {
    test('envia warn de postagem com sucesso', async () => {
      const postedBets = [
        { id: 45, homeTeamName: 'Liverpool', awayTeamName: 'Arsenal', betMarket: 'Over 2.5', odds: 1.85 },
      ];

      const result = await sendPostWarn('morning', postedBets, [], []);

      expect(sendToAdmin).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('POSTAGEM MANHA CONCLUIDA');
      expect(message).toContain('#45');
      expect(message).toContain('Liverpool');
    });

    test('inclui acoes pendentes na mensagem', async () => {
      const pendingActions = ['#58 precisa de link', '#63 sem odds'];

      await sendPostWarn('afternoon', [], [], pendingActions);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('ACOES PENDENTES');
      expect(message).toContain('#58 precisa de link');
      expect(message).toContain('#63 sem odds');
    });

    test('inclui proximo horario de postagem', async () => {
      await sendPostWarn('night', [], [], []);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('Proxima postagem');
    });

    test('funciona com parametros vazios', async () => {
      const result = await sendPostWarn('morning');
      expect(result.success).toBe(true);
    });
  });

  describe('sendScrapingWarn', () => {
    test('envia warn de scraping com atualizacoes', async () => {
      const updatedBets = [
        { id: 45, oldOdds: 1.75, newOdds: 1.85 },
        { id: 47, oldOdds: 1.60, newOdds: 1.72 },
      ];

      const result = await sendScrapingWarn(updatedBets, [], {});

      expect(sendToAdmin).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('SCRAPING CONCLUIDO');
      expect(message).toContain('#45');
      expect(message).toContain('1.75');
      expect(message).toContain('1.85');
    });

    test('inclui falhas na mensagem', async () => {
      const failedBets = [{ id: 99, error: 'Timeout' }];

      await sendScrapingWarn([], failedBets, {});

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('FALHAS');
      expect(message).toContain('#99');
      expect(message).toContain('Timeout');
    });

    test('inclui status para proxima postagem', async () => {
      const status = { ready: 3, noLink: 1, lowOdds: 2 };

      await sendScrapingWarn([], [], status);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('STATUS PARA PROXIMA POSTAGEM');
      expect(message).toContain('Prontas: 3');
      expect(message).toContain('Sem link: 1');
      expect(message).toContain('Odds baixa: 2');
    });

    test('funciona sem atualizacoes', async () => {
      await sendScrapingWarn([], [], {});

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('Nenhuma mudanca');
    });
  });

  describe('sendAnalysisWarn', () => {
    test('envia warn de analise com novas apostas', async () => {
      const newBets = [{ id: 101 }, { id: 102 }, { id: 103 }];

      const result = await sendAnalysisWarn(newBets);

      expect(sendToAdmin).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('ANALISE CONCLUIDA');
      expect(message).toContain('101, 102, 103');
      expect(message).toContain('Total: 3');
    });

    test('aceita array de IDs diretos', async () => {
      const newBets = [201, 202];

      await sendAnalysisWarn(newBets);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('201, 202');
    });

    test('funciona sem novas apostas', async () => {
      await sendAnalysisWarn([]);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('Nenhuma nova aposta');
    });

    test('inclui proximo horario de postagem', async () => {
      await sendAnalysisWarn([]);

      const message = sendToAdmin.mock.calls[0][0];
      expect(message).toContain('Proxima postagem');
    });
  });
});

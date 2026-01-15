/**
 * Tests for formatters utility module
 * Story: 14.5 - Implementar agrupamento por dia
 * Story: 14.6 - Adicionar paginacao em todos os comandos
 */

const { getDayLabel, groupBetsByDay, formatBetListWithDays, paginateResults, formatPaginationFooter } = require('../../bot/utils/formatters');

describe('formatters', () => {
  describe('getDayLabel', () => {
    it('retorna HOJE para data de hoje', () => {
      const today = new Date();
      const dateKey = today.toLocaleDateString('sv-SE');
      const label = getDayLabel(dateKey);
      expect(label).toMatch(/^HOJE - \d{2}\/\d{2}$/);
    });

    it('retorna AMANHA para data de amanha', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateKey = tomorrow.toLocaleDateString('sv-SE');
      const label = getDayLabel(dateKey);
      expect(label).toMatch(/^AMANHÃ - \d{2}\/\d{2}$/);
    });

    it('retorna data com dia da semana para outras datas', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateKey = futureDate.toLocaleDateString('sv-SE');
      const label = getDayLabel(dateKey);
      // Should be DD/MM (weekday)
      expect(label).toMatch(/^\d{2}\/\d{2} \(.+\)$/);
    });
  });

  describe('groupBetsByDay', () => {
    it('agrupa apostas por dia corretamente', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const bets = [
        { id: 1, kickoffTime: today.toISOString() },
        { id: 2, kickoffTime: today.toISOString() },
        { id: 3, kickoffTime: tomorrow.toISOString() },
      ];

      const grouped = groupBetsByDay(bets);
      const keys = Object.keys(grouped);

      expect(keys.length).toBe(2);
      expect(grouped[keys[0]].length).toBe(2);
      expect(grouped[keys[1]].length).toBe(1);
    });

    it('retorna grupos ordenados por data', () => {
      const date1 = new Date('2026-01-15T10:00:00Z');
      const date2 = new Date('2026-01-14T10:00:00Z');
      const date3 = new Date('2026-01-16T10:00:00Z');

      const bets = [
        { id: 1, kickoffTime: date1.toISOString() },
        { id: 2, kickoffTime: date2.toISOString() },
        { id: 3, kickoffTime: date3.toISOString() },
      ];

      const grouped = groupBetsByDay(bets);
      const keys = Object.keys(grouped);

      expect(keys[0]).toBe('2026-01-14');
      expect(keys[1]).toBe('2026-01-15');
      expect(keys[2]).toBe('2026-01-16');
    });

    it('retorna objeto vazio para array vazio', () => {
      const grouped = groupBetsByDay([]);
      expect(Object.keys(grouped).length).toBe(0);
    });
  });

  describe('formatBetListWithDays', () => {
    it('retorna mensagem padrao para lista vazia', () => {
      const result = formatBetListWithDays([], () => '');
      expect(result).toBe('Nenhuma aposta encontrada.');
    });

    it('retorna mensagem padrao para lista null', () => {
      const result = formatBetListWithDays(null, () => '');
      expect(result).toBe('Nenhuma aposta encontrada.');
    });

    it('formata apostas com headers de dia', () => {
      const today = new Date();
      const bets = [
        {
          id: 45,
          kickoffTime: today.toISOString(),
          homeTeamName: 'Liverpool',
          awayTeamName: 'Arsenal',
        },
      ];

      const formatFn = (bet) => `#${bet.id} ${bet.homeTeamName} vs ${bet.awayTeamName}`;
      const result = formatBetListWithDays(bets, formatFn);

      expect(result).toContain('━━━━ *HOJE');
      expect(result).toContain('#45 Liverpool vs Arsenal');
    });

    it('agrupa multiplos dias com separadores', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const bets = [
        { id: 1, kickoffTime: today.toISOString() },
        { id: 2, kickoffTime: tomorrow.toISOString() },
      ];

      const formatFn = (bet) => `#${bet.id}`;
      const result = formatBetListWithDays(bets, formatFn);

      expect(result).toContain('HOJE');
      expect(result).toContain('AMANHÃ');
      expect(result).toContain('#1');
      expect(result).toContain('#2');
    });

    it('preserva ordem dos grupos por data', () => {
      const date1 = new Date('2026-01-14T10:00:00Z');
      const date2 = new Date('2026-01-15T10:00:00Z');

      const bets = [
        { id: 2, kickoffTime: date2.toISOString() },
        { id: 1, kickoffTime: date1.toISOString() },
      ];

      const formatFn = (bet) => `#${bet.id}`;
      const result = formatBetListWithDays(bets, formatFn);

      // 14/01 should appear before 15/01
      const idx1 = result.indexOf('#1');
      const idx2 = result.indexOf('#2');
      expect(idx1).toBeLessThan(idx2);
    });
  });

  // Story 14.6: Pagination tests
  describe('paginateResults', () => {
    it('retorna primeira pagina corretamente', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const result = paginateResults(items, 1, 10);

      expect(result.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result.currentPage).toBe(1);
      expect(result.totalPages).toBe(2);
      expect(result.totalItems).toBe(12);
    });

    it('retorna segunda pagina corretamente', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const result = paginateResults(items, 2, 10);

      expect(result.items).toEqual([11, 12]);
      expect(result.currentPage).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('limita pagina ao maximo quando excede (AC6)', () => {
      const items = [1, 2, 3, 4, 5];
      const result = paginateResults(items, 999, 10);

      expect(result.currentPage).toBe(1);
      expect(result.items).toEqual([1, 2, 3, 4, 5]);
    });

    it('limita pagina ao minimo quando menor que 1 (AC6)', () => {
      const items = [1, 2, 3, 4, 5];
      const result = paginateResults(items, 0, 10);

      expect(result.currentPage).toBe(1);
    });

    it('retorna array vazio para lista vazia', () => {
      const result = paginateResults([], 1, 10);

      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(1);
      expect(result.totalItems).toBe(0);
    });

    it('usa pageSize padrao de 10', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1);
      const result = paginateResults(items, 1);

      expect(result.items.length).toBe(10);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('formatPaginationFooter', () => {
    it('retorna total simples quando apenas 1 pagina', () => {
      const pagination = { currentPage: 1, totalPages: 1, totalItems: 5 };
      const result = formatPaginationFooter(pagination, '/filtrar');

      expect(result).toBe('📊 Total: 5 apostas');
    });

    it('retorna footer completo com navegacao', () => {
      const pagination = { currentPage: 1, totalPages: 3, totalItems: 25 };
      const result = formatPaginationFooter(pagination, '/filtrar sem_link');

      expect(result).toContain('Pagina 1 de 3');
      expect(result).toContain('Total: 25');
      expect(result).toContain('/filtrar sem_link 2');
    });

    it('nao mostra proxima pagina na ultima pagina', () => {
      const pagination = { currentPage: 3, totalPages: 3, totalItems: 25 };
      const result = formatPaginationFooter(pagination, '/fila');

      expect(result).toContain('Pagina 3 de 3');
      expect(result).not.toContain('proxima pagina');
    });
  });
});

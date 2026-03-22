/**
 * Unit tests for the calculator computation logic in agent/tools.js
 * Tests all operations, edge cases, and Zod validation.
 */

const { calculatorSchema, computeCalculation } = require('../../agent/tools');

const compute = (args) => computeCalculation(args);

describe('calculator tool - computeCalculation', () => {
  describe('average', () => {
    test('calcula média corretamente', () => {
      const res = compute({ operation: 'average', values: [4, 3, 5, 2, 6] });
      expect(res.result).toBe(4);
      expect(res.values_count).toBe(5);
      expect(res.detail).toBe('Média de 5 valores');
    });

    test('média com um único valor', () => {
      const res = compute({ operation: 'average', values: [7] });
      expect(res.result).toBe(7);
    });

    test('média arredonda para 2 casas decimais', () => {
      const res = compute({ operation: 'average', values: [1, 1, 2] });
      expect(res.result).toBe(1.33);
    });
  });

  describe('sum', () => {
    test('soma simples', () => {
      const res = compute({ operation: 'sum', values: [1, 2, 3, 4, 5] });
      expect(res.result).toBe(15);
    });

    test('soma com decimais', () => {
      const res = compute({ operation: 'sum', values: [1.5, 2.3, 0.7] });
      expect(res.result).toBe(4.5);
    });
  });

  describe('percentage_over', () => {
    test('calcula porcentagem >= threshold', () => {
      const res = compute({
        operation: 'percentage_over',
        values: [4, 3, 5, 2, 6, 3, 4, 5, 3, 4],
        threshold: 3.5,
      });
      // 4,5,6,4,5,4 = 6 de 10 >= 3.5
      expect(res.result).toBe(60);
      expect(res.detail).toBe('6 de 10 valores >= 3.5');
    });

    test('valores exatamente iguais ao threshold contam como over (>=)', () => {
      const res = compute({
        operation: 'percentage_over',
        values: [3, 3, 3],
        threshold: 3,
      });
      expect(res.result).toBe(100);
    });

    test('nenhum valor >= threshold', () => {
      const res = compute({
        operation: 'percentage_over',
        values: [1, 2, 1],
        threshold: 5,
      });
      expect(res.result).toBe(0);
    });

    test('retorna erro quando threshold ausente', () => {
      const res = compute({ operation: 'percentage_over', values: [1, 2, 3] });
      expect(res.error).toBeDefined();
    });
  });

  describe('percentage_under', () => {
    test('calcula porcentagem <= threshold', () => {
      const res = compute({
        operation: 'percentage_under',
        values: [1, 2, 3, 4, 5],
        threshold: 2.5,
      });
      // 1, 2 = 2 de 5 <= 2.5
      expect(res.result).toBe(40);
    });

    test('valores exatamente iguais ao threshold contam como under (<=)', () => {
      const res = compute({
        operation: 'percentage_under',
        values: [3, 3, 3],
        threshold: 3,
      });
      expect(res.result).toBe(100);
    });

    test('retorna erro quando threshold ausente', () => {
      const res = compute({ operation: 'percentage_under', values: [1, 2, 3] });
      expect(res.error).toBeDefined();
    });
  });

  describe('count', () => {
    test('conta elementos', () => {
      const res = compute({ operation: 'count', values: [1, 2, 3, 4] });
      expect(res.result).toBe(4);
    });
  });

  describe('min', () => {
    test('encontra menor valor', () => {
      const res = compute({ operation: 'min', values: [5, 3, 8, 1, 9] });
      expect(res.result).toBe(1);
    });

    test('um único valor', () => {
      const res = compute({ operation: 'min', values: [42] });
      expect(res.result).toBe(42);
    });

    test('com valores negativos', () => {
      const res = compute({ operation: 'min', values: [-3, 0, 5, -7] });
      expect(res.result).toBe(-7);
    });
  });

  describe('max', () => {
    test('encontra maior valor', () => {
      const res = compute({ operation: 'max', values: [5, 3, 8, 1, 9] });
      expect(res.result).toBe(9);
    });

    test('com valores iguais', () => {
      const res = compute({ operation: 'max', values: [4, 4, 4] });
      expect(res.result).toBe(4);
    });
  });

  describe('median', () => {
    test('mediana com número ímpar de valores', () => {
      const res = compute({ operation: 'median', values: [3, 1, 5, 2, 4] });
      expect(res.result).toBe(3);
    });

    test('mediana com número par de valores', () => {
      const res = compute({ operation: 'median', values: [1, 2, 3, 4] });
      expect(res.result).toBe(2.5);
    });

    test('mediana com um único valor', () => {
      const res = compute({ operation: 'median', values: [7] });
      expect(res.result).toBe(7);
    });
  });

  describe('label e threshold opcionais', () => {
    test('inclui label quando fornecido', () => {
      const res = compute({
        operation: 'average',
        values: [1, 2, 3],
        label: 'cartões últimos 10',
      });
      expect(res.label).toBe('cartões últimos 10');
    });

    test('inclui label vazio quando fornecido como string vazia', () => {
      const res = compute({
        operation: 'average',
        values: [1, 2, 3],
        label: '',
      });
      expect(res).toHaveProperty('label');
      expect(res.label).toBe('');
    });

    test('não inclui label quando não fornecido', () => {
      const res = compute({ operation: 'average', values: [1, 2, 3] });
      expect(res).not.toHaveProperty('label');
    });

    test('inclui threshold no response quando fornecido', () => {
      const res = compute({
        operation: 'percentage_over',
        values: [1, 2, 3, 4, 5],
        threshold: 3,
      });
      expect(res.threshold).toBe(3);
    });

    test('não inclui threshold no response para operações sem threshold', () => {
      const res = compute({ operation: 'average', values: [1, 2, 3] });
      expect(res).not.toHaveProperty('threshold');
    });
  });

  describe('validação Zod (calculatorSchema)', () => {
    test('rejeita array vazio', () => {
      expect(() => calculatorSchema.parse({ operation: 'average', values: [] })).toThrow();
    });

    test('rejeita operação inválida', () => {
      expect(() => calculatorSchema.parse({ operation: 'sqrt', values: [4] })).toThrow();
    });

    test('rejeita array acima de 1000 elementos', () => {
      const bigArray = Array.from({ length: 1001 }, (_, i) => i);
      expect(() => calculatorSchema.parse({ operation: 'sum', values: bigArray })).toThrow();
    });

    test('aceita array com 1000 elementos', () => {
      const arr = Array.from({ length: 1000 }, (_, i) => i);
      expect(() => calculatorSchema.parse({ operation: 'sum', values: arr })).not.toThrow();
    });

    test('aceita operação válida', () => {
      const parsed = calculatorSchema.parse({ operation: 'average', values: [1, 2, 3] });
      expect(parsed.operation).toBe('average');
    });
  });
});

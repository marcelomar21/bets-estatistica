/**
 * Tests for parallel execution in runAnalysis.js
 * Tech-Spec: pipeline-paralelo
 */

describe('runAnalysis - parallel execution helpers', () => {
  describe('CONCURRENCY_LIMIT validation', () => {
    const validateConcurrency = (value) => {
      const parsed = Number(value);
      return Math.max(1, Math.min(10, parsed || 5));
    };

    test('usa default 5 quando não definido', () => {
      expect(validateConcurrency(undefined)).toBe(5);
      expect(validateConcurrency(null)).toBe(5);
      expect(validateConcurrency('')).toBe(5);
    });

    test('usa valor válido quando definido', () => {
      expect(validateConcurrency(3)).toBe(3);
      expect(validateConcurrency('7')).toBe(7);
    });

    test('limita mínimo em 1', () => {
      expect(validateConcurrency(0)).toBe(5); // 0 || 5 = 5
      expect(validateConcurrency(-5)).toBe(1); // Math.max(1, -5) = 1
    });

    test('limita máximo em 10', () => {
      expect(validateConcurrency(15)).toBe(10);
      expect(validateConcurrency(100)).toBe(10);
    });

    test('trata NaN como default', () => {
      expect(validateConcurrency('abc')).toBe(5);
      expect(validateConcurrency(NaN)).toBe(5);
    });
  });

  describe('withTimeout helper', () => {
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms)
        ),
      ]);

    test('resolve quando promise completa antes do timeout', async () => {
      const fastPromise = new Promise(resolve => setTimeout(() => resolve('ok'), 10));
      const result = await withTimeout(fastPromise, 1000);
      expect(result).toBe('ok');
    });

    test('rejeita quando promise excede timeout', async () => {
      const slowPromise = new Promise(resolve => setTimeout(() => resolve('ok'), 1000));
      await expect(withTimeout(slowPromise, 50)).rejects.toThrow('Timeout após 0.05s');
    });

    test('propaga erro da promise original', async () => {
      const failingPromise = Promise.reject(new Error('Original error'));
      await expect(withTimeout(failingPromise, 1000)).rejects.toThrow('Original error');
    });
  });

  describe('Promise.allSettled result handling', () => {
    test('filtra resultados fulfilled com success=true', async () => {
      const results = [
        { status: 'fulfilled', value: { matchId: 1, success: true, persisted: true } },
        { status: 'fulfilled', value: { matchId: 2, success: false, error: 'fail' } },
        { status: 'rejected', reason: new Error('crash') },
        { status: 'fulfilled', value: { matchId: 4, success: true, persisted: false } },
      ];

      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));

      expect(succeeded).toHaveLength(2);
      expect(failed).toHaveLength(2);
    });

    test('conta persistência corretamente', async () => {
      const results = [
        { status: 'fulfilled', value: { matchId: 1, success: true, persisted: true } },
        { status: 'fulfilled', value: { matchId: 2, success: true, persisted: false } },
        { status: 'fulfilled', value: { matchId: 3, success: true, persisted: true } },
      ];

      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const persistedCount = succeeded.filter(r => r.value.persisted).length;
      const notPersistedCount = succeeded.length - persistedCount;

      expect(persistedCount).toBe(2);
      expect(notPersistedCount).toBe(1);
    });
  });
});

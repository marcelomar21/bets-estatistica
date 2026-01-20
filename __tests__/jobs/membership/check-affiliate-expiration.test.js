/**
 * Tests for check-affiliate-expiration job
 * Story 18.2: Lógica de Expiração de Atribuição
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../../bot/services/memberService', () => ({
  clearExpiredAffiliates: jest.fn()
}));

const { runCheckAffiliateExpiration } = require('../../../bot/jobs/membership/check-affiliate-expiration');
const { clearExpiredAffiliates } = require('../../../bot/services/memberService');
const logger = require('../../../lib/logger');

describe('check-affiliate-expiration job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('executa job com sucesso quando há afiliados expirados', async () => {
    clearExpiredAffiliates.mockResolvedValue({
      success: true,
      data: { cleared: 5 }
    });

    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(true);
    expect(result.data.cleared).toBe(5);
    expect(result.data.duration).toBeDefined();
    expect(clearExpiredAffiliates).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      '[membership:check-affiliate-expiration] Starting job'
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[membership:check-affiliate-expiration] Job completed',
      expect.objectContaining({ cleared: 5 })
    );
  });

  test('executa job com sucesso quando não há afiliados expirados', async () => {
    clearExpiredAffiliates.mockResolvedValue({
      success: true,
      data: { cleared: 0 }
    });

    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(true);
    expect(result.data.cleared).toBe(0);
    expect(clearExpiredAffiliates).toHaveBeenCalledTimes(1);
  });

  test('retorna erro quando clearExpiredAffiliates falha', async () => {
    clearExpiredAffiliates.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'Database connection failed' }
    });

    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DB_ERROR');
    expect(logger.error).toHaveBeenCalledWith(
      '[membership:check-affiliate-expiration] Job failed',
      expect.objectContaining({ error: expect.any(Object) })
    );
  });

  test('captura exceções inesperadas', async () => {
    clearExpiredAffiliates.mockRejectedValue(new Error('Unexpected error'));

    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('UNEXPECTED_ERROR');
    expect(result.error.message).toBe('Unexpected error');
    expect(logger.error).toHaveBeenCalledWith(
      '[membership:check-affiliate-expiration] Unexpected error',
      expect.objectContaining({ error: 'Unexpected error' })
    );
  });

  test('previne execução concorrente com lock in-memory', async () => {
    // First call - takes time
    let resolveFirst;
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    clearExpiredAffiliates.mockImplementationOnce(() => firstPromise);

    // Start first execution (don't await)
    const firstExecution = runCheckAffiliateExpiration();

    // Small delay to ensure first execution starts
    await new Promise(resolve => setTimeout(resolve, 10));

    // Second call should be blocked
    const secondResult = await runCheckAffiliateExpiration();

    expect(secondResult.success).toBe(false);
    expect(secondResult.error.code).toBe('JOB_ALREADY_RUNNING');
    expect(logger.warn).toHaveBeenCalledWith(
      '[membership:check-affiliate-expiration] Job already running, skipping'
    );

    // Resolve first execution
    resolveFirst({ success: true, data: { cleared: 1 } });
    const firstResult = await firstExecution;

    expect(firstResult.success).toBe(true);
  });

  test('libera lock após execução bem-sucedida', async () => {
    clearExpiredAffiliates.mockResolvedValue({
      success: true,
      data: { cleared: 2 }
    });

    // First execution
    await runCheckAffiliateExpiration();

    // Second execution should work (lock released)
    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(true);
    expect(clearExpiredAffiliates).toHaveBeenCalledTimes(2);
  });

  test('libera lock após execução com erro', async () => {
    clearExpiredAffiliates.mockResolvedValueOnce({
      success: false,
      error: { code: 'DB_ERROR', message: 'First failed' }
    });

    clearExpiredAffiliates.mockResolvedValueOnce({
      success: true,
      data: { cleared: 1 }
    });

    // First execution (fails)
    await runCheckAffiliateExpiration();

    // Second execution should work (lock released)
    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(true);
    expect(clearExpiredAffiliates).toHaveBeenCalledTimes(2);
  });

  test('libera lock após exceção', async () => {
    clearExpiredAffiliates.mockRejectedValueOnce(new Error('Exception'));

    clearExpiredAffiliates.mockResolvedValueOnce({
      success: true,
      data: { cleared: 1 }
    });

    // First execution (throws)
    await runCheckAffiliateExpiration();

    // Second execution should work (lock released)
    const result = await runCheckAffiliateExpiration();

    expect(result.success).toBe(true);
    expect(clearExpiredAffiliates).toHaveBeenCalledTimes(2);
  });
});

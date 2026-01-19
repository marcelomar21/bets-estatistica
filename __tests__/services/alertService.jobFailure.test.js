/**
 * Tests for jobFailureAlert in alertService.js
 * Tech-Spec: automacao-monitoramento-jobs
 */

// Mock telegram before importing
jest.mock('../../bot/telegram', () => ({
  alertAdmin: jest.fn().mockResolvedValue({ success: true }),
  sendToAdmin: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { jobFailureAlert } = require('../../bot/services/alertService');
const { sendToAdmin } = require('../../bot/telegram');
const logger = require('../../lib/logger');

describe('alertService - jobFailureAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset debounce cache by waiting or mocking time
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('envia alerta para job que falhou', async () => {
    // First call should send
    const result = await jobFailureAlert('test-job-1', 'Connection timeout', 'exec-123');

    expect(result.success).toBe(true);
    expect(sendToAdmin).toHaveBeenCalledWith(expect.stringContaining('JOB FAILED'));
    expect(sendToAdmin).toHaveBeenCalledWith(expect.stringContaining('test-job-1'));
    expect(sendToAdmin).toHaveBeenCalledWith(expect.stringContaining('Connection timeout'));
    expect(sendToAdmin).toHaveBeenCalledWith(expect.stringContaining('exec-123'));
  });

  test('aplica debounce para mesmo job em menos de 60 minutos', async () => {
    // First call
    await jobFailureAlert('debounce-test-job', 'Error 1', 'exec-1');
    expect(sendToAdmin).toHaveBeenCalledTimes(1);

    // Second call immediately - should be debounced
    const result = await jobFailureAlert('debounce-test-job', 'Error 2', 'exec-2');

    expect(result.debounced).toBe(true);
    expect(sendToAdmin).toHaveBeenCalledTimes(1); // Still 1
    expect(logger.info).toHaveBeenCalledWith(
      '[alertService] Job failure alert debounced',
      expect.objectContaining({ jobName: 'debounce-test-job' })
    );
  });

  test('diferentes jobs nao compartilham debounce', async () => {
    await jobFailureAlert('job-a', 'Error', 'exec-1');
    await jobFailureAlert('job-b', 'Error', 'exec-2');

    expect(sendToAdmin).toHaveBeenCalledTimes(2);
  });

  test('envia alerta após debounce expirar (60 min)', async () => {
    // First call
    await jobFailureAlert('expire-test-job', 'Error 1', 'exec-1');
    expect(sendToAdmin).toHaveBeenCalledTimes(1);

    // Advance time by 61 minutes
    jest.advanceTimersByTime(61 * 60 * 1000);

    // Second call after debounce expired
    await jobFailureAlert('expire-test-job', 'Error 2', 'exec-2');
    expect(sendToAdmin).toHaveBeenCalledTimes(2);
  });

  test('funciona sem executionId', async () => {
    const result = await jobFailureAlert('no-id-job', 'Some error', null);

    expect(result.success).toBe(true);
    expect(sendToAdmin).toHaveBeenCalledWith(expect.stringContaining('N/A'));
  });
});

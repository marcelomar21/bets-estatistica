/**
 * Tests for jobExecutionService.js
 * Tech-Spec: automacao-monitoramento-jobs
 */

// Mock supabase before importing the service
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock alertService
jest.mock('../../bot/services/alertService', () => ({
  jobFailureAlert: jest.fn().mockResolvedValue({ success: true }),
}));

const { startExecution, finishExecution, withExecutionLogging } = require('../../bot/services/jobExecutionService');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { jobFailureAlert } = require('../../bot/services/alertService');

describe('jobExecutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startExecution', () => {
    test('cria registro de execução com sucesso', async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'exec-123' },
            error: null,
          }),
        }),
      });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const result = await startExecution('test-job');

      expect(result.success).toBe(true);
      expect(result.data.executionId).toBe('exec-123');
      expect(supabase.from).toHaveBeenCalledWith('job_executions');
      expect(mockInsert).toHaveBeenCalledWith({ job_name: 'test-job', status: 'running' });
    });

    test('retorna erro quando insert falha', async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const result = await startExecution('test-job');

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Database error');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('finishExecution', () => {
    test('atualiza registro com sucesso e calcula duração', async () => {
      const startedAt = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { started_at: startedAt },
            error: null,
          }),
        }),
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabase.from.mockImplementation((table) => {
        if (table === 'job_executions') {
          return {
            select: mockSelect,
            update: mockUpdate,
          };
        }
      });

      const result = await finishExecution('exec-123', 'success', { count: 5 });

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    test('loga warning quando fetch de started_at falha', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        }),
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabase.from.mockImplementation(() => ({
        select: mockSelect,
        update: mockUpdate,
      }));

      const result = await finishExecution('exec-123', 'success');

      expect(logger.warn).toHaveBeenCalledWith(
        '[jobExecutionService] Failed to fetch started_at for duration calculation',
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });
  });

  describe('withExecutionLogging', () => {
    test('executa job e registra sucesso', async () => {
      // Mock startExecution
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'exec-123' },
            error: null,
          }),
        }),
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { started_at: new Date().toISOString() },
            error: null,
          }),
        }),
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabase.from.mockImplementation(() => ({
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
      }));

      const jobFn = jest.fn().mockResolvedValue({ processed: 10 });

      const result = await withExecutionLogging('test-job', jobFn);

      expect(result).toEqual({ processed: 10 });
      expect(jobFn).toHaveBeenCalled();
    });

    test('envia alerta quando job falha', async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'exec-123' },
            error: null,
          }),
        }),
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { started_at: new Date().toISOString() },
            error: null,
          }),
        }),
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabase.from.mockImplementation(() => ({
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
      }));

      const jobFn = jest.fn().mockRejectedValue(new Error('Job failed'));

      await expect(withExecutionLogging('test-job', jobFn)).rejects.toThrow('Job failed');
      expect(jobFailureAlert).toHaveBeenCalledWith('test-job', 'Job failed', 'exec-123');
    });

    test('continua mesmo sem execution logging', async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Insert failed' },
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        insert: mockInsert,
      }));

      const jobFn = jest.fn().mockResolvedValue({ success: true });

      const result = await withExecutionLogging('test-job', jobFn);

      expect(result).toEqual({ success: true });
      expect(logger.warn).toHaveBeenCalledWith(
        '[jobExecutionService] Running job without execution logging',
        { jobName: 'test-job' }
      );
    });
  });
});

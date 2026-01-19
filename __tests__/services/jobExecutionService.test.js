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

const { startExecution, finishExecution, withExecutionLogging, getLatestExecutions, cleanupStuckJobs, formatResult, _resetCache } = require('../../bot/services/jobExecutionService');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { jobFailureAlert } = require('../../bot/services/alertService');

describe('jobExecutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCache();
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

  describe('formatResult', () => {
    test('retorna string vazia para result null', () => {
      expect(formatResult('pipeline', null)).toBe('');
    });

    test('retorna string vazia para result undefined', () => {
      expect(formatResult('pipeline', undefined)).toBe('');
    });

    test('retorna JSON para objeto vazio no job desconhecido', () => {
      expect(formatResult('unknown-job', {})).toBe('{}');
    });

    test('retorna ok para pipeline com objeto vazio', () => {
      expect(formatResult('pipeline', {})).toBe('ok');
    });

    test('formata pipeline com analysesGenerated', () => {
      expect(formatResult('pipeline', { analysesGenerated: 5 })).toBe('5 análises');
    });

    test('formata pipeline com stepsRun', () => {
      expect(formatResult('pipeline', { stepsRun: 3 })).toBe('3 steps');
    });

    test('formata pipeline com stepsRun e stepsSkipped', () => {
      expect(formatResult('pipeline', { stepsRun: 3, stepsSkipped: 2 })).toBe('3 steps, 2 skip');
    });

    test('formata pipeline com dryRun', () => {
      expect(formatResult('pipeline', { dryRun: true })).toBe('dry-run');
    });

    test('formata post-bets com posted e reposted', () => {
      expect(formatResult('post-bets', { posted: 2, reposted: 1 })).toBe('2 posted, 1 repost');
    });

    test('formata post-bets sem postagens', () => {
      expect(formatResult('post-bets', { posted: 0, reposted: 0 })).toBe('nenhuma');
    });

    test('formata track-results', () => {
      expect(formatResult('track-results', { tracked: 5, green: 3, red: 2 })).toBe('5 tracked (3G/2R)');
    });

    test('formata track-results vazio', () => {
      expect(formatResult('track-results', { tracked: 0 })).toBe('nenhum');
    });

    test('formata kick-expired', () => {
      expect(formatResult('kick-expired', { kicked: 2 })).toBe('2 kicked');
    });

    test('formata enrich-odds', () => {
      expect(formatResult('enrich-odds', { enriched: 4 })).toBe('4 enriched');
    });

    test('formata reminders', () => {
      expect(formatResult('reminders', { sent: 3 })).toBe('3 sent');
    });

    test('formata trial-reminders', () => {
      expect(formatResult('trial-reminders', { sent: 1 })).toBe('1 sent');
    });

    test('formata renewal-reminders', () => {
      expect(formatResult('renewal-reminders', { count: 2 })).toBe('2 sent');
    });

    test('formata reconciliation', () => {
      expect(formatResult('reconciliation', { reconciled: 10 })).toBe('10 reconciled');
    });

    test('formata request-links', () => {
      expect(formatResult('request-links', { requested: 5 })).toBe('5 requested');
    });

    test('formata healthCheck com warns', () => {
      expect(formatResult('healthCheck', { alerts: [1, 2] })).toBe('2 warns');
    });

    test('formata healthCheck ok', () => {
      expect(formatResult('healthCheck', { alerts: [] })).toBe('ok');
    });

    test('formata job desconhecido com count', () => {
      expect(formatResult('unknown-job', { count: 7 })).toBe('7 items');
    });

    test('formata job desconhecido com JSON truncado', () => {
      const longResult = { data: 'some very long string that exceeds 30 characters limit' };
      const result = formatResult('unknown-job', longResult);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('getLatestExecutions', () => {
    test('retorna lista vazia quando não há execuções', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        select: mockSelect,
      }));

      const result = await getLatestExecutions();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    test('retorna última execução de cada job', async () => {
      const mockData = [
        { id: '1', job_name: 'post-bets', started_at: '2026-01-19T10:00:00Z', status: 'success' },
        { id: '2', job_name: 'post-bets', started_at: '2026-01-19T08:00:00Z', status: 'success' },
        { id: '3', job_name: 'pipeline', started_at: '2026-01-19T09:00:00Z', status: 'success' },
      ];

      const mockSelect = jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: mockData,
            error: null,
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        select: mockSelect,
      }));

      const result = await getLatestExecutions();

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2); // post-bets and pipeline
      expect(result.data.find(e => e.job_name === 'post-bets').id).toBe('1'); // mais recente
    });

    test('retorna erro quando query falha', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        select: mockSelect,
      }));

      const result = await getLatestExecutions();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });

    test('usa cache quando chamado em sequência rápida', async () => {
      const mockData = [
        { id: '1', job_name: 'post-bets', started_at: '2026-01-19T10:00:00Z', status: 'success' },
      ];

      const mockSelect = jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: mockData,
            error: null,
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        select: mockSelect,
      }));

      // Primeira chamada - popula cache
      const result1 = await getLatestExecutions();
      expect(result1.success).toBe(true);

      // Segunda chamada - deve usar cache
      const result2 = await getLatestExecutions();
      expect(result2.success).toBe(true);
      expect(result2.fromCache).toBe(true);
    });
  });

  describe('cleanupStuckJobs', () => {
    test('não faz nada quando não há jobs stuck', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        update: mockUpdate,
      }));

      const result = await cleanupStuckJobs();

      expect(result.success).toBe(true);
      expect(result.data.cleaned).toBe(0);
    });

    test('marca jobs stuck como failed', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{ id: '1' }, { id: '2' }],
              error: null,
            }),
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        update: mockUpdate,
      }));

      const result = await cleanupStuckJobs();

      expect(result.success).toBe(true);
      expect(result.data.cleaned).toBe(2);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Timeout: job não finalizou',
        })
      );
    });

    test('retorna erro quando update falha', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Update failed' },
            }),
          }),
        }),
      });

      supabase.from.mockImplementation(() => ({
        update: mockUpdate,
      }));

      const result = await cleanupStuckJobs();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });
});

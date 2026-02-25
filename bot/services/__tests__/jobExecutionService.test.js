/**
 * Tests: jobExecutionService.js - Job execution logging
 * Story 1.1: Validates withExecutionLogging correctly records
 *   success/failure status and preserves jobResult on errors
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => {
  const mockInsert = jest.fn();
  const mockSelect = jest.fn();
  const mockUpdate = jest.fn();
  const mockEq = jest.fn();
  const mockSingle = jest.fn();
  const mockLt = jest.fn();

  const insertChain = { select: jest.fn(() => ({ single: mockSingle })) };
  const selectChain = { eq: jest.fn(() => ({ single: mockSingle })) };
  const updateChain = { eq: jest.fn(() => ({ select: jest.fn(() => ({})) })) };
  const updateLtChain = { eq: jest.fn(() => updateChain) };

  return {
    supabase: {
      from: jest.fn((table) => ({
        insert: jest.fn(() => insertChain),
        select: jest.fn(() => selectChain),
        update: jest.fn(() => ({ eq: jest.fn(() => ({})) })),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
    _mockSingle: mockSingle,
    _mockInsertChain: insertChain,
  };
});

jest.mock('../alertService', () => ({
  jobFailureAlert: jest.fn().mockResolvedValue(undefined),
}));

const { withExecutionLogging, startExecution, finishExecution, formatResult } = require('../jobExecutionService');
const { supabase, _mockSingle } = require('../../../lib/supabase');
const { jobFailureAlert } = require('../alertService');

describe('jobExecutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withExecutionLogging', () => {
    it('should record success when job function returns normally', async () => {
      // Mock startExecution to return an executionId
      const mockFrom = supabase.from;
      const mockExecutionId = 'exec-123';

      // Override for this test: make insert chain return executionId
      mockFrom.mockImplementation((table) => {
        if (table === 'job_executions') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: mockExecutionId },
                  error: null,
                }),
              })),
            })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { started_at: new Date().toISOString() },
                  error: null,
                }),
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ error: null }),
            })),
          };
        }
        return { insert: jest.fn(), select: jest.fn(), update: jest.fn() };
      });

      const jobResult = { posted: 3, skipped: 1 };
      const result = await withExecutionLogging('test-job', async () => jobResult);

      expect(result).toEqual(jobResult);
    });

    it('should record failed and preserve jobResult when job throws with jobResult', async () => {
      const mockExecutionId = 'exec-456';
      const mockFrom = supabase.from;

      let updatedStatus = null;
      let updatedResult = null;
      let updatedError = null;

      mockFrom.mockImplementation((table) => {
        if (table === 'job_executions') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: mockExecutionId },
                  error: null,
                }),
              })),
            })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { started_at: new Date().toISOString() },
                  error: null,
                }),
              })),
            })),
            update: jest.fn((updateData) => {
              updatedStatus = updateData.status;
              updatedResult = updateData.result;
              updatedError = updateData.error_message;
              return {
                eq: jest.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        return { insert: jest.fn(), select: jest.fn(), update: jest.fn() };
      });

      const jobResultData = { posted: 0, skipped: 2, totalSent: 0 };
      const err = new Error('Post bets failed: 0/2 bets sent');
      err.jobResult = jobResultData;

      await expect(
        withExecutionLogging('post-bets', async () => { throw err; })
      ).rejects.toThrow('Post bets failed');

      // Verify finishExecution was called with 'failed' and the jobResult
      expect(updatedStatus).toBe('failed');
      expect(updatedResult).toEqual(jobResultData);
      expect(updatedError).toBe('Post bets failed: 0/2 bets sent');
      expect(jobFailureAlert).toHaveBeenCalledWith('post-bets', err.message, mockExecutionId);
    });

    it('should record failed with null result when job throws without jobResult', async () => {
      const mockExecutionId = 'exec-789';
      const mockFrom = supabase.from;

      let updatedResult = 'NOT_SET';

      mockFrom.mockImplementation((table) => {
        if (table === 'job_executions') {
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: mockExecutionId },
                  error: null,
                }),
              })),
            })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { started_at: new Date().toISOString() },
                  error: null,
                }),
              })),
            })),
            update: jest.fn((updateData) => {
              updatedResult = updateData.result;
              return {
                eq: jest.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        return { insert: jest.fn(), select: jest.fn(), update: jest.fn() };
      });

      await expect(
        withExecutionLogging('test-job', async () => { throw new Error('Generic error'); })
      ).rejects.toThrow('Generic error');

      // Should pass null for result (no jobResult on error)
      expect(updatedResult).toBeNull();
    });
  });

  describe('formatResult', () => {
    it('should format post-bets result', () => {
      expect(formatResult('post-bets', { posted: 3, reposted: 2 })).toBe('3 posted, 2 repost');
    });

    it('should format post-bets result with sendFailed', () => {
      expect(formatResult('post-bets', { posted: 2, reposted: 1, sendFailed: 1 })).toBe('2 posted, 1 repost, 1 fail');
    });

    it('should format post-bets-manual result (same as post-bets)', () => {
      expect(formatResult('post-bets-manual', { posted: 1, reposted: 0 })).toBe('1 posted, 0 repost');
    });

    it('should show "N failed" for post-bets with only send failures', () => {
      expect(formatResult('post-bets', { posted: 0, reposted: 0, sendFailed: 3 })).toBe('3 failed');
    });

    it('should show "nenhuma" for post-bets with 0 posted', () => {
      expect(formatResult('post-bets', { posted: 0, reposted: 0 })).toBe('nenhuma');
    });

    it('should return empty string for null result', () => {
      expect(formatResult('post-bets', null)).toBe('');
    });

    it('should format kick-expired result', () => {
      expect(formatResult('kick-expired', { kicked: 5 })).toBe('5 kicked');
    });

    it('should format healthCheck result with alerts', () => {
      expect(formatResult('healthCheck', { alerts: [1, 2] })).toBe('2 warns');
    });

    it('should format healthCheck result without alerts', () => {
      expect(formatResult('healthCheck', { alerts: [] })).toBe('ok');
    });
  });
});

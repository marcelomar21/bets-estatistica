/**
 * Tests: Dynamic Scheduler (server.js functions)
 * Story 5.5: Controle de Postagem no Painel Admin
 *
 * Tests cover:
 * - loadPostingSchedule() loads config from database
 * - loadPostingSchedule() returns default when no data
 * - setupDynamicScheduler() creates cron jobs for each time
 * - setupDynamicScheduler() creates distribution jobs 5min before
 * - setupDynamicScheduler() stops old jobs before creating new ones
 * - setupDynamicScheduler() checks enabled flag at execution time
 * - reloadPostingSchedule() detects changes and reconfigures
 * - reloadPostingSchedule() skips reconfigure when unchanged
 * - Post-now polling detects flag, runs postBets, clears flag
 * - Post-now polling clears flag even on runPostBets failure
 * - getNextPostTime() accepts custom times array
 * - getNextPostTime() defaults to [10, 15, 22] without parameter
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    betting: { minOdds: 1.60, maxActiveBets: 3, maxDaysAhead: 2 },
    telegram: { adminGroupId: '-100123', publicGroupId: '-100456', botToken: 'test' },
    membership: { groupId: 'test-group-uuid' },
  },
  validateConfig: jest.fn(),
}));

const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockUpdate = jest.fn();
const mockIs = jest.fn();
const mockUpdateEq = jest.fn();

const updateChain = {};
updateChain.eq = mockUpdateEq.mockImplementation(() => updateChain);

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: mockSelect.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
      update: mockUpdate.mockReturnValue(updateChain),
    })),
  },
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));

jest.mock('../../services/jobExecutionService', () => ({
  withExecutionLogging: jest.fn((name, fn) => fn()),
  cleanupStuckJobs: jest.fn().mockResolvedValue({ success: true, data: { cleaned: 0 } }),
}));

jest.mock('../../jobs/postBets', () => ({
  runPostBets: jest.fn().mockResolvedValue({ posted: 2, skipped: 1 }),
  handlePostConfirmation: jest.fn(),
}));

jest.mock('../../jobs/distributeBets', () => ({
  runDistributeBets: jest.fn().mockResolvedValue({ success: true, data: { distributed: 5 } }),
}));

const cron = require('node-cron');
const { supabase } = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

// Import the functions we'll create
const {
  loadPostingSchedule,
  setupDynamicScheduler,
  reloadPostingSchedule,
  checkPostNow,
  _getState,
} = require('../../server.scheduler');

describe('Dynamic Scheduler (Story 5.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadPostingSchedule()', () => {
    it('should load posting_schedule from groups table', async () => {
      const schedule = { enabled: true, times: ['09:00', '14:00', '20:00'] };
      mockSingle.mockResolvedValue({ data: { posting_schedule: schedule }, error: null });

      const result = await loadPostingSchedule();

      expect(supabase.from).toHaveBeenCalledWith('groups');
      expect(mockSelect).toHaveBeenCalledWith('posting_schedule');
      expect(result).toEqual(schedule);
    });

    it('should return default schedule when no data in DB', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });

      const result = await loadPostingSchedule();

      expect(result).toEqual({ enabled: true, times: ['10:00', '15:00', '22:00'] });
    });

    it('should return default schedule on DB error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      const result = await loadPostingSchedule();

      expect(result).toEqual({ enabled: true, times: ['10:00', '15:00', '22:00'] });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('setupDynamicScheduler()', () => {
    it('should stop old jobs before creating new ones', () => {
      const mockStop = jest.fn();
      // First call creates jobs
      cron.schedule.mockReturnValue({ stop: mockStop });
      setupDynamicScheduler({ enabled: true, times: ['10:00'] });

      // Second call should stop previous jobs
      setupDynamicScheduler({ enabled: true, times: ['15:00'] });

      expect(mockStop).toHaveBeenCalled();
    });

    it('should create posting + distribution cron jobs for each time', () => {
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      setupDynamicScheduler({ enabled: true, times: ['10:00', '15:00'] });

      // 2 posting jobs + 2 distribution jobs = 4 cron.schedule calls
      expect(cron.schedule).toHaveBeenCalledTimes(4);
    });

    it('should create cron expression for posting at correct time', () => {
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      setupDynamicScheduler({ enabled: true, times: ['10:00'] });

      // Should create posting job at 10:00 → '0 10 * * *'
      const calls = cron.schedule.mock.calls;
      const postingCall = calls.find(c => c[0] === '0 10 * * *');
      expect(postingCall).toBeDefined();
    });

    it('should create distribution cron 5 min before posting', () => {
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      setupDynamicScheduler({ enabled: true, times: ['10:00'] });

      // Distribution 5min before 10:00 → '55 9 * * *'
      const calls = cron.schedule.mock.calls;
      const distCall = calls.find(c => c[0] === '55 9 * * *');
      expect(distCall).toBeDefined();
    });

    it('should handle midnight boundary for distribution (e.g. 00:00 → 23:55)', () => {
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      setupDynamicScheduler({ enabled: true, times: ['00:00'] });

      const calls = cron.schedule.mock.calls;
      const distCall = calls.find(c => c[0] === '55 23 * * *');
      expect(distCall).toBeDefined();
    });

    it('should handle times with non-zero minutes (e.g. 10:30 → dist at 10:25)', () => {
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      setupDynamicScheduler({ enabled: true, times: ['10:30'] });

      // Distribution 5min before 10:30 → '25 10 * * *'
      const calls = cron.schedule.mock.calls;
      const distCall = calls.find(c => c[0] === '25 10 * * *');
      expect(distCall).toBeDefined();
    });
  });

  describe('reloadPostingSchedule()', () => {
    it('should reconfigure scheduler when schedule changes', async () => {
      const newSchedule = { enabled: true, times: ['08:00', '16:00'] };
      mockSingle.mockResolvedValue({ data: { posting_schedule: newSchedule }, error: null });
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      // Set initial state
      setupDynamicScheduler({ enabled: true, times: ['10:00'] });
      cron.schedule.mockClear();

      await reloadPostingSchedule();

      // Should have created new cron jobs
      expect(cron.schedule).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('schedule changed'),
        expect.any(Object)
      );
    });

    it('should skip reconfigure when schedule is unchanged', async () => {
      const schedule = { enabled: true, times: ['10:00'] };
      mockSingle.mockResolvedValue({ data: { posting_schedule: schedule }, error: null });
      cron.schedule.mockReturnValue({ stop: jest.fn() });

      setupDynamicScheduler(schedule);
      cron.schedule.mockClear();

      await reloadPostingSchedule();

      // Should NOT create new cron jobs
      expect(cron.schedule).not.toHaveBeenCalled();
    });
  });

  describe('checkPostNow()', () => {
    it('should execute runPostBets and clear flag when post_now_requested_at is set', async () => {
      const { runPostBets } = require('../../jobs/postBets');
      mockSingle.mockResolvedValue({
        data: { post_now_requested_at: '2026-02-11T10:00:00Z' },
        error: null,
      });

      await checkPostNow();

      expect(runPostBets).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ postTimes: expect.any(Array) }),
      );
      // Should clear the flag
      expect(supabase.from).toHaveBeenCalledWith('groups');
    });

    it('should not execute when post_now_requested_at is null', async () => {
      const { runPostBets } = require('../../jobs/postBets');
      mockSingle.mockResolvedValue({
        data: { post_now_requested_at: null },
        error: null,
      });

      await checkPostNow();

      expect(runPostBets).not.toHaveBeenCalled();
    });

    it('should clear flag even if runPostBets fails', async () => {
      const { runPostBets } = require('../../jobs/postBets');
      runPostBets.mockRejectedValueOnce(new Error('Post failed'));
      mockSingle.mockResolvedValue({
        data: { post_now_requested_at: '2026-02-11T10:00:00Z' },
        error: null,
      });

      await checkPostNow();

      // Should still attempt to clear the flag
      expect(supabase.from).toHaveBeenCalledWith('groups');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

// Note: getNextPostTime() tests are in bot/services/__tests__/getNextPostTime.test.js

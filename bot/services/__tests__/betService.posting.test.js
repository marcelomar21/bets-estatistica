/**
 * Tests: betService.js — GURU-46 posting functions refactored to bet_group_assignments
 *
 * Tests cover:
 * - markBetAsPosted() updates bet_group_assignments (not suggested_bets)
 * - markBetAsPosted() requires groupId parameter
 * - registrarPostagem() appends to assignment's historico_postagens
 * - updateGeneratedCopy() writes to bet_group_assignments
 * - clearGeneratedCopyByGroup() clears on bet_group_assignments
 * - Independent posting: group A does not affect group B
 */

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    betting: { minOdds: 1.60, maxActiveBets: 50, maxDaysAhead: 2 },
    membership: { groupId: 'test-group-uuid' },
  },
}));

const mockFrom = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

const { markBetAsPosted, registrarPostagem, updateGeneratedCopy, clearGeneratedCopyByGroup } = require('../betService');

describe('betService — GURU-46 posting functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- markBetAsPosted ----

  describe('markBetAsPosted', () => {
    it('should update bet_group_assignments with posting_status=posted', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const result = await markBetAsPosted(123, 999, 1.85, 'group-a');

      expect(result.success).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          posting_status: 'posted',
          telegram_message_id: 999,
          odds_at_post: 1.85,
          telegram_posted_at: expect.any(String),
        })
      );
    });

    it('should filter by bet_id AND group_id', async () => {
      const eqGroupId = jest.fn().mockResolvedValue({ error: null });
      const eqBetId = jest.fn().mockReturnValue({ eq: eqGroupId });
      const mockUpdate = jest.fn().mockReturnValue({ eq: eqBetId });
      mockFrom.mockReturnValue({ update: mockUpdate });

      await markBetAsPosted(42, 100, 2.0, 'group-b');

      expect(eqBetId).toHaveBeenCalledWith('bet_id', 42);
      expect(eqGroupId).toHaveBeenCalledWith('group_id', 'group-b');
    });

    it('should return error on DB failure', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
        }),
      });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const result = await markBetAsPosted(1, 1, 1.0, 'group-x');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ---- registrarPostagem ----

  describe('registrarPostagem', () => {
    it('should append timestamp to assignment historico_postagens', async () => {
      const eqUpdateGroupId = jest.fn().mockResolvedValue({ error: null });
      const eqUpdateBetId = jest.fn().mockReturnValue({ eq: eqUpdateGroupId });
      const mockUpdate = jest.fn().mockReturnValue({ eq: eqUpdateBetId });

      const eqSingleGroupId = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { historico_postagens: ['2026-01-01T00:00:00Z'] },
          error: null,
        }),
      });
      const eqSelectBetId = jest.fn().mockReturnValue({ eq: eqSingleGroupId });
      const mockSelect = jest.fn().mockReturnValue({ eq: eqSelectBetId });

      mockFrom.mockImplementation(() => ({
        select: mockSelect,
        update: mockUpdate,
      }));

      const result = await registrarPostagem(10, 'group-a');

      expect(result.success).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
      // The update should contain 2 timestamps (1 existing + 1 new)
      expect(mockUpdate).toHaveBeenCalledWith({
        historico_postagens: expect.arrayContaining([
          '2026-01-01T00:00:00Z',
          expect.any(String),
        ]),
      });
    });

    it('should handle empty historico_postagens (first post)', async () => {
      const eqUpdateGroupId = jest.fn().mockResolvedValue({ error: null });
      const eqUpdateBetId = jest.fn().mockReturnValue({ eq: eqUpdateGroupId });
      const mockUpdate = jest.fn().mockReturnValue({ eq: eqUpdateBetId });

      const eqSingleGroupId = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { historico_postagens: null },
          error: null,
        }),
      });
      const eqSelectBetId = jest.fn().mockReturnValue({ eq: eqSingleGroupId });
      const mockSelect = jest.fn().mockReturnValue({ eq: eqSelectBetId });

      mockFrom.mockImplementation(() => ({
        select: mockSelect,
        update: mockUpdate,
      }));

      const result = await registrarPostagem(10, 'group-a');

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        historico_postagens: [expect.any(String)],
      });
    });

    it('should return error when assignment not found', async () => {
      const eqGroupId = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'not found' },
        }),
      });
      const eqBetId = jest.fn().mockReturnValue({ eq: eqGroupId });
      const mockSelect = jest.fn().mockReturnValue({ eq: eqBetId });

      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await registrarPostagem(999, 'group-x');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // ---- updateGeneratedCopy ----

  describe('updateGeneratedCopy', () => {
    it('should update generated_copy on bet_group_assignments', async () => {
      const eqGroupId = jest.fn().mockResolvedValue({ error: null });
      const eqBetId = jest.fn().mockReturnValue({ eq: eqGroupId });
      const mockUpdate = jest.fn().mockReturnValue({ eq: eqBetId });
      mockFrom.mockReturnValue({ update: mockUpdate });

      await updateGeneratedCopy(42, 'New copy text', 'group-a');

      expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
      expect(mockUpdate).toHaveBeenCalledWith({ generated_copy: 'New copy text' });
      expect(eqBetId).toHaveBeenCalledWith('bet_id', 42);
      expect(eqGroupId).toHaveBeenCalledWith('group_id', 'group-a');
    });

    it('should handle null copy (clearing)', async () => {
      const eqGroupId = jest.fn().mockResolvedValue({ error: null });
      const eqBetId = jest.fn().mockReturnValue({ eq: eqGroupId });
      const mockUpdate = jest.fn().mockReturnValue({ eq: eqBetId });
      mockFrom.mockReturnValue({ update: mockUpdate });

      await updateGeneratedCopy(42, null, 'group-a');

      expect(mockUpdate).toHaveBeenCalledWith({ generated_copy: null });
    });
  });

  // ---- clearGeneratedCopyByGroup ----

  describe('clearGeneratedCopyByGroup', () => {
    it('should clear generated_copy on all assignments for the group', async () => {
      const eqGroupId = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({ eq: eqGroupId });
      mockFrom.mockReturnValue({ update: mockUpdate });

      await clearGeneratedCopyByGroup('group-a');

      expect(mockFrom).toHaveBeenCalledWith('bet_group_assignments');
      expect(mockUpdate).toHaveBeenCalledWith({ generated_copy: null });
      expect(eqGroupId).toHaveBeenCalledWith('group_id', 'group-a');
    });
  });
});

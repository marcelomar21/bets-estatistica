/**
 * Tests for memberService.js
 * Story 16.1: Criar Infraestrutura de Membros e State Machine
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

const {
  MEMBER_STATUSES,
  VALID_TRANSITIONS,
  canTransition,
  getMemberById,
  getMemberByTelegramId,
  updateMemberStatus,
  createTrialMember,
  getTrialDaysRemaining,
  canRejoinGroup,
  reactivateMember,
  // Story 16.7: Statistics functions
  getMemberStats,
  calculateMRR,
  calculateConversionRate,
  getNewMembersThisWeek,
  // Story 16.7: CRUD functions for manual management
  getMemberDetails,
  getNotificationHistory,
  addManualTrialMember,
  extendMembership,
  appendToNotes,
  // Story 16.8: Reconciliation
  getMembersForReconciliation,
} = require('../../bot/services/memberService');
const { supabase } = require('../../lib/supabase');

describe('memberService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // CONSTANTS
  // ============================================
  describe('MEMBER_STATUSES', () => {
    test('contém todos os status válidos', () => {
      expect(MEMBER_STATUSES).toEqual(['trial', 'ativo', 'inadimplente', 'removido']);
    });
  });

  describe('VALID_TRANSITIONS', () => {
    test('trial pode ir para ativo ou removido', () => {
      expect(VALID_TRANSITIONS.trial).toEqual(['ativo', 'removido']);
    });

    test('ativo pode ir para inadimplente ou removido', () => {
      expect(VALID_TRANSITIONS.ativo).toEqual(['inadimplente', 'removido']);
    });

    test('inadimplente pode ir para ativo ou removido', () => {
      expect(VALID_TRANSITIONS.inadimplente).toEqual(['ativo', 'removido']);
    });

    test('removido é estado final (sem transições)', () => {
      expect(VALID_TRANSITIONS.removido).toEqual([]);
    });
  });

  // ============================================
  // canTransition (AC: #2)
  // ============================================
  describe('canTransition', () => {
    // Transições válidas
    test('trial → ativo retorna true', () => {
      expect(canTransition('trial', 'ativo')).toBe(true);
    });

    test('trial → removido retorna true', () => {
      expect(canTransition('trial', 'removido')).toBe(true);
    });

    test('ativo → inadimplente retorna true', () => {
      expect(canTransition('ativo', 'inadimplente')).toBe(true);
    });

    test('ativo → removido retorna true', () => {
      expect(canTransition('ativo', 'removido')).toBe(true);
    });

    test('inadimplente → ativo retorna true', () => {
      expect(canTransition('inadimplente', 'ativo')).toBe(true);
    });

    test('inadimplente → removido retorna true', () => {
      expect(canTransition('inadimplente', 'removido')).toBe(true);
    });

    // Transições inválidas
    test('removido → ativo retorna false (estado final)', () => {
      expect(canTransition('removido', 'ativo')).toBe(false);
    });

    test('removido → trial retorna false (estado final)', () => {
      expect(canTransition('removido', 'trial')).toBe(false);
    });

    test('trial → inadimplente retorna false (transição inválida)', () => {
      expect(canTransition('trial', 'inadimplente')).toBe(false);
    });

    test('ativo → trial retorna false (transição inválida)', () => {
      expect(canTransition('ativo', 'trial')).toBe(false);
    });

    // Mesmo status
    test('trial → trial retorna false (mesmo status)', () => {
      expect(canTransition('trial', 'trial')).toBe(false);
    });

    test('ativo → ativo retorna false (mesmo status)', () => {
      expect(canTransition('ativo', 'ativo')).toBe(false);
    });

    // Status inválidos
    test('status inválido como currentStatus retorna false', () => {
      expect(canTransition('invalid', 'ativo')).toBe(false);
    });

    test('status inválido como newStatus retorna false', () => {
      expect(canTransition('trial', 'invalid')).toBe(false);
    });
  });

  // ============================================
  // getMemberById
  // ============================================
  describe('getMemberById', () => {
    test('retorna membro quando encontrado', async () => {
      const mockMember = {
        id: 1,
        telegram_id: 123456789,
        status: 'trial',
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberById(1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMember);
      expect(supabase.from).toHaveBeenCalledWith('members');
    });

    test('retorna MEMBER_NOT_FOUND quando não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberById(999);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'OTHER_ERROR', message: 'Database error' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberById(1);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // getMemberByTelegramId
  // ============================================
  describe('getMemberByTelegramId', () => {
    test('retorna membro quando encontrado', async () => {
      const mockMember = {
        id: 1,
        telegram_id: 123456789,
        status: 'ativo',
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberByTelegramId(123456789);

      expect(result.success).toBe(true);
      expect(result.data.telegram_id).toBe(123456789);
    });

    test('retorna MEMBER_NOT_FOUND quando não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberByTelegramId(999999999);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  // ============================================
  // updateMemberStatus (AC: #3)
  // ============================================
  describe('updateMemberStatus', () => {
    test('atualiza status quando transição é válida', async () => {
      const mockMember = { id: 1, status: 'trial' };
      const updatedMember = { id: 1, status: 'ativo' };

      // Mock getMemberById
      const getSingleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      // Mock update with optimistic locking (two .eq() calls)
      const updateSingleMock = jest.fn().mockResolvedValue({ data: updatedMember, error: null });
      const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
      const updateEqStatusMock = jest.fn().mockReturnValue({ select: updateSelectMock });
      const updateEqIdMock = jest.fn().mockReturnValue({ eq: updateEqStatusMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqIdMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await updateMemberStatus(1, 'ativo');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ativo');
    });

    test('retorna INVALID_MEMBER_STATUS para transição inválida', async () => {
      const mockMember = { id: 1, status: 'removido' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await updateMemberStatus(1, 'ativo');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
    });

    test('retorna MEMBER_NOT_FOUND se membro não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await updateMemberStatus(999, 'ativo');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });

    test('retorna RACE_CONDITION quando status mudou durante update', async () => {
      const mockMember = { id: 1, status: 'trial' };

      // Mock getMemberById - returns trial
      const getSingleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      // Mock update - returns PGRST116 (no rows matched - status changed)
      const updateSingleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' }
      });
      const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
      const updateEqStatusMock = jest.fn().mockReturnValue({ select: updateSelectMock });
      const updateEqIdMock = jest.fn().mockReturnValue({ eq: updateEqStatusMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqIdMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await updateMemberStatus(1, 'ativo');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RACE_CONDITION');
    });

    test('retorna DB_ERROR quando update falha com erro de banco', async () => {
      const mockMember = { id: 1, status: 'trial' };

      // Mock getMemberById
      const getSingleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      // Mock update - returns DB error
      const updateSingleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'SOME_DB_ERROR', message: 'Connection lost' }
      });
      const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
      const updateEqStatusMock = jest.fn().mockReturnValue({ select: updateSelectMock });
      const updateEqIdMock = jest.fn().mockReturnValue({ eq: updateEqStatusMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqIdMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await updateMemberStatus(1, 'ativo');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // createTrialMember
  // ============================================
  describe('createTrialMember', () => {
    test('cria membro trial com sucesso', async () => {
      const newMember = {
        id: 1,
        telegram_id: 123456789,
        status: 'trial',
        trial_started_at: '2026-01-17T00:00:00Z',
        trial_ends_at: '2026-01-24T00:00:00Z',
      };

      // Mock getMemberByTelegramId (not found)
      const getSingleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      // Mock insert
      const insertSingleMock = jest.fn().mockResolvedValue({ data: newMember, error: null });
      const insertSelectMock = jest.fn().mockReturnValue({ single: insertSingleMock });
      const insertMock = jest.fn().mockReturnValue({ select: insertSelectMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        } else {
          return { insert: insertMock };
        }
      });

      const result = await createTrialMember({
        telegramId: 123456789,
        telegramUsername: 'testuser',
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('trial');
    });

    test('retorna MEMBER_ALREADY_EXISTS se membro já existe', async () => {
      const existingMember = { id: 1, telegram_id: 123456789, status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: existingMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await createTrialMember({ telegramId: 123456789 });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_ALREADY_EXISTS');
    });
  });

  // ============================================
  // getTrialDaysRemaining
  // ============================================
  describe('getTrialDaysRemaining', () => {
    test('retorna dias restantes para membro em trial', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
      const mockMember = {
        id: 1,
        status: 'trial',
        trial_ends_at: futureDate.toISOString(),
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getTrialDaysRemaining(1);

      expect(result.success).toBe(true);
      expect(result.data.daysRemaining).toBeGreaterThanOrEqual(2);
      expect(result.data.daysRemaining).toBeLessThanOrEqual(4);
    });

    test('retorna 0 para membro não em trial', async () => {
      const mockMember = { id: 1, status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getTrialDaysRemaining(1);

      expect(result.success).toBe(true);
      expect(result.data.daysRemaining).toBe(0);
      expect(result.data.reason).toBe('not_in_trial');
    });

    test('retorna 0 para trial expirado', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const mockMember = {
        id: 1,
        status: 'trial',
        trial_ends_at: pastDate.toISOString(),
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getTrialDaysRemaining(1);

      expect(result.success).toBe(true);
      expect(result.data.daysRemaining).toBe(0);
    });
  });

  // ============================================
  // canRejoinGroup (Story 16.4)
  // ============================================
  describe('canRejoinGroup', () => {
    test('retorna canRejoin true se kicked_at < 24h', async () => {
      const recentKick = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      const mockMember = {
        id: 1,
        status: 'removido',
        kicked_at: recentKick.toISOString(),
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await canRejoinGroup(1);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(true);
      expect(result.data.hoursSinceKick).toBeLessThan(24);
    });

    test('retorna canRejoin false se kicked_at > 24h', async () => {
      const oldKick = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      const mockMember = {
        id: 1,
        status: 'removido',
        kicked_at: oldKick.toISOString(),
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await canRejoinGroup(1);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.hoursSinceKick).toBeGreaterThan(24);
    });

    test('retorna canRejoin false se status não é removido', async () => {
      const mockMember = { id: 1, status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await canRejoinGroup(1);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.reason).toBe('not_removed');
    });

    test('retorna canRejoin false se kicked_at é null (estado inconsistente)', async () => {
      const mockMember = { id: 1, status: 'removido', kicked_at: null };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await canRejoinGroup(1);

      expect(result.success).toBe(true);
      expect(result.data.canRejoin).toBe(false);
      expect(result.data.reason).toBe('no_kicked_at');
    });

    test('retorna erro MEMBER_NOT_FOUND se membro não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await canRejoinGroup(999);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  // ============================================
  // reactivateMember (Story 16.4)
  // ============================================
  describe('reactivateMember', () => {
    // Mock config
    beforeEach(() => {
      jest.mock('../../lib/config', () => ({
        config: { membership: { trialDays: 7 } }
      }));
    });

    test('reativa membro removido como trial com sucesso', async () => {
      const mockMember = { id: 1, status: 'removido' };
      const reactivatedMember = {
        id: 1,
        status: 'trial',
        trial_started_at: '2026-01-18T00:00:00Z',
        trial_ends_at: '2026-01-25T00:00:00Z',
        kicked_at: null,
      };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update
      const updateSingle = jest.fn().mockResolvedValue({ data: reactivatedMember, error: null });
      const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
      const updateEq2 = jest.fn().mockReturnValue({ select: updateSelect });
      const updateEq1 = jest.fn().mockReturnValue({ eq: updateEq2 });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq1 });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getMemberSelect };
        } else {
          return { update: updateMock };
        }
      });

      const result = await reactivateMember(1);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('trial');
      expect(result.data.kicked_at).toBeNull();
    });

    test('retorna INVALID_MEMBER_STATUS se membro não está removido', async () => {
      const mockMember = { id: 1, status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await reactivateMember(1);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
    });

    test('retorna RACE_CONDITION se status mudou durante update', async () => {
      const mockMember = { id: 1, status: 'removido' };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update with race condition
      const updateSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' }
      });
      const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
      const updateEq2 = jest.fn().mockReturnValue({ select: updateSelect });
      const updateEq1 = jest.fn().mockReturnValue({ eq: updateEq2 });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq1 });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getMemberSelect };
        } else {
          return { update: updateMock };
        }
      });

      const result = await reactivateMember(1);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RACE_CONDITION');
    });

    test('retorna MEMBER_NOT_FOUND se membro não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await reactivateMember(999);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  // ============================================
  // getMemberStats (Story 16.7, AC: #1)
  // ============================================
  describe('getMemberStats', () => {
    test('retorna contagens corretas por status', async () => {
      const mockMembers = [
        { status: 'trial' },
        { status: 'trial' },
        { status: 'ativo' },
        { status: 'ativo' },
        { status: 'ativo' },
        { status: 'inadimplente' },
        { status: 'removido' },
      ];

      const selectMock = jest.fn().mockResolvedValue({ data: mockMembers, error: null });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberStats();

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(7);
      expect(result.data.ativo).toBe(3);
      expect(result.data.trial).toBe(2);
      expect(result.data.inadimplente).toBe(1);
      expect(result.data.removido).toBe(1);
    });

    test('retorna zeros quando não há membros', async () => {
      const selectMock = jest.fn().mockResolvedValue({ data: [], error: null });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberStats();

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(0);
      expect(result.data.ativo).toBe(0);
      expect(result.data.trial).toBe(0);
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      const selectMock = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Connection error' }
      });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberStats();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // calculateMRR (Story 16.7, AC: #1)
  // ============================================
  describe('calculateMRR', () => {
    test('calcula MRR com preço padrão de R$50', () => {
      const mrr = calculateMRR(120);
      expect(mrr).toBe(6000);
    });

    test('calcula MRR com preço customizado', () => {
      const mrr = calculateMRR(100, 99);
      expect(mrr).toBe(9900);
    });

    test('retorna 0 quando não há membros ativos', () => {
      const mrr = calculateMRR(0);
      expect(mrr).toBe(0);
    });
  });

  // ============================================
  // calculateConversionRate (Story 16.7, AC: #1)
  // ============================================
  describe('calculateConversionRate', () => {
    test('calcula taxa de conversão corretamente', async () => {
      // 3 membros que converteram (trial -> ativo)
      const activeConverted = [{ id: 1 }, { id: 2 }, { id: 3 }];
      // 6 membros que já fizeram trial
      const allTrials = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }];

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Query para ativos convertidos
          const notMock = jest.fn().mockResolvedValue({ data: activeConverted, error: null });
          const eqMock = jest.fn().mockReturnValue({ not: notMock });
          const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
          return { select: selectMock };
        } else {
          // Query para todos que já fizeram trial
          const notMock = jest.fn().mockResolvedValue({ data: allTrials, error: null });
          const selectMock = jest.fn().mockReturnValue({ not: notMock });
          return { select: selectMock };
        }
      });

      const result = await calculateConversionRate();

      expect(result.success).toBe(true);
      expect(result.data.rate).toBe(50); // 3/6 = 50%
      expect(result.data.converted).toBe(3);
      expect(result.data.totalTrials).toBe(6);
    });

    test('retorna 0% quando não há trials', async () => {
      supabase.from.mockImplementation(() => {
        const notMock = jest.fn().mockResolvedValue({ data: [], error: null });
        const eqMock = jest.fn().mockReturnValue({ not: notMock });
        const selectMock = jest.fn().mockReturnValue({ eq: eqMock, not: notMock });
        return { select: selectMock };
      });

      const result = await calculateConversionRate();

      expect(result.success).toBe(true);
      expect(result.data.rate).toBe(0);
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      // Primeira query (.eq().not()) retorna erro
      supabase.from.mockImplementation(() => {
        const notMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
        const eqMock = jest.fn().mockReturnValue({ not: notMock });
        const selectMock = jest.fn().mockReturnValue({ eq: eqMock, not: notMock });
        return { select: selectMock };
      });

      const result = await calculateConversionRate();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // getNewMembersThisWeek (Story 16.7, AC: #1)
  // ============================================
  describe('getNewMembersThisWeek', () => {
    test('retorna contagem de novos membros nos últimos 7 dias', async () => {
      const newMembers = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

      const gteMock = jest.fn().mockResolvedValue({ data: newMembers, error: null });
      const selectMock = jest.fn().mockReturnValue({ gte: gteMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getNewMembersThisWeek();

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(5);
    });

    test('retorna 0 quando não há novos membros', async () => {
      const gteMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const selectMock = jest.fn().mockReturnValue({ gte: gteMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getNewMembersThisWeek();

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      const gteMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      const selectMock = jest.fn().mockReturnValue({ gte: gteMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getNewMembersThisWeek();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // getMemberDetails (Story 16.7, AC: #2)
  // ============================================
  describe('getMemberDetails', () => {
    test('busca por @username com sucesso', async () => {
      const mockMember = { id: 'uuid-1', telegram_id: 123456789, telegram_username: 'testuser', status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberDetails('@testuser');

      expect(result.success).toBe(true);
      expect(result.data.telegram_username).toBe('testuser');
      expect(eqMock).toHaveBeenCalledWith('telegram_username', 'testuser');
    });

    test('busca por telegram_id numerico com sucesso', async () => {
      const mockMember = { id: 'uuid-1', telegram_id: 123456789, status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberDetails('123456789');

      expect(result.success).toBe(true);
      expect(result.data.telegram_id).toBe(123456789);
      expect(eqMock).toHaveBeenCalledWith('telegram_id', '123456789');
    });

    test('retorna MEMBER_NOT_FOUND quando não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberDetails('@nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'OTHER_ERROR', message: 'Connection error' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMemberDetails('@testuser');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // getNotificationHistory (Story 16.7, AC: #2)
  // ============================================
  describe('getNotificationHistory', () => {
    test('retorna histórico de notificações com sucesso', async () => {
      const mockNotifications = [
        { type: 'trial_reminder', channel: 'telegram', sent_at: '2026-01-17T09:00:00Z' },
        { type: 'trial_reminder', channel: 'telegram', sent_at: '2026-01-16T09:00:00Z' },
      ];

      const limitMock = jest.fn().mockResolvedValue({ data: mockNotifications, error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getNotificationHistory('uuid-1', 10);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].type).toBe('trial_reminder');
    });

    test('retorna array vazio quando não há notificações', async () => {
      const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getNotificationHistory('uuid-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      const limitMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getNotificationHistory('uuid-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });
  });

  // ============================================
  // addManualTrialMember (Story 16.7, AC: #4)
  // ============================================
  describe('addManualTrialMember', () => {
    test('cria novo membro trial quando não existe', async () => {
      const newMember = {
        id: 'uuid-new',
        telegram_id: 123456789,
        telegram_username: 'testuser',
        status: 'trial',
      };

      // Mock getMemberByTelegramId (not found)
      const getSingleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      // Mock insert
      const insertSingleMock = jest.fn().mockResolvedValue({ data: newMember, error: null });
      const insertSelectMock = jest.fn().mockReturnValue({ single: insertSingleMock });
      const insertMock = jest.fn().mockReturnValue({ select: insertSelectMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        // First 2 calls are getMemberByTelegramId (from addManualTrialMember and createTrialMember)
        if (callCount <= 2) {
          return { select: getSelectMock };
        } else {
          return { insert: insertMock };
        }
      });

      const result = await addManualTrialMember(123456789, 'testuser');

      expect(result.success).toBe(true);
      expect(result.isNew).toBe(true);
      expect(result.data.status).toBe('trial');
    });

    test('reinicia trial para membro removido', async () => {
      const existingMember = { id: 'uuid-1', telegram_id: 123456789, status: 'removido' };
      const updatedMember = { ...existingMember, status: 'trial' };

      // Mock getMemberByTelegramId (found)
      const getSingleMock = jest.fn().mockResolvedValue({ data: existingMember, error: null });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      // Mock update
      const updateSingleMock = jest.fn().mockResolvedValue({ data: updatedMember, error: null });
      const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
      const updateEqMock = jest.fn().mockReturnValue({ select: updateSelectMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await addManualTrialMember(123456789, 'testuser');

      expect(result.success).toBe(true);
      expect(result.isNew).toBe(false);
      expect(result.data.status).toBe('trial');
    });

    test('retorna MEMBER_ACTIVE se membro já está ativo', async () => {
      const existingMember = { id: 'uuid-1', telegram_id: 123456789, status: 'ativo' };

      const singleMock = jest.fn().mockResolvedValue({ data: existingMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await addManualTrialMember(123456789, 'testuser');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_ACTIVE');
    });
  });

  // ============================================
  // extendMembership (Story 16.7, AC: #6)
  // ============================================
  describe('extendMembership', () => {
    test('estende trial por X dias', async () => {
      const now = new Date();
      const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      const mockMember = {
        id: 'uuid-1',
        status: 'trial',
        trial_ends_at: trialEnds.toISOString(),
        notes: ''
      };
      const extendedMember = { ...mockMember, trial_ends_at: new Date(trialEnds.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update
      const updateSingle = jest.fn().mockResolvedValue({ data: extendedMember, error: null });
      const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
      const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getMemberSelect };
        } else {
          return { update: updateMock };
        }
      });

      const result = await extendMembership('uuid-1', 7, '@admin');

      expect(result.success).toBe(true);
    });

    test('estende assinatura de membro ativo', async () => {
      const now = new Date();
      const subEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const mockMember = {
        id: 'uuid-1',
        status: 'ativo',
        subscription_ends_at: subEnds.toISOString(),
        notes: ''
      };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update
      const updateSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
      const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getMemberSelect };
        } else {
          return { update: updateMock };
        }
      });

      const result = await extendMembership('uuid-1', 7, '@admin');

      expect(result.success).toBe(true);
    });

    test('retorna INVALID_MEMBER_STATUS para membro removido', async () => {
      const mockMember = { id: 'uuid-1', status: 'removido' };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await extendMembership('uuid-1', 7, '@admin');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
    });
  });

  // ============================================
  // appendToNotes (Story 16.7, ADR-004)
  // ============================================
  describe('appendToNotes', () => {
    test('adiciona nota estruturada ao membro', async () => {
      const mockMember = { id: 'uuid-1', notes: null };
      const updatedMember = { ...mockMember, notes: '[2026-01-18 10:00] @admin: cortesia +7 dias' };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update
      const updateSingle = jest.fn().mockResolvedValue({ data: updatedMember, error: null });
      const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
      const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getMemberSelect };
        } else {
          return { update: updateMock };
        }
      });

      const result = await appendToNotes('uuid-1', '@admin', 'cortesia +7 dias');

      expect(result.success).toBe(true);
    });

    test('preserva notas existentes', async () => {
      const mockMember = { id: 'uuid-1', notes: 'Nota anterior' };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update
      const updateSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
      const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getMemberSelect };
        } else {
          return { update: updateMock };
        }
      });

      const result = await appendToNotes('uuid-1', '@admin', 'nova ação');

      expect(result.success).toBe(true);
      // The update mock should have been called with notes that include the old note
      expect(updateMock).toHaveBeenCalled();
    });
  });

  // ============================================
  // getMembersForReconciliation (Story 16.8, AC: #2)
  // ============================================
  describe('getMembersForReconciliation', () => {
    test('retorna apenas membros ativos com cakto_subscription_id', async () => {
      // H1 FIX: Query now uses .eq('status', 'ativo') directly - only 'ativo' members returned
      const mockMembers = [
        { id: 'uuid-1', telegram_id: 111, status: 'ativo', cakto_subscription_id: 'sub_1' },
        { id: 'uuid-2', telegram_id: 222, status: 'ativo', cakto_subscription_id: 'sub_2' },
      ];

      const notMock = jest.fn().mockResolvedValue({ data: mockMembers, error: null });
      const eqMock = jest.fn().mockReturnValue({ not: notMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMembersForReconciliation();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data.every(m => m.status === 'ativo')).toBe(true);
      // H1 FIX: Verify .eq() is called with 'ativo' status
      expect(eqMock).toHaveBeenCalledWith('status', 'ativo');
    });

    test('retorna array vazio quando não há membros para reconciliar', async () => {
      const notMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const eqMock = jest.fn().mockReturnValue({ not: notMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMembersForReconciliation();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    test('retorna DB_ERROR em erro de banco', async () => {
      const notMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'Connection error' } });
      const eqMock = jest.fn().mockReturnValue({ not: notMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getMembersForReconciliation();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });

    test('seleciona campos necessarios para reconciliacao', async () => {
      const notMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const eqMock = jest.fn().mockReturnValue({ not: notMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      supabase.from.mockReturnValue({ select: selectMock });

      await getMembersForReconciliation();

      // Verify select was called with correct fields
      expect(selectMock).toHaveBeenCalledWith('id, telegram_id, telegram_username, email, status, cakto_subscription_id');
    });
  });
});

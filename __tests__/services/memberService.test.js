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

// Mock config for Story 18.3: generatePaymentLink tests
jest.mock('../../lib/config', () => ({
  config: {
    membership: {
      checkoutUrl: 'https://checkout.cakto.com.br/test-product',
      trialDays: 7,
    },
  },
}));

const {
  MEMBER_STATUSES,
  VALID_TRANSITIONS,
  canTransition,
  getMemberById,
  renewMemberSubscription,
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
  // Story 16.10: Reactivate removed member
  reactivateRemovedMember,
  // Story 18.1: Affiliate tracking
  setAffiliateCode,
  getAffiliateHistory,
  isAffiliateValid,
  // Story 18.3: Payment link with affiliate tracking
  generatePaymentLink,
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
  // renewMemberSubscription
  // ============================================
  describe('renewMemberSubscription', () => {
    test('estende assinatura ativa a partir de subscription_ends_at atual quando estiver no futuro', async () => {
      const currentEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const mockMember = {
        id: 1,
        status: 'ativo',
        subscription_ends_at: currentEndsAt.toISOString(),
      };
      const updatedMember = {
        ...mockMember,
        subscription_ends_at: new Date(currentEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const getSingleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      const updateSingleMock = jest.fn().mockResolvedValue({ data: updatedMember, error: null });
      const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
      const updateEqMock = jest.fn().mockReturnValue({ select: updateSelectMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        }
        return { update: updateMock };
      });

      const result = await renewMemberSubscription(1);

      expect(result.success).toBe(true);
      const updatePayload = updateMock.mock.calls[0][0];
      expect(new Date(updatePayload.subscription_ends_at).toISOString())
        .toBe(new Date(currentEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
    });

    test('quando assinatura já expirou, renova a partir de agora (+30 dias)', async () => {
      const pastEndsAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const mockMember = {
        id: 2,
        status: 'ativo',
        subscription_ends_at: pastEndsAt.toISOString(),
      };

      const getSingleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getEqMock = jest.fn().mockReturnValue({ single: getSingleMock });
      const getSelectMock = jest.fn().mockReturnValue({ eq: getEqMock });

      const updateSingleMock = jest.fn().mockResolvedValue({
        data: { ...mockMember, subscription_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
        error: null
      });
      const updateSelectMock = jest.fn().mockReturnValue({ single: updateSingleMock });
      const updateEqMock = jest.fn().mockReturnValue({ select: updateSelectMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: getSelectMock };
        }
        return { update: updateMock };
      });

      const nowBefore = Date.now();
      const result = await renewMemberSubscription(2);
      const nowAfter = Date.now();

      expect(result.success).toBe(true);
      const renewedAt = new Date(updateMock.mock.calls[0][0].subscription_ends_at).getTime();
      const minExpected = nowBefore + 29 * 24 * 60 * 60 * 1000;
      const maxExpected = nowAfter + 31 * 24 * 60 * 60 * 1000;
      expect(renewedAt).toBeGreaterThanOrEqual(minExpected);
      expect(renewedAt).toBeLessThanOrEqual(maxExpected);
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
    test('retorna apenas membros ativos com mp_subscription_id', async () => {
      // H1 FIX: Query now uses .eq('status', 'ativo') directly - only 'ativo' members returned
      const mockMembers = [
        { id: 'uuid-1', telegram_id: 111, status: 'ativo', mp_subscription_id: 'sub_1' },
        { id: 'uuid-2', telegram_id: 222, status: 'ativo', mp_subscription_id: 'sub_2' },
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
      expect(selectMock).toHaveBeenCalledWith('id, telegram_id, telegram_username, email, status, mp_subscription_id');
    });
  });

  // ============================================
  // Story 16.10: REACTIVATE REMOVED MEMBER
  // ============================================
  describe('reactivateRemovedMember', () => {
    test('reativa membro removido com sucesso', async () => {
      const mockMember = {
        id: 'uuid-1',
        telegram_id: 123456789,
        email: 'test@example.com',
        status: 'removido',
        notes: 'Removed: payment_failed'
      };
      const reactivatedMember = {
        ...mockMember,
        status: 'ativo',
        kicked_at: null,
        notes: 'Removed: payment_failed\nReativado após pagamento (subscription: sub_123)'
      };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update with optimistic lock
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

      const result = await reactivateRemovedMember('uuid-1', {
        subscriptionId: 'sub_123',
        paymentMethod: 'pix'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ativo');
      expect(result.data.kicked_at).toBeNull();
    });

    test('retorna erro quando membro não está em status removido', async () => {
      const mockMember = {
        id: 'uuid-1',
        status: 'ativo',
        notes: null
      };

      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      supabase.from.mockReturnValue({ select: getMemberSelect });

      const result = await reactivateRemovedMember('uuid-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_MEMBER_STATUS');
      expect(result.error.message).toContain("Expected 'removido'");
    });

    test('retorna erro quando membro não encontrado', async () => {
      const getMemberSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' }
      });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      supabase.from.mockReturnValue({ select: getMemberSelect });

      const result = await reactivateRemovedMember('uuid-not-found');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });

    test('retorna erro em race condition (status mudou durante update)', async () => {
      const mockMember = {
        id: 'uuid-1',
        status: 'removido',
        notes: null
      };

      // Mock getMemberById
      const getMemberSingle = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const getMemberEq = jest.fn().mockReturnValue({ single: getMemberSingle });
      const getMemberSelect = jest.fn().mockReturnValue({ eq: getMemberEq });

      // Mock update returning no rows (race condition)
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

      const result = await reactivateRemovedMember('uuid-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RACE_CONDITION');
    });

    test('reativa membro sem telegram_id (sem invite)', async () => {
      const mockMember = {
        id: 'uuid-1',
        telegram_id: null,
        email: 'test@example.com',
        status: 'removido',
        notes: null
      };
      const reactivatedMember = {
        ...mockMember,
        status: 'ativo',
        kicked_at: null,
        notes: 'Reativado após pagamento'
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

      const result = await reactivateRemovedMember('uuid-1');

      expect(result.success).toBe(true);
      expect(result.data.telegram_id).toBeNull();
    });
  });

  // ============================================
  // Story 18.1: AFFILIATE TRACKING FUNCTIONS
  // ============================================

  describe('setAffiliateCode', () => {
    test('define código de afiliado com sucesso', async () => {
      const mockMember = {
        id: 1,
        telegram_id: 123456789,
        status: 'trial',
        affiliate_code: null,
        affiliate_history: [],
        affiliate_clicked_at: null
      };
      const updatedMember = {
        ...mockMember,
        affiliate_code: 'CARLOS123',
        affiliate_history: [{ code: 'CARLOS123', clicked_at: expect.any(String) }],
        affiliate_clicked_at: expect.any(String)
      };

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

      const result = await setAffiliateCode(1, 'CARLOS123');

      expect(result.success).toBe(true);
      expect(result.data.affiliate_code).toBe('CARLOS123');
    });

    test('sobrescreve código anterior (modelo último clique)', async () => {
      const mockMember = {
        id: 1,
        affiliate_code: 'CARLOS123',
        affiliate_history: [{ code: 'CARLOS123', clicked_at: '2026-01-10T10:00:00Z' }],
        affiliate_clicked_at: '2026-01-10T10:00:00Z'
      };
      const updatedMember = {
        ...mockMember,
        affiliate_code: 'MARIA456',
        affiliate_history: [
          { code: 'CARLOS123', clicked_at: '2026-01-10T10:00:00Z' },
          { code: 'MARIA456', clicked_at: expect.any(String) }
        ]
      };

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

      const result = await setAffiliateCode(1, 'MARIA456');

      expect(result.success).toBe(true);
      expect(result.data.affiliate_code).toBe('MARIA456');
      expect(result.data.affiliate_history).toHaveLength(2);
    });

    test('retorna INVALID_PAYLOAD quando código vazio', async () => {
      const result = await setAffiliateCode(1, '');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PAYLOAD');
    });

    test('retorna MEMBER_NOT_FOUND quando membro não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await setAffiliateCode(999, 'CARLOS123');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  describe('getAffiliateHistory', () => {
    test('retorna histórico de afiliados com sucesso', async () => {
      const mockMember = {
        id: 1,
        affiliate_code: 'MARIA456',
        affiliate_history: [
          { code: 'CARLOS123', clicked_at: '2026-01-10T10:00:00Z' },
          { code: 'MARIA456', clicked_at: '2026-01-15T14:30:00Z' }
        ],
        affiliate_clicked_at: '2026-01-15T14:30:00Z'
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getAffiliateHistory(1);

      expect(result.success).toBe(true);
      expect(result.data.history).toHaveLength(2);
      expect(result.data.currentCode).toBe('MARIA456');
      expect(result.data.clickedAt).toBe('2026-01-15T14:30:00Z');
    });

    test('retorna histórico vazio quando nunca teve afiliado', async () => {
      const mockMember = {
        id: 1,
        affiliate_code: null,
        affiliate_history: [],
        affiliate_clicked_at: null
      };

      const singleMock = jest.fn().mockResolvedValue({ data: mockMember, error: null });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getAffiliateHistory(1);

      expect(result.success).toBe(true);
      expect(result.data.history).toEqual([]);
      expect(result.data.currentCode).toBeNull();
    });

    test('retorna MEMBER_NOT_FOUND quando membro não existe', async () => {
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });
      const eqMock = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await getAffiliateHistory(999);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  describe('isAffiliateValid', () => {
    test('retorna true quando afiliado válido (< 14 dias)', () => {
      const recentClick = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const member = {
        affiliate_code: 'CARLOS123',
        affiliate_clicked_at: recentClick.toISOString()
      };

      const result = isAffiliateValid(member);

      expect(result).toBe(true);
    });

    test('retorna false quando afiliado expirado (>= 14 dias)', () => {
      const oldClick = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const member = {
        affiliate_code: 'CARLOS123',
        affiliate_clicked_at: oldClick.toISOString()
      };

      const result = isAffiliateValid(member);

      expect(result).toBe(false);
    });

    test('retorna false quando não tem affiliate_code', () => {
      const member = {
        affiliate_code: null,
        affiliate_clicked_at: null
      };

      const result = isAffiliateValid(member);

      expect(result).toBe(false);
    });

    test('retorna false quando não tem affiliate_clicked_at', () => {
      const member = {
        affiliate_code: 'CARLOS123',
        affiliate_clicked_at: null
      };

      const result = isAffiliateValid(member);

      expect(result).toBe(false);
    });

    test('retorna false quando member é null', () => {
      const result = isAffiliateValid(null);

      expect(result).toBe(false);
    });

    test('retorna true no limite de 14 dias (13 dias 23h)', () => {
      // Just under 14 days
      const almostExpired = new Date(Date.now() - (13 * 24 + 23) * 60 * 60 * 1000);
      const member = {
        affiliate_code: 'CARLOS123',
        affiliate_clicked_at: almostExpired.toISOString()
      };

      const result = isAffiliateValid(member);

      expect(result).toBe(true);
    });
  });

  describe('createTrialMember with affiliateCode', () => {
    test('cria membro trial com código de afiliado', async () => {
      const newMember = {
        id: 1,
        telegram_id: 123456789,
        status: 'trial',
        affiliate_code: 'CARLOS123',
        affiliate_history: [{ code: 'CARLOS123', clicked_at: expect.any(String) }],
        affiliate_clicked_at: expect.any(String)
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
        affiliateCode: 'CARLOS123'
      }, 2); // 2 days for affiliate

      expect(result.success).toBe(true);
      expect(result.data.affiliate_code).toBe('CARLOS123');
    });

    test('cria membro trial sem código de afiliado', async () => {
      const newMember = {
        id: 1,
        telegram_id: 123456789,
        status: 'trial',
        affiliate_code: null,
        affiliate_history: null,
        affiliate_clicked_at: null
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
        telegramUsername: 'testuser'
      }, 7); // 7 days for regular

      expect(result.success).toBe(true);
      // Affiliate fields should be null/empty when not provided
    });
  });

  describe('clearExpiredAffiliates', () => {
    const { clearExpiredAffiliates } = require('../../bot/services/memberService');

    test('retorna sucesso com cleared=0 quando não há afiliados expirados', async () => {
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await clearExpiredAffiliates();

      expect(result.success).toBe(true);
      expect(result.data.cleared).toBe(0);
    });

    test('limpa afiliados expirados (>14 dias) corretamente', async () => {
      const expiredMembers = [
        { id: 1, telegram_id: 111, affiliate_code: 'CODE1' },
        { id: 2, telegram_id: 222, affiliate_code: 'CODE2' }
      ];

      // Mock select (find expired)
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: expiredMembers, error: null })
        })
      });

      // Mock update
      const updateMock = jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ error: null })
      });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: selectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await clearExpiredAffiliates();

      expect(result.success).toBe(true);
      expect(result.data.cleared).toBe(2);
    });

    test('retorna erro quando select falha', async () => {
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
        })
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await clearExpiredAffiliates();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });

    test('retorna erro quando update falha', async () => {
      const expiredMembers = [
        { id: 1, telegram_id: 111, affiliate_code: 'CODE1' }
      ];

      // Mock select (find expired)
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: expiredMembers, error: null })
        })
      });

      // Mock update (fails)
      const updateMock = jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } })
      });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: selectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await clearExpiredAffiliates();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DB_ERROR');
    });

    test('não modifica affiliate_history (preserva sempre)', async () => {
      const expiredMembers = [
        { id: 1, telegram_id: 111, affiliate_code: 'CODE1', affiliate_history: [{ code: 'CODE1', clicked_at: '2024-01-01' }] }
      ];

      // Mock select
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: expiredMembers, error: null })
        })
      });

      // Mock update - capture the update payload
      let updatePayload = null;
      const updateMock = jest.fn().mockImplementation((payload) => {
        updatePayload = payload;
        return {
          in: jest.fn().mockResolvedValue({ error: null })
        };
      });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: selectMock };
        } else {
          return { update: updateMock };
        }
      });

      await clearExpiredAffiliates();

      // Verify affiliate_history is NOT in the update payload
      expect(updatePayload).toHaveProperty('affiliate_code', null);
      expect(updatePayload).toHaveProperty('affiliate_clicked_at', null);
      expect(updatePayload).not.toHaveProperty('affiliate_history');
    });

    test('não afeta membros com afiliado válido (< 14 dias) - Task 5.2', async () => {
      // This test verifies the query uses correct date filter
      // Members with affiliate_clicked_at < 14 days ago should NOT be selected

      let capturedLtDate = null;
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockImplementation((column, value) => {
            capturedLtDate = value;
            // Simulate: no expired members found (all are valid)
            return Promise.resolve({ data: [], error: null });
          })
        })
      });

      supabase.from.mockReturnValue({ select: selectMock });

      const result = await clearExpiredAffiliates();

      // Verify success with 0 cleared (no expired found)
      expect(result.success).toBe(true);
      expect(result.data.cleared).toBe(0);

      // Verify the cutoff date is approximately 14 days ago
      expect(capturedLtDate).toBeDefined();
      const cutoffDate = new Date(capturedLtDate);
      const now = new Date();
      const daysDiff = (now - cutoffDate) / (1000 * 60 * 60 * 24);

      // Should be approximately 14 days (allow 1 day tolerance for test timing)
      expect(daysDiff).toBeGreaterThanOrEqual(13);
      expect(daysDiff).toBeLessThanOrEqual(15);
    });

    test('processa em batches quando há muitos membros expirados (> 500)', async () => {
      // Generate 600 expired members to trigger batch processing
      const expiredMembers = Array.from({ length: 600 }, (_, i) => ({
        id: i + 1,
        telegram_id: 1000 + i,
        affiliate_code: `CODE${i}`
      }));

      // Mock select
      const selectMock = jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: expiredMembers, error: null })
        })
      });

      // Track update calls
      const updateCalls = [];
      const updateMock = jest.fn().mockImplementation((payload) => {
        return {
          in: jest.fn().mockImplementation((column, ids) => {
            updateCalls.push({ column, idsCount: ids.length });
            return Promise.resolve({ error: null });
          })
        };
      });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: selectMock };
        } else {
          return { update: updateMock };
        }
      });

      const result = await clearExpiredAffiliates();

      expect(result.success).toBe(true);
      expect(result.data.cleared).toBe(600);

      // Should have processed in batches (500 each)
      expect(updateCalls.length).toBe(2);
      expect(updateCalls[0].idsCount).toBe(500);
      expect(updateCalls[1].idsCount).toBe(100);
    });
  });

  // ============================================
  // Story 18.3: generatePaymentLink
  // ============================================
  describe('generatePaymentLink', () => {
    const MOCK_CHECKOUT_URL = 'https://checkout.cakto.com.br/test-product';

    test('retorna link COM tracking quando afiliado e valido (< 14 dias)', () => {
      const now = new Date();
      const member = {
        id: 1,
        telegram_id: 123456,
        affiliate_code: 'CODIGO123',
        affiliate_clicked_at: now.toISOString(), // Today - valid
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(true);
      expect(result.data.affiliateCode).toBe('CODIGO123');
      expect(result.data.url).toBe(`${MOCK_CHECKOUT_URL}?affiliate=CODIGO123`);
    });

    test('retorna link SEM tracking quando membro nao tem affiliate_code', () => {
      const member = {
        id: 2,
        telegram_id: 789012,
        affiliate_code: null,
        affiliate_clicked_at: null,
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(result.data.url).toBe(MOCK_CHECKOUT_URL);
    });

    test('retorna link SEM tracking quando afiliado expirou (> 14 dias)', () => {
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      const member = {
        id: 3,
        telegram_id: 345678,
        affiliate_code: 'EXPIRED_CODE',
        affiliate_clicked_at: fifteenDaysAgo.toISOString(), // Expired
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(result.data.url).toBe(MOCK_CHECKOUT_URL);
    });

    test('retorna link SEM tracking quando affiliate_clicked_at e null', () => {
      const member = {
        id: 4,
        telegram_id: 456789,
        affiliate_code: 'ORPHAN_CODE', // Code exists but no clicked_at
        affiliate_clicked_at: null,
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(result.data.url).toBe(MOCK_CHECKOUT_URL);
    });

    test('encoda caracteres especiais no affiliate_code', () => {
      const now = new Date();
      const member = {
        id: 5,
        telegram_id: 567890,
        affiliate_code: 'CODE WITH SPACES & SPECIAL=CHARS',
        affiliate_clicked_at: now.toISOString(),
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(true);
      expect(result.data.url).toBe(`${MOCK_CHECKOUT_URL}?affiliate=CODE%20WITH%20SPACES%20%26%20SPECIAL%3DCHARS`);
    });

    test('retorna link COM tracking para afiliado no limite de 13 dias', () => {
      const thirteenDaysAgo = new Date();
      thirteenDaysAgo.setDate(thirteenDaysAgo.getDate() - 13);

      const member = {
        id: 6,
        telegram_id: 678901,
        affiliate_code: 'ALMOST_EXPIRED',
        affiliate_clicked_at: thirteenDaysAgo.toISOString(), // Still valid (< 14)
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(true);
      expect(result.data.affiliateCode).toBe('ALMOST_EXPIRED');
    });

    test('retorna link SEM tracking no limite exato de 14 dias', () => {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const member = {
        id: 7,
        telegram_id: 789012,
        affiliate_code: 'EXACTLY_EXPIRED',
        affiliate_clicked_at: fourteenDaysAgo.toISOString(), // Expired (>= 14)
      };

      const result = generatePaymentLink(member);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
    });

    test('retorna link generico quando member e null', () => {
      const result = generatePaymentLink(null);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(result.data.url).toBe(MOCK_CHECKOUT_URL);
    });

    test('retorna link generico quando member e undefined', () => {
      const result = generatePaymentLink(undefined);

      expect(result.success).toBe(true);
      expect(result.data.hasAffiliate).toBe(false);
      expect(result.data.affiliateCode).toBeNull();
      expect(result.data.url).toBe(MOCK_CHECKOUT_URL);
    });
  });
});

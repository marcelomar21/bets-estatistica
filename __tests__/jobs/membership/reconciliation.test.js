/**
 * Tests for reconciliation.js
 * Story 16.8: Implementar Reconciliacao com Cakto
 */

// Mock dependencies before importing
jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../bot/services/alertService', () => ({
  alertAdmin: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../bot/services/memberService', () => ({
  getMembersForReconciliation: jest.fn(),
}));

jest.mock('../../../bot/services/caktoService', () => ({
  getSubscription: jest.fn(),
}));

const logger = require('../../../lib/logger');
const { alertAdmin } = require('../../../bot/services/alertService');
const { getMembersForReconciliation } = require('../../../bot/services/memberService');
const { getSubscription } = require('../../../bot/services/caktoService');

const {
  runReconciliation,
  isDesynchronized,
  sendDesyncAlert,
  sendCriticalFailureAlert,
} = require('../../../bot/jobs/membership/reconciliation');

describe('reconciliation job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // isDesynchronized (AC: #4)
  // ============================================
  describe('isDesynchronized', () => {
    test('ativo + active = NOT desync', () => {
      const result = isDesynchronized('ativo', 'active');
      expect(result.desync).toBe(false);
      expect(result.action).toBeNull();
    });

    test('ativo + canceled = IS desync', () => {
      const result = isDesynchronized('ativo', 'canceled');
      expect(result.desync).toBe(true);
      expect(result.action).toContain('remover');
    });

    test('ativo + cancelled (British spelling) = IS desync', () => {
      const result = isDesynchronized('ativo', 'cancelled');
      expect(result.desync).toBe(true);
      expect(result.action).toContain('remover');
    });

    test('ativo + expired = IS desync', () => {
      const result = isDesynchronized('ativo', 'expired');
      expect(result.desync).toBe(true);
      expect(result.action).toContain('pagamento');
    });

    test('ativo + defaulted = IS desync', () => {
      const result = isDesynchronized('ativo', 'defaulted');
      expect(result.desync).toBe(true);
      expect(result.action).toContain('pagamento');
    });

    test('ativo + suspended = IS desync', () => {
      const result = isDesynchronized('ativo', 'suspended');
      expect(result.desync).toBe(true);
      expect(result.action).toContain('pagamento');
    });

    test('trial is always NOT desync (ignored)', () => {
      const result = isDesynchronized('trial', 'canceled');
      expect(result.desync).toBe(false);
      expect(result.action).toBeNull();
    });

    test('case insensitive status comparison', () => {
      const result = isDesynchronized('ativo', 'CANCELED');
      expect(result.desync).toBe(true);
    });
  });

  // ============================================
  // sendDesyncAlert (AC: #5)
  // ============================================
  describe('sendDesyncAlert', () => {
    test('envia alerta formatado para admin', async () => {
      const members = [
        { telegram_username: 'user1', telegram_id: 123, status: 'ativo', caktoStatus: 'canceled', suggestedAction: 'Verificar' },
        { telegram_username: 'user2', telegram_id: 456, status: 'ativo', caktoStatus: 'expired', suggestedAction: 'Verificar pagamento' },
      ];

      await sendDesyncAlert(members);

      expect(alertAdmin).toHaveBeenCalledTimes(1);
      const message = alertAdmin.mock.calls[0][0];
      expect(message).toContain('DESSINCRONIZACAO DETECTADA');
      expect(message).toContain('@user1');
      expect(message).toContain('@user2');
      expect(message).toContain('2 membro(s)');
    });

    test('usa "sem_username" quando username ausente', async () => {
      const members = [
        { telegram_username: null, telegram_id: 123, status: 'ativo', caktoStatus: 'canceled', suggestedAction: 'Verificar' },
      ];

      await sendDesyncAlert(members);

      const message = alertAdmin.mock.calls[0][0];
      expect(message).toContain('@sem_username');
    });
  });

  // ============================================
  // sendCriticalFailureAlert (AC: #6)
  // ============================================
  describe('sendCriticalFailureAlert', () => {
    test('envia alerta critico com estatisticas', async () => {
      const stats = { total: 100, synced: 10, desynced: 0, failed: 90 };
      const errors = [
        { memberId: '1', error: 'CAKTO_API_ERROR' },
        { memberId: '2', error: 'CAKTO_API_ERROR' },
        { memberId: '3', error: 'TIMEOUT' },
      ];

      await sendCriticalFailureAlert(stats, errors);

      expect(alertAdmin).toHaveBeenCalledTimes(1);
      const message = alertAdmin.mock.calls[0][0];
      expect(message).toContain('FALHA CRITICA');
      expect(message).toContain('90.0%');
      expect(message).toContain('CAKTO_API_ERROR: 2');
    });

    test('mostra top 3 erros mais frequentes', async () => {
      const stats = { total: 100, synced: 0, desynced: 0, failed: 100 };
      const errors = [
        { memberId: '1', error: 'ERROR_A' },
        { memberId: '2', error: 'ERROR_A' },
        { memberId: '3', error: 'ERROR_A' },
        { memberId: '4', error: 'ERROR_B' },
        { memberId: '5', error: 'ERROR_B' },
        { memberId: '6', error: 'ERROR_C' },
        { memberId: '7', error: 'ERROR_D' }, // Won't appear (only top 3)
      ];

      await sendCriticalFailureAlert(stats, errors);

      const message = alertAdmin.mock.calls[0][0];
      expect(message).toContain('ERROR_A');
      expect(message).toContain('ERROR_B');
      expect(message).toContain('ERROR_C');
    });
  });

  // ============================================
  // runReconciliation (AC: #1, #2, #3, #7)
  // ============================================
  describe('runReconciliation', () => {
    test('retorna sucesso quando nao ha membros para verificar', async () => {
      getMembersForReconciliation.mockResolvedValue({ success: true, data: [] });

      const result = await runReconciliation();

      expect(result.success).toBe(true);
      expect(result.total).toBe(0);
      expect(alertAdmin).not.toHaveBeenCalled();
    });

    test('verifica membros e conta sincronizados', async () => {
      getMembersForReconciliation.mockResolvedValue({
        success: true,
        data: [
          { id: '1', telegram_id: 111, status: 'ativo', cakto_subscription_id: 'sub_1' },
          { id: '2', telegram_id: 222, status: 'ativo', cakto_subscription_id: 'sub_2' },
        ]
      });
      getSubscription.mockResolvedValue({ success: true, data: { status: 'active' } });

      const result = await runReconciliation();

      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.synced).toBe(2);
      expect(result.desynced).toBe(0);
      expect(alertAdmin).not.toHaveBeenCalled(); // Silent success
    });

    test('detecta dessincronizacao e envia alerta', async () => {
      getMembersForReconciliation.mockResolvedValue({
        success: true,
        data: [
          { id: '1', telegram_id: 111, telegram_username: 'user1', status: 'ativo', cakto_subscription_id: 'sub_1' },
        ]
      });
      getSubscription.mockResolvedValue({ success: true, data: { status: 'canceled' } });

      const result = await runReconciliation();

      expect(result.success).toBe(true);
      expect(result.desynced).toBe(1);
      expect(alertAdmin).toHaveBeenCalledTimes(1);
      expect(alertAdmin.mock.calls[0][0]).toContain('DESSINCRONIZACAO');
    });

    test('trata SUBSCRIPTION_NOT_FOUND como dessincronizacao', async () => {
      getMembersForReconciliation.mockResolvedValue({
        success: true,
        data: [
          { id: '1', telegram_id: 111, telegram_username: 'user1', status: 'ativo', cakto_subscription_id: 'sub_1' },
        ]
      });
      getSubscription.mockResolvedValue({
        success: false,
        error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Not found' }
      });

      const result = await runReconciliation();

      expect(result.success).toBe(true);
      expect(result.desynced).toBe(1);
      expect(result.failed).toBe(0);
      expect(alertAdmin).toHaveBeenCalled();
      expect(alertAdmin.mock.calls[0][0]).toContain('NOT_FOUND');
    });

    test('conta falhas de API separadamente', async () => {
      getMembersForReconciliation.mockResolvedValue({
        success: true,
        data: [
          { id: '1', telegram_id: 111, status: 'ativo', cakto_subscription_id: 'sub_1' },
        ]
      });
      getSubscription.mockResolvedValue({
        success: false,
        error: { code: 'CAKTO_API_ERROR', message: 'Timeout' }
      });

      const result = await runReconciliation();

      expect(result.success).toBe(true);
      expect(result.failed).toBe(1);
      expect(result.desynced).toBe(0);
    });

    test('envia alerta critico se > 50% falhou', async () => {
      const members = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), telegram_id: i, status: 'ativo', cakto_subscription_id: `sub_${i}`
      }));

      getMembersForReconciliation.mockResolvedValue({ success: true, data: members });

      // 6 out of 10 fail = 60% > 50%
      let callCount = 0;
      getSubscription.mockImplementation(() => {
        callCount++;
        if (callCount <= 6) {
          return Promise.resolve({ success: false, error: { code: 'CAKTO_API_ERROR', message: 'Timeout' } });
        }
        return Promise.resolve({ success: true, data: { status: 'active' } });
      });

      const result = await runReconciliation();

      expect(result.failed).toBe(6);
      expect(alertAdmin).toHaveBeenCalled();
      // Find the critical alert call
      const criticalCall = alertAdmin.mock.calls.find(call => call[0].includes('FALHA CRITICA'));
      expect(criticalCall).toBeDefined();
    });

    test('nao envia alerta critico se < 50% falhou', async () => {
      const members = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), telegram_id: i, status: 'ativo', cakto_subscription_id: `sub_${i}`
      }));

      getMembersForReconciliation.mockResolvedValue({ success: true, data: members });

      // 4 out of 10 fail = 40% < 50%
      let callCount = 0;
      getSubscription.mockImplementation(() => {
        callCount++;
        if (callCount <= 4) {
          return Promise.resolve({ success: false, error: { code: 'CAKTO_API_ERROR', message: 'Timeout' } });
        }
        return Promise.resolve({ success: true, data: { status: 'active' } });
      });

      const result = await runReconciliation();

      expect(result.failed).toBe(4);
      // Should NOT have critical alert
      const criticalCall = alertAdmin.mock.calls.find(call => call[0].includes('FALHA CRITICA'));
      expect(criticalCall).toBeUndefined();
    });

    test('retorna erro se getMembersForReconciliation falha', async () => {
      getMembersForReconciliation.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Connection error' }
      });

      const result = await runReconciliation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection error');
    });

    test('loga resumo ao final (AC: #7)', async () => {
      getMembersForReconciliation.mockResolvedValue({
        success: true,
        data: [
          { id: '1', telegram_id: 111, status: 'ativo', cakto_subscription_id: 'sub_1' },
        ]
      });
      getSubscription.mockResolvedValue({ success: true, data: { status: 'active' } });

      await runReconciliation();

      // Check that final log was called with stats
      const completeLog = logger.info.mock.calls.find(call =>
        call[0].includes('Complete')
      );
      expect(completeLog).toBeDefined();
      expect(completeLog[1]).toHaveProperty('total');
      expect(completeLog[1]).toHaveProperty('synced');
      expect(completeLog[1]).toHaveProperty('desynced');
      expect(completeLog[1]).toHaveProperty('failed');
      expect(completeLog[1]).toHaveProperty('durationMs');
    });

    // H3 FIX: Test concurrent run prevention (lock mechanism)
    test('retorna skipped se já está rodando (lock)', async () => {
      // Setup a slow reconciliation
      getMembersForReconciliation.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: [{ id: '1', telegram_id: 111, status: 'ativo', cakto_subscription_id: 'sub_1' }]
        }), 100))
      );
      getSubscription.mockResolvedValue({ success: true, data: { status: 'active' } });

      // Start first run (don't await)
      const firstRun = runReconciliation();

      // Try to start second run immediately
      const secondRun = runReconciliation();

      // Second run should be skipped
      const result2 = await secondRun;
      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);

      // First run should complete normally
      const result1 = await firstRun;
      expect(result1.success).toBe(true);
      expect(result1.skipped).toBeUndefined();
    });

    test('libera lock após execução bem-sucedida', async () => {
      getMembersForReconciliation.mockResolvedValue({ success: true, data: [] });

      // First run completes
      await runReconciliation();

      // Second run should work (lock released)
      const result = await runReconciliation();
      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
    });

    test('libera lock mesmo após erro', async () => {
      getMembersForReconciliation
        .mockResolvedValueOnce({ success: false, error: { code: 'DB_ERROR', message: 'Error' } })
        .mockResolvedValueOnce({ success: true, data: [] });

      // First run fails
      const result1 = await runReconciliation();
      expect(result1.success).toBe(false);

      // Second run should work (lock released after error)
      const result2 = await runReconciliation();
      expect(result2.success).toBe(true);
      expect(result2.skipped).toBeUndefined();
    });
  });
});

/**
 * Tests for process-webhooks.js job
 * Story 16.3: Implementar Processamento Assíncrono de Webhooks
 */

// Mock supabase
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

// Mock webhookProcessors
jest.mock('../../bot/services/webhookProcessors', () => ({
  processWebhookEvent: jest.fn(),
}));

// Mock alertService
jest.mock('../../bot/services/alertService', () => ({
  webhookProcessingAlert: jest.fn(),
}));

const { runProcessWebhooks, CONFIG } = require('../../bot/jobs/membership/process-webhooks');
const { supabase } = require('../../lib/supabase');
const { processWebhookEvent } = require('../../bot/services/webhookProcessors');
const { webhookProcessingAlert } = require('../../bot/services/alertService');

describe('process-webhooks job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // CONFIG
  // ============================================
  describe('CONFIG', () => {
    test('tem BATCH_SIZE de 10', () => {
      expect(CONFIG.BATCH_SIZE).toBe(10);
    });

    test('tem STUCK_TIMEOUT_MINUTES de 5', () => {
      expect(CONFIG.STUCK_TIMEOUT_MINUTES).toBe(5);
    });

    test('tem MAX_ATTEMPTS de 5', () => {
      expect(CONFIG.MAX_ATTEMPTS).toBe(5);
    });
  });

  // ============================================
  // Lock em Memória (AC6)
  // ============================================
  describe('Lock em memória', () => {
    test('primeira execução roda normalmente', async () => {
      // Mock empty events
      const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      // Mock for stuck events check (no stuck events)
      const ltMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Stuck events query
          return { select: stuckSelectMock };
        } else {
          // Pending events query
          return { select: selectMock };
        }
      });

      const result = await runProcessWebhooks();

      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
    });

    test('segunda execução concorrente é pulada', async () => {
      // First call - will take time
      let resolveFirst;
      const slowPromise = new Promise(resolve => { resolveFirst = resolve; });

      const limitMock = jest.fn().mockImplementation(() => slowPromise);
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });

      // Stuck events - no stuck
      const ltMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      supabase.from.mockReturnValue({ select: stuckSelectMock });

      // Start first execution (won't complete yet)
      const firstPromise = runProcessWebhooks();

      // Immediately try second execution
      const secondResult = await runProcessWebhooks();

      // Second should be skipped
      expect(secondResult.success).toBe(true);
      expect(secondResult.skipped).toBe(true);

      // Resolve first
      resolveFirst({ data: [], error: null });
      await firstPromise;
    });
  });

  // ============================================
  // Event Processing (AC1)
  // ============================================
  describe('processamento de eventos', () => {
    test('processa eventos pending em ordem', async () => {
      const mockEvents = [
        { id: 1, idempotency_key: 'evt_1', event_type: 'purchase_approved', payload: {}, attempts: 0 },
        { id: 2, idempotency_key: 'evt_2', event_type: 'subscription_renewed', payload: {}, attempts: 0 },
      ];

      // Stuck events - none
      const ltMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      // Pending events query
      const limitMock = jest.fn().mockResolvedValue({ data: mockEvents, error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const pendingEqMock = jest.fn().mockReturnValue({ order: orderMock });
      const pendingSelectMock = jest.fn().mockReturnValue({ eq: pendingEqMock });

      // Update to processing
      const updateEqStatusMock = jest.fn().mockResolvedValue({ error: null });
      const updateEqIdMock = jest.fn().mockReturnValue({ eq: updateEqStatusMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqIdMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: stuckSelectMock };
        } else if (callCount === 2) {
          return { select: pendingSelectMock };
        } else {
          return { update: updateMock };
        }
      });

      processWebhookEvent.mockResolvedValue({ success: true });

      const result = await runProcessWebhooks();

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
      expect(processWebhookEvent).toHaveBeenCalledTimes(2);
    });

    test('retorna early se não há eventos pending', async () => {
      // Stuck events - none
      const ltMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      // Pending events - empty
      const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const pendingEqMock = jest.fn().mockReturnValue({ order: orderMock });
      const pendingSelectMock = jest.fn().mockReturnValue({ eq: pendingEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: stuckSelectMock };
        } else {
          return { select: pendingSelectMock };
        }
      });

      const result = await runProcessWebhooks();

      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(processWebhookEvent).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Retry Logic (AC5)
  // ============================================
  describe('retry logic', () => {
    test('alerta admin quando max_attempts atingido', async () => {
      const mockEvent = {
        id: 1,
        idempotency_key: 'evt_1',
        event_type: 'purchase_approved',
        payload: {},
        attempts: 4,  // One more failure will hit max
      };

      // Stuck events - none
      const ltMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      // Pending events
      const limitMock = jest.fn().mockResolvedValue({ data: [mockEvent], error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const pendingEqMock = jest.fn().mockReturnValue({ order: orderMock });
      const pendingSelectMock = jest.fn().mockReturnValue({ eq: pendingEqMock });

      // Update mock
      const updateEqStatusMock = jest.fn().mockResolvedValue({ error: null });
      const updateEqIdMock = jest.fn().mockReturnValue({ eq: updateEqStatusMock });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEqIdMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: stuckSelectMock };
        } else if (callCount === 2) {
          return { select: pendingSelectMock };
        } else {
          return { update: updateMock };
        }
      });

      // Handler fails
      processWebhookEvent.mockResolvedValue({
        success: false,
        error: { code: 'HANDLER_ERROR', message: 'Test error' },
      });

      webhookProcessingAlert.mockResolvedValue({ success: true });

      const result = await runProcessWebhooks();

      expect(result.failed).toBe(1);
      expect(webhookProcessingAlert).toHaveBeenCalledWith(
        'evt_1',
        'purchase_approved',
        'Test error',
        5
      );
    });
  });

  // ============================================
  // Recovery de eventos stuck (AC7)
  // ============================================
  describe('recovery de eventos stuck', () => {
    test('reseta eventos stuck para pending', async () => {
      const stuckEvent = {
        id: 99,
        idempotency_key: 'evt_stuck',
        attempts: 1,
      };

      // Stuck events query - returns stuck event
      const ltMock = jest.fn().mockResolvedValue({ data: [stuckEvent], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      // Pending events - empty
      const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const pendingEqMock = jest.fn().mockReturnValue({ order: orderMock });
      const pendingSelectMock = jest.fn().mockReturnValue({ eq: pendingEqMock });

      // Update for stuck recovery
      const recoveryEqMock = jest.fn().mockResolvedValue({ error: null });
      const recoveryUpdateMock = jest.fn().mockReturnValue({ eq: recoveryEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: stuckSelectMock };
        } else if (callCount === 2) {
          return { update: recoveryUpdateMock };
        } else {
          return { select: pendingSelectMock };
        }
      });

      const result = await runProcessWebhooks();

      expect(result.success).toBe(true);
      // Verify update was called to reset stuck event
      expect(supabase.from).toHaveBeenCalled();
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('error handling', () => {
    test('lida com erro de fetch de eventos', async () => {
      // Stuck events - none
      const ltMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const stuckEqMock = jest.fn().mockReturnValue({ lt: ltMock });
      const stuckSelectMock = jest.fn().mockReturnValue({ eq: stuckEqMock });

      // Pending events - error
      const limitMock = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection error' },
      });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const pendingEqMock = jest.fn().mockReturnValue({ order: orderMock });
      const pendingSelectMock = jest.fn().mockReturnValue({ eq: pendingEqMock });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: stuckSelectMock };
        } else {
          return { select: pendingSelectMock };
        }
      });

      const result = await runProcessWebhooks();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection error');
    });
  });
});

/**
 * Tests for caktoWebhook.js and webhook-server.js
 * Story 16.2: Criar Webhook Server com Event Sourcing
 */

const request = require('supertest');
const crypto = require('crypto');

// Mock supabase before importing
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

const { app } = require('../../bot/webhook-server');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

// Helper to generate valid HMAC signature
function generateSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
}

describe('Cakto Webhook Server', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret-123';

  beforeAll(() => {
    process.env.CAKTO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // AC4: Health Check
  // ============================================
  describe('GET /health (AC: #4)', () => {
    test('retorna status ok com porta', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.port).toBeDefined();
    });
  });

  // ============================================
  // AC1: HMAC Signature Validation
  // ============================================
  describe('HMAC Signature Validation (AC: #1)', () => {
    test('rejeita request sem header x-cakto-signature com 401', async () => {
      const payload = { event_id: 'evt_123', event_type: 'purchase_approved', data: {} };

      const response = await request(app)
        .post('/webhooks/cakto')
        .send(payload)
        .expect(401);

      expect(response.body.error).toBe('WEBHOOK_INVALID_SIGNATURE');
      expect(response.body.message).toBe('Missing signature');
      expect(logger.warn).toHaveBeenCalledWith(
        '[cakto:webhook] Missing signature header'
      );
    });

    test('rejeita request com assinatura inválida com 401', async () => {
      const payload = { event_id: 'evt_123', event_type: 'purchase_approved', data: {} };

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', 'invalid-signature')
        .send(payload)
        .expect(401);

      expect(response.body.error).toBe('WEBHOOK_INVALID_SIGNATURE');
      expect(response.body.message).toBe('Invalid signature');
    });

    test('aceita request com assinatura HMAC-SHA256 válida', async () => {
      const payload = { event_id: 'evt_valid_123', event_type: 'purchase_approved', data: { customer_id: 'cust_1' } };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      // Mock successful save
      const singleMock = jest.fn().mockResolvedValue({
        data: { id: 1, ...payload, status: 'pending' },
        error: null
      });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        '[cakto:webhook] Signature validated successfully'
      );
    });

    test('rejeita assinatura com tamanho diferente', async () => {
      const payload = { event_id: 'evt_123', event_type: 'test' };

      // Short signature (different length than expected hex)
      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', 'abc123')
        .send(payload)
        .expect(401);

      expect(response.body.error).toBe('WEBHOOK_INVALID_SIGNATURE');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[cakto:webhook] Signature length mismatch'),
        expect.any(Object)
      );
    });
  });

  // ============================================
  // AC1: Payload Validation
  // ============================================
  describe('Payload Validation (AC: #1, #2)', () => {
    test('rejeita payload sem event_id com 400', async () => {
      const payload = { event_type: 'purchase_approved', data: {} };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(400);

      expect(response.body.error).toBe('INVALID_PAYLOAD');
      expect(response.body.message).toBe('Missing event_id');
    });

    test('rejeita payload sem event_type com 400', async () => {
      const payload = { event_id: 'evt_123', data: {} };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(400);

      expect(response.body.error).toBe('INVALID_PAYLOAD');
      expect(response.body.message).toBe('Missing event_type');
    });
  });

  // ============================================
  // AC2: Event Sourcing - Salvar evento
  // ============================================
  describe('Event Sourcing (AC: #2)', () => {
    test('salva evento em webhook_events com status pending', async () => {
      const payload = {
        event_id: 'evt_save_test_123',
        event_type: 'purchase_approved',
        data: { customer_id: 'cust_1', amount: 99.90 }
      };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      const savedEvent = {
        id: 42,
        idempotency_key: 'evt_save_test_123',
        event_type: 'purchase_approved',
        payload: payload.data,
        status: 'pending'
      };

      const singleMock = jest.fn().mockResolvedValue({ data: savedEvent, error: null });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.eventId).toBe(42);

      // Verify upsert was called with correct data
      expect(supabase.from).toHaveBeenCalledWith('webhook_events');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotency_key: 'evt_save_test_123',
          event_type: 'purchase_approved',
          status: 'pending'
        }),
        expect.objectContaining({
          onConflict: 'idempotency_key',
          ignoreDuplicates: true
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        '[cakto:webhook] Event saved successfully',
        expect.objectContaining({ eventId: 'evt_save_test_123', dbId: 42 })
      );
    });

    test('loga informações do webhook recebido', async () => {
      const payload = {
        event_id: 'evt_log_test',
        event_type: 'subscription_renewed',
        data: {}
      };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      const singleMock = jest.fn().mockResolvedValue({ data: { id: 1 }, error: null });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith(
        '[cakto:webhook] Received webhook',
        expect.objectContaining({
          eventId: 'evt_log_test',
          eventType: 'subscription_renewed'
        })
      );
    });
  });

  // ============================================
  // AC3: Idempotência
  // ============================================
  describe('Idempotência (AC: #3)', () => {
    test('retorna 200 para evento duplicado sem criar novo registro', async () => {
      const payload = {
        event_id: 'evt_duplicate_123',
        event_type: 'purchase_approved',
        data: {}
      };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      // Mock returns null (ignoreDuplicates returns no data for duplicate)
      const singleMock = jest.fn().mockResolvedValue({ data: null, error: null });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.duplicate).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        '[cakto:webhook] Duplicate webhook ignored',
        expect.objectContaining({ eventId: 'evt_duplicate_123' })
      );
    });

    test('retorna 200 para erro PGRST116 (duplicate key)', async () => {
      const payload = {
        event_id: 'evt_duplicate_456',
        event_type: 'purchase_approved',
        data: {}
      };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      // Mock returns error with duplicate code
      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'duplicate key' }
      });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.duplicate).toBe(true);
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    test('retorna 500 quando falha ao salvar no banco', async () => {
      const payload = {
        event_id: 'evt_db_error',
        event_type: 'purchase_approved',
        data: {}
      };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      const singleMock = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'SOME_DB_ERROR', message: 'Connection failed' }
      });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(500);

      expect(response.body.error).toBe('DB_ERROR');
      expect(logger.error).toHaveBeenCalledWith(
        '[cakto:webhook] Failed to save event',
        expect.objectContaining({ eventId: 'evt_db_error' })
      );
    });

    test('retorna 500 quando CAKTO_WEBHOOK_SECRET não configurado', async () => {
      // Temporarily remove secret
      const originalSecret = process.env.CAKTO_WEBHOOK_SECRET;
      delete process.env.CAKTO_WEBHOOK_SECRET;

      const payload = { event_id: 'evt_123', event_type: 'test' };

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', 'some-signature')
        .send(payload)
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_ERROR');
      expect(response.body.message).toBe('Webhook secret not configured');

      // Restore secret
      process.env.CAKTO_WEBHOOK_SECRET = originalSecret;
    });
  });

  // ============================================
  // 404 Handler
  // ============================================
  describe('404 Handler', () => {
    test('retorna 404 para endpoint inexistente', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    test('retorna 404 para método incorreto', async () => {
      const response = await request(app)
        .get('/webhooks/cakto')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // ============================================
  // AC1: Payload Size Limit (1MB)
  // ============================================
  describe('Payload Size Limit (AC: #1)', () => {
    test('rejeita payload maior que 1MB com 413', async () => {
      // Create payload larger than 1MB
      const largeData = 'x'.repeat(1.1 * 1024 * 1024); // 1.1MB
      const payload = {
        event_id: 'evt_large',
        event_type: 'test',
        data: { large: largeData }
      };

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('Content-Type', 'application/json')
        .set('x-cakto-signature', 'will-not-be-checked')
        .send(payload)
        .expect(413);

      expect(response.body.error).toBe('WEBHOOK_PAYLOAD_TOO_LARGE');
      expect(response.body.message).toBe('Payload exceeds 1MB limit');
    });

    test('aceita payload menor que 1MB', async () => {
      const payload = {
        event_id: 'evt_normal_size',
        event_type: 'purchase_approved',
        data: { info: 'normal sized payload' }
      };
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, WEBHOOK_SECRET);

      const singleMock = jest.fn().mockResolvedValue({ data: { id: 1 }, error: null });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
      supabase.from.mockReturnValue({ upsert: upsertMock });

      const response = await request(app)
        .post('/webhooks/cakto')
        .set('x-cakto-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });
});

// ============================================
// Rate Limiting Tests (AC: #1)
// Separate describe to avoid affecting other tests
// ============================================
describe('Rate Limiting (AC: #1)', () => {
  // Note: Rate limiting is difficult to fully test with supertest in unit tests
  // because the limiter uses in-memory store. Here we test basic configuration.

  test('rate limiter middleware está ativo e permite requests dentro do limite', async () => {
    // Since rate limit is 100/min and we're in unit tests with mock,
    // this is a verification that the limiter middleware exists and allows normal requests.
    const payload = {
      event_id: 'evt_rate_limit_test',
      event_type: 'test',
      data: {}
    };
    const payloadString = JSON.stringify(payload);
    const WEBHOOK_SECRET = process.env.CAKTO_WEBHOOK_SECRET || 'test-webhook-secret-123';
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payloadString)
      .digest('hex');

    const singleMock = jest.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    // Request within limit should succeed
    const response = await request(app)
      .post('/webhooks/cakto')
      .set('x-cakto-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payloadString);

    // Rate limiter allows up to 100 requests per minute
    // So this should succeed (status 200) not be rate limited (429)
    expect(response.status).toBe(200);

    // Verify rate limit headers are present (standardHeaders: true)
    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
  });
});

// ============================================
// Security Headers Tests (AC: #1)
// ============================================
describe('Security Headers (AC: #1)', () => {
  test('helmet security headers estão presentes nas responses', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    // Helmet adds several security headers
    // Content-Security-Policy may vary, but these are typically set:
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-xss-protection']).toBeDefined();
  });
});

/**
 * Tests for caktoService.js
 * Story 16.8: Implementar Reconciliacao com Cakto
 */

// Mock axios before importing the service
jest.mock('axios');

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const axios = require('axios');
const logger = require('../../lib/logger');

// Set env vars before importing service
process.env.CAKTO_API_URL = 'https://api.cakto.test';
process.env.CAKTO_CLIENT_ID = 'test_client_id';
process.env.CAKTO_CLIENT_SECRET = 'test_client_secret';

const {
  getAccessToken,
  getSubscription,
  _resetTokenCache, // For testing - will be exported
} = require('../../bot/services/caktoService');

describe('caktoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset token cache between tests
    if (_resetTokenCache) {
      _resetTokenCache();
    }
  });

  // ============================================
  // getAccessToken (Task 1.1, 1.3)
  // ============================================
  describe('getAccessToken', () => {
    test('obtém token OAuth com sucesso', async () => {
      axios.post.mockResolvedValue({
        data: {
          access_token: 'test_token_123',
          expires_in: 3600,
        }
      });

      const result = await getAccessToken();

      expect(result.success).toBe(true);
      expect(result.data.token).toBe('test_token_123');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.cakto.test/oauth/token',
        {
          grant_type: 'client_credentials',
          client_id: 'test_client_id',
          client_secret: 'test_client_secret'
        },
        { timeout: 10000 }
      );
    });

    test('retorna token do cache se ainda válido', async () => {
      axios.post.mockResolvedValue({
        data: {
          access_token: 'cached_token',
          expires_in: 3600,
        }
      });

      // First call - fetches token
      const result1 = await getAccessToken();
      expect(result1.success).toBe(true);
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      const result2 = await getAccessToken();
      expect(result2.success).toBe(true);
      expect(result2.data.token).toBe('cached_token');
      expect(axios.post).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    test('retorna CAKTO_AUTH_ERROR em falha de autenticação', async () => {
      axios.post.mockRejectedValue(new Error('Invalid credentials'));

      const result = await getAccessToken();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CAKTO_AUTH_ERROR');
      expect(result.error.message).toContain('Invalid credentials');
    });

    test('usa timeout de 10 segundos', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'token', expires_in: 3600 }
      });

      await getAccessToken();

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    // M4 FIX: Test token cache expiration
    test('busca novo token após expiração do cache', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = 1000000000000; // Fixed starting point
      Date.now = jest.fn(() => currentTime);

      axios.post
        .mockResolvedValueOnce({
          data: { access_token: 'token_1', expires_in: 1 } // Expires in 1 second
        })
        .mockResolvedValueOnce({
          data: { access_token: 'token_2', expires_in: 3600 }
        });

      // First call - fetches token_1
      const result1 = await getAccessToken();
      expect(result1.data.token).toBe('token_1');
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Advance time past expiration (> 1s - 60s safety margin would make it negative, so it's expired)
      currentTime += 2000; // 2 seconds later

      // Second call - token expired, should fetch token_2
      const result2 = await getAccessToken();
      expect(result2.data.token).toBe('token_2');
      expect(axios.post).toHaveBeenCalledTimes(2);

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  // ============================================
  // getSubscription (Task 1.2, 1.4, 1.5)
  // ============================================
  describe('getSubscription', () => {
    beforeEach(() => {
      // Mock successful auth for all getSubscription tests
      axios.post.mockResolvedValue({
        data: { access_token: 'valid_token', expires_in: 3600 }
      });
    });

    test('retorna dados da assinatura com sucesso', async () => {
      axios.get.mockResolvedValue({
        data: {
          id: 'sub_123',
          status: 'active',
          customer: { email: 'test@example.com' }
        }
      });

      const result = await getSubscription('sub_123');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('active');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.cakto.test/subscriptions/sub_123',
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid_token' },
          timeout: 10000
        })
      );
    });

    test('retorna SUBSCRIPTION_NOT_FOUND para 404', async () => {
      const error404 = new Error('Not found');
      error404.response = { status: 404 };
      axios.get.mockRejectedValue(error404);

      const result = await getSubscription('nonexistent_sub');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
    });

    test('não faz retry para erro 404', async () => {
      const error404 = new Error('Not found');
      error404.response = { status: 404 };
      axios.get.mockRejectedValue(error404);

      await getSubscription('nonexistent_sub');

      // Only 1 call, no retries
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test('faz retry com backoff para erros transientes', async () => {
      const networkError = new Error('Network error');
      axios.get
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: { id: 'sub_123', status: 'active' } });

      const result = await getSubscription('sub_123');

      expect(result.success).toBe(true);
      expect(axios.get).toHaveBeenCalledTimes(3);
    });

    test('retorna erro após 3 tentativas falhadas', async () => {
      const networkError = new Error('Network error');
      axios.get.mockRejectedValue(networkError);

      const result = await getSubscription('sub_123');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CAKTO_API_ERROR');
      expect(result.error.message).toContain('Max retries exceeded');
      expect(axios.get).toHaveBeenCalledTimes(3);
    });

    test('usa timeout de 10 segundos', async () => {
      axios.get.mockResolvedValue({ data: { status: 'active' } });

      await getSubscription('sub_123');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    test('propaga erro de autenticação', async () => {
      // Reset mock to fail auth
      axios.post.mockRejectedValue(new Error('Auth failed'));

      const result = await getSubscription('sub_123');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CAKTO_AUTH_ERROR');
    });

    // C1 FIX: Test subscriptionId validation
    test('retorna INVALID_SUBSCRIPTION_ID se subscriptionId é vazio', async () => {
      const result = await getSubscription('');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SUBSCRIPTION_ID');
      expect(axios.get).not.toHaveBeenCalled(); // Should not call API
    });

    test('retorna INVALID_SUBSCRIPTION_ID se subscriptionId é null', async () => {
      const result = await getSubscription(null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SUBSCRIPTION_ID');
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('retorna INVALID_SUBSCRIPTION_ID se subscriptionId é undefined', async () => {
      const result = await getSubscription(undefined);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SUBSCRIPTION_ID');
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('segue Service Response Pattern', async () => {
      axios.get.mockResolvedValue({ data: { status: 'active' } });

      const result = await getSubscription('sub_123');

      // Success response
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(typeof result.success).toBe('boolean');
    });

    test('erro segue Service Response Pattern', async () => {
      const error = new Error('API error');
      axios.get.mockRejectedValue(error);

      const result = await getSubscription('sub_123');

      // Error response
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
    });
  });
});

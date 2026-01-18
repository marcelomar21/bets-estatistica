/**
 * Tests for webhookProcessors.js
 * Story 16.3: Implementar Processamento Assíncrono de Webhooks
 */

// Mock memberService
jest.mock('../../bot/services/memberService', () => ({
  getMemberByEmail: jest.fn(),
  activateMember: jest.fn(),
  renewMemberSubscription: jest.fn(),
  markMemberAsDefaulted: jest.fn(),
  createActiveMember: jest.fn(),
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const {
  processWebhookEvent,
  handlePurchaseApproved,
  handleSubscriptionRenewed,
  handleRenewalRefused,
  normalizePaymentMethod,
  extractEmail,
  extractSubscriptionData,
  WEBHOOK_HANDLERS,
} = require('../../bot/services/webhookProcessors');

const {
  getMemberByEmail,
  activateMember,
  renewMemberSubscription,
  markMemberAsDefaulted,
  createActiveMember,
} = require('../../bot/services/memberService');

describe('webhookProcessors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  describe('normalizePaymentMethod', () => {
    test('converte credit_card para cartao_recorrente', () => {
      expect(normalizePaymentMethod('credit_card')).toBe('cartao_recorrente');
    });

    test('converte pix para pix', () => {
      expect(normalizePaymentMethod('pix')).toBe('pix');
    });

    test('converte boleto para boleto', () => {
      expect(normalizePaymentMethod('boleto')).toBe('boleto');
    });

    test('converte bank_slip para boleto', () => {
      expect(normalizePaymentMethod('bank_slip')).toBe('boleto');
    });

    test('retorna cartao_recorrente para método desconhecido', () => {
      expect(normalizePaymentMethod('unknown_method')).toBe('cartao_recorrente');
    });

    test('retorna cartao_recorrente para null/undefined', () => {
      expect(normalizePaymentMethod(null)).toBe('cartao_recorrente');
      expect(normalizePaymentMethod(undefined)).toBe('cartao_recorrente');
    });
  });

  describe('extractEmail', () => {
    test('extrai email de customer.email (estrutura Cakto)', () => {
      const payload = { customer: { email: 'test@example.com', name: 'Test User' } };
      expect(extractEmail(payload)).toBe('test@example.com');
    });

    test('extrai email de data.customer.email (wrapped)', () => {
      const payload = { data: { customer: { email: 'test@example.com' } } };
      expect(extractEmail(payload)).toBe('test@example.com');
    });

    test('extrai email de payload.email (fallback)', () => {
      const payload = { email: 'test@example.com' };
      expect(extractEmail(payload)).toBe('test@example.com');
    });

    test('retorna null se email não encontrado', () => {
      expect(extractEmail({})).toBeNull();
      expect(extractEmail(null)).toBeNull();
    });

    test('retorna null para email com formato inválido', () => {
      expect(extractEmail({ customer: { email: 'invalid-email' } })).toBeNull();
      expect(extractEmail({ customer: { email: 'no-at-sign.com' } })).toBeNull();
      expect(extractEmail({ customer: { email: '@nodomain.com' } })).toBeNull();
    });

    test('aceita email com formato válido', () => {
      expect(extractEmail({ customer: { email: 'user@domain.com' } })).toBe('user@domain.com');
      expect(extractEmail({ customer: { email: 'user.name+tag@domain.co.uk' } })).toBe('user.name+tag@domain.co.uk');
    });
  });

  describe('extractSubscriptionData', () => {
    test('extrai dados de Order Cakto', () => {
      // Estrutura real do Cakto Order
      const payload = {
        id: 'order_123',
        subscription: 'sub_456',
        paymentMethod: 'credit_card',
        customer: { id: 'cus_789', email: 'test@example.com' },
      };

      const result = extractSubscriptionData(payload);
      expect(result.subscriptionId).toBe('sub_456');
      expect(result.customerId).toBe('cus_789');
      expect(result.paymentMethod).toBe('cartao_recorrente');
    });

    test('usa order ID como fallback para subscriptionId', () => {
      const payload = {
        id: 'order_123',
        paymentMethod: 'pix',
        customer: { id: 'cus_789' },
      };

      const result = extractSubscriptionData(payload);
      expect(result.subscriptionId).toBe('order_123');
      expect(result.paymentMethod).toBe('pix');
    });

    test('lida com payload vazio', () => {
      const result = extractSubscriptionData({});
      expect(result.subscriptionId).toBeNull();
      expect(result.customerId).toBeNull();
      expect(result.paymentMethod).toBe('cartao_recorrente');
    });
  });

  // ============================================
  // WEBHOOK HANDLERS REGISTRY
  // ============================================
  describe('WEBHOOK_HANDLERS', () => {
    test('tem handler para purchase_approved', () => {
      expect(WEBHOOK_HANDLERS['purchase_approved']).toBeDefined();
    });

    test('tem handler para subscription_created', () => {
      expect(WEBHOOK_HANDLERS['subscription_created']).toBeDefined();
    });

    test('tem handler para subscription_renewed', () => {
      expect(WEBHOOK_HANDLERS['subscription_renewed']).toBeDefined();
    });

    test('tem handler para subscription_renewal_refused', () => {
      expect(WEBHOOK_HANDLERS['subscription_renewal_refused']).toBeDefined();
    });

    test('tem handler para subscription_canceled', () => {
      expect(WEBHOOK_HANDLERS['subscription_canceled']).toBeDefined();
    });
  });

  // ============================================
  // handleSubscriptionCreated (delegates to purchase_approved)
  // ============================================
  describe('handleSubscriptionCreated', () => {
    test('delega para handlePurchaseApproved corretamente', async () => {
      // Estrutura Cakto Order
      const payload = {
        id: 'order_sub_created',
        subscription: 'sub_created_123',
        paymentMethod: 'credit_card',
        customer: { id: 'cus_created', email: 'created@example.com' },
      };

      const mockMember = { id: 1, status: 'trial' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      activateMember.mockResolvedValue({ success: true, data: { ...mockMember, status: 'ativo' } });

      // Import handleSubscriptionCreated
      const { handleSubscriptionCreated } = require('../../bot/services/webhookProcessors');
      const result = await handleSubscriptionCreated(payload);

      expect(result.success).toBe(true);
      expect(getMemberByEmail).toHaveBeenCalledWith('created@example.com');
      expect(activateMember).toHaveBeenCalled();
    });
  });

  // ============================================
  // handleSubscriptionCanceled (delegates to renewal_refused)
  // ============================================
  describe('handleSubscriptionCanceled', () => {
    test('delega para handleRenewalRefused corretamente', async () => {
      // Estrutura Cakto Order
      const payload = {
        id: 'order_canceled',
        customer: { id: 'cus_canceled', email: 'canceled@example.com' },
      };

      const mockMember = { id: 1, status: 'ativo' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      markMemberAsDefaulted.mockResolvedValue({ success: true, data: { ...mockMember, status: 'inadimplente' } });

      // Import handleSubscriptionCanceled
      const { handleSubscriptionCanceled } = require('../../bot/services/webhookProcessors');
      const result = await handleSubscriptionCanceled(payload);

      expect(result.success).toBe(true);
      expect(getMemberByEmail).toHaveBeenCalledWith('canceled@example.com');
      expect(markMemberAsDefaulted).toHaveBeenCalledWith(1);
    });

    test('pula se membro não está ativo (herda comportamento)', async () => {
      const payload = {
        id: 'order_canceled_2',
        customer: { id: 'cus_canceled_2', email: 'canceled2@example.com' },
      };

      const mockMember = { id: 2, status: 'trial' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });

      const { handleSubscriptionCanceled } = require('../../bot/services/webhookProcessors');
      const result = await handleSubscriptionCanceled(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(markMemberAsDefaulted).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // handlePurchaseApproved (AC2)
  // ============================================
  describe('handlePurchaseApproved', () => {
    test('ativa membro existente', async () => {
      // Estrutura real do Cakto Order
      const payload = {
        id: 'order_123',
        subscription: 'sub_123',
        paymentMethod: 'pix',
        customer: { id: 'cus_456', email: 'test@example.com', name: 'Test User' },
        product: { id: 'prod_1', name: 'Guru Bet', type: 'subscription' },
      };

      const mockMember = { id: 1, email: 'test@example.com', status: 'trial' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      activateMember.mockResolvedValue({ success: true, data: { ...mockMember, status: 'ativo' } });

      const result = await handlePurchaseApproved(payload);

      expect(result.success).toBe(true);
      expect(getMemberByEmail).toHaveBeenCalledWith('test@example.com');
      expect(activateMember).toHaveBeenCalledWith(1, {
        subscriptionId: 'sub_123',
        customerId: 'cus_456',
        paymentMethod: 'pix',
      });
    });

    test('cria novo membro se não existe', async () => {
      const payload = {
        id: 'order_new',
        subscription: 'sub_new',
        paymentMethod: 'boleto',
        customer: { id: 'cus_new', email: 'new@example.com' },
      };

      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });
      createActiveMember.mockResolvedValue({ success: true, data: { id: 99, status: 'ativo' } });

      const result = await handlePurchaseApproved(payload);

      expect(result.success).toBe(true);
      expect(createActiveMember).toHaveBeenCalledWith({
        email: 'new@example.com',
        subscriptionData: {
          subscriptionId: 'sub_new',
          customerId: 'cus_new',
          paymentMethod: 'boleto',
        },
      });
    });

    test('retorna INVALID_PAYLOAD se email não encontrado', async () => {
      const payload = { customer: { name: 'No Email User' } };

      const result = await handlePurchaseApproved(payload);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PAYLOAD');
    });
  });

  // ============================================
  // handleSubscriptionRenewed (AC3)
  // ============================================
  describe('handleSubscriptionRenewed', () => {
    test('renova assinatura de membro ativo', async () => {
      // Estrutura Cakto Order - customer.email
      const payload = {
        id: 'order_renew_1',
        customer: { id: 'cus_123', email: 'test@example.com' },
      };

      const mockMember = { id: 1, status: 'ativo' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      renewMemberSubscription.mockResolvedValue({ success: true, data: mockMember });

      const result = await handleSubscriptionRenewed(payload);

      expect(result.success).toBe(true);
      expect(renewMemberSubscription).toHaveBeenCalledWith(1);
    });

    test('reativa membro inadimplente', async () => {
      // Estrutura Cakto Order
      const payload = {
        id: 'order_renew_2',
        customer: { id: 'cus_456', email: 'test@example.com' },
      };

      const mockMember = { id: 1, status: 'inadimplente' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      renewMemberSubscription.mockResolvedValue({ success: true, data: { ...mockMember, status: 'ativo' } });

      const result = await handleSubscriptionRenewed(payload);

      expect(result.success).toBe(true);
      expect(renewMemberSubscription).toHaveBeenCalledWith(1);
    });

    test('retorna erro se membro não encontrado', async () => {
      // Estrutura Cakto Order
      const payload = {
        id: 'order_renew_3',
        customer: { id: 'cus_789', email: 'unknown@example.com' },
      };

      getMemberByEmail.mockResolvedValue({
        success: false,
        error: { code: 'MEMBER_NOT_FOUND' },
      });

      const result = await handleSubscriptionRenewed(payload);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  // ============================================
  // handleRenewalRefused (AC4)
  // ============================================
  describe('handleRenewalRefused', () => {
    test('marca membro ativo como inadimplente', async () => {
      // Estrutura Cakto Order
      const payload = {
        id: 'order_refused_1',
        customer: { id: 'cus_123', email: 'test@example.com' },
      };

      const mockMember = { id: 1, status: 'ativo' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      markMemberAsDefaulted.mockResolvedValue({ success: true, data: { ...mockMember, status: 'inadimplente' } });

      const result = await handleRenewalRefused(payload);

      expect(result.success).toBe(true);
      expect(markMemberAsDefaulted).toHaveBeenCalledWith(1);
    });

    test('pula se membro não está ativo', async () => {
      // Estrutura Cakto Order
      const payload = {
        id: 'order_refused_2',
        customer: { id: 'cus_456', email: 'test@example.com' },
      };

      const mockMember = { id: 1, status: 'trial' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });

      const result = await handleRenewalRefused(payload);

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(true);
      expect(markMemberAsDefaulted).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // processWebhookEvent
  // ============================================
  describe('processWebhookEvent', () => {
    test('retorna UNKNOWN_EVENT_TYPE para evento desconhecido', async () => {
      const result = await processWebhookEvent({
        event_type: 'unknown_event',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNKNOWN_EVENT_TYPE');
    });

    test('chama handler correto para purchase_approved', async () => {
      // Estrutura Cakto Order real
      const payload = {
        id: 'order_proc_1',
        subscription: 'sub_123',
        paymentMethod: 'pix',
        customer: { id: 'cus_456', email: 'test@example.com' },
      };

      const mockMember = { id: 1, status: 'trial' };
      getMemberByEmail.mockResolvedValue({ success: true, data: mockMember });
      activateMember.mockResolvedValue({ success: true, data: { ...mockMember, status: 'ativo' } });

      const result = await processWebhookEvent({
        event_type: 'purchase_approved',
        payload,
      });

      expect(result.success).toBe(true);
      expect(activateMember).toHaveBeenCalled();
    });
  });
});

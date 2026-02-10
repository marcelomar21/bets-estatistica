import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubscriptionPlan } from '../mercadopago';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('createSubscriptionPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'test-token';
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('returns error when access token is not configured', async () => {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;

    const result = await createSubscriptionPlan('Test Group', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns error when price is zero or negative', async () => {
    const resultZero = await createSubscriptionPlan('Test', 'group-1', 0);
    expect(resultZero).toEqual({ success: false, error: 'Preço deve ser maior que zero' });

    const resultNeg = await createSubscriptionPlan('Test', 'group-1', -5);
    expect(resultNeg).toEqual({ success: false, error: 'Preço deve ser maior que zero' });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates preapproval plan with correct endpoint, payload and return shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'plan-123', init_point: 'https://mp.com/subscriptions/checkout?preapproval_plan_id=plan-123' }),
    });

    const result = await createSubscriptionPlan('Canal do João', 'group-uuid', 49.9);

    expect(result).toEqual({
      success: true,
      data: { planId: 'plan-123', checkoutUrl: 'https://mp.com/subscriptions/checkout?preapproval_plan_id=plan-123' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/preapproval_plan',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.external_reference).toBe('group-uuid');
    expect(body.reason).toBe('Assinatura Canal do João');
    expect(body.auto_recurring.frequency).toBe(1);
    expect(body.auto_recurring.frequency_type).toBe('months');
    expect(body.auto_recurring.transaction_amount).toBe(49.9);
    expect(body.auto_recurring.currency_id).toBe('BRL');
    expect(body.auto_recurring.free_trial).toEqual({
      frequency: 7,
      frequency_type: 'days',
    });
    expect(body.back_url).toBeUndefined();
  });

  it('includes back_url when NEXT_PUBLIC_APP_URL is set', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://admin.example.com';
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'plan-1', init_point: 'https://mp.com/checkout' }),
    });

    await createSubscriptionPlan('Test', 'group-uuid', 29.9);

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.back_url).toBe('https://admin.example.com/groups/group-uuid');
  });

  it('returns clear invalid credentials error when API returns 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'unauthorized' }),
    });

    const result = await createSubscriptionPlan('Test', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'Credenciais inválidas do Mercado Pago' });
  });

  it('returns retryable error on 500 without automatic retry (prevents duplicate plans)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'internal error' }),
    });

    const result = await createSubscriptionPlan('Test', 'group-1', 29.9);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: false, error: 'Erro temporário do Mercado Pago. Tente novamente.' });
  });

  it('returns MP error message for non-401/non-500 errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid amount' }),
    });

    const result = await createSubscriptionPlan('Test', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'Invalid amount' });
  });

  it('returns fallback error when response.json() fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await createSubscriptionPlan('Test', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'Erro ao criar plano de assinatura no Mercado Pago' });
  });

  it('returns timeout error on fetch timeout', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));

    const result = await createSubscriptionPlan('Test', 'group-1', 29.9);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: false, error: 'Timeout ao conectar com Mercado Pago' });
  });

  it('returns generic error for non-timeout fetch failures', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await createSubscriptionPlan('Test', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
  });
});

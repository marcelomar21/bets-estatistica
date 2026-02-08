import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCheckoutPreference } from '../mercadopago';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('createCheckoutPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'test-token';
  });

  it('returns error when access token is not configured', async () => {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;

    const result = await createCheckoutPreference('Test Group', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates preference with correct data and price', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'pref-123', init_point: 'https://mp.com/checkout/pref-123' }),
    });

    const result = await createCheckoutPreference('Canal do João', 'group-uuid', 49.9);

    expect(result).toEqual({
      success: true,
      data: { id: 'pref-123', checkout_url: 'https://mp.com/checkout/pref-123' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/checkout/preferences',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.external_reference).toBe('group-uuid');
    expect(body.items[0].title).toBe('Assinatura Canal do João');
    expect(body.items[0].unit_price).toBe(49.9);
  });

  it('returns error when API returns error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Bad request' }),
    });

    const result = await createCheckoutPreference('Test', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'Bad request' });
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = await createCheckoutPreference('Test', 'group-1', 29.9);

    expect(result).toEqual({ success: false, error: 'Connection refused' });
  });
});

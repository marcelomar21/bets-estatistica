import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBotService } from '../render';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const defaultOptions = {
  groupId: 'group-uuid',
  botToken: 'bot-token-123',
  groupName: 'Canal do João',
  telegramGroupId: -1001234567890,
  checkoutUrl: 'http://mp.com/checkout',
};

describe('createBotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RENDER_API_KEY = 'test-key';
    process.env.RENDER_REPO_URL = 'https://github.com/user/bets-estatistica';
    process.env.RENDER_OWNER_ID = 'tea-test123';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
  });

  it('returns error when API key is not configured', async () => {
    delete process.env.RENDER_API_KEY;

    const result = await createBotService(defaultOptions);

    expect(result).toEqual({ success: false, error: 'RENDER_API_KEY não configurado' });
  });

  it('returns error when repo URL is not configured', async () => {
    delete process.env.RENDER_REPO_URL;

    const result = await createBotService(defaultOptions);

    expect(result).toEqual({ success: false, error: 'RENDER_REPO_URL não configurado' });
  });

  it('returns error when owner ID is not configured', async () => {
    delete process.env.RENDER_OWNER_ID;

    const result = await createBotService(defaultOptions);

    expect(result).toEqual({ success: false, error: 'RENDER_OWNER_ID não configurado' });
  });

  it('creates service with correct data including telegram env vars', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ service: { id: 'srv-456' } }),
    });

    const result = await createBotService(defaultOptions);

    expect(result).toEqual({
      success: true,
      data: { service_id: 'srv-456' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.render.com/v1/services',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.type).toBe('background_worker');
    expect(body.ownerId).toBe('tea-test123');
    expect(body.repo).toBe('https://github.com/user/bets-estatistica');
    expect(body.branch).toBe('master');
    expect(body.serviceDetails).toEqual({
      env: 'node',
      plan: 'starter',
      region: 'oregon',
      envSpecificDetails: {
        buildCommand: 'npm install',
        startCommand: 'node bot/server.js',
      },
    });
    expect(body.envVars).toEqual(
      expect.arrayContaining([
        { key: 'GROUP_ID', value: 'group-uuid' },
        { key: 'TELEGRAM_BOT_TOKEN', value: 'bot-token-123' },
        { key: 'TELEGRAM_PUBLIC_GROUP_ID', value: '-1001234567890' },
        { key: 'TELEGRAM_ADMIN_GROUP_ID', value: '-1001234567890' },
        { key: 'NODE_ENV', value: 'production' },
        { key: 'MP_CHECKOUT_URL', value: 'http://mp.com/checkout' },
      ]),
    );
  });

  it('omits MP_CHECKOUT_URL when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ service: { id: 'srv-456' } }),
    });

    await createBotService({ ...defaultOptions, checkoutUrl: null });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    const keys = body.envVars.map((v: { key: string }) => v.key);
    expect(keys).not.toContain('MP_CHECKOUT_URL');
  });

  it('returns error when API returns error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal error' }),
    });

    const result = await createBotService(defaultOptions);

    expect(result).toEqual({ success: false, error: 'Internal error' });
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await createBotService(defaultOptions);

    expect(result).toEqual({ success: false, error: 'Network error' });
  });
});

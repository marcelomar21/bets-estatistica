import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBotService } from '../render';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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

    const result = await createBotService('group-1', 'bot-token', 'Test');

    expect(result).toEqual({ success: false, error: 'RENDER_API_KEY não configurado' });
  });

  it('returns error when repo URL is not configured', async () => {
    delete process.env.RENDER_REPO_URL;

    const result = await createBotService('group-1', 'bot-token', 'Test');

    expect(result).toEqual({ success: false, error: 'RENDER_REPO_URL não configurado' });
  });

  it('returns error when owner ID is not configured', async () => {
    delete process.env.RENDER_OWNER_ID;

    const result = await createBotService('group-1', 'bot-token', 'Test');

    expect(result).toEqual({ success: false, error: 'RENDER_OWNER_ID não configurado' });
  });

  it('creates service with correct data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ service: { id: 'srv-456' } }),
    });

    const result = await createBotService('group-uuid', 'bot-token-123', 'Canal do João');

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
    expect(body.ownerId).toBe('tea-test123');
    expect(body.repo).toBe('https://github.com/user/bets-estatistica');
    expect(body.envVars).toEqual(
      expect.arrayContaining([
        { key: 'GROUP_ID', value: 'group-uuid' },
        { key: 'TELEGRAM_BOT_TOKEN', value: 'bot-token-123' },
      ]),
    );
  });

  it('returns error when API returns error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal error' }),
    });

    const result = await createBotService('group-1', 'token', 'Test');

    expect(result).toEqual({ success: false, error: 'Internal error' });
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await createBotService('group-1', 'token', 'Test');

    expect(result).toEqual({ success: false, error: 'Network error' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBotToken } from '../telegram';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('validateBotToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with username for valid token', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, result: { id: 123, is_bot: true, username: 'test_bot' } }),
    });

    const result = await validateBotToken('valid-token');

    expect(result).toEqual({ success: true, data: { username: 'test_bot' } });
    expect(mockFetch).toHaveBeenCalledWith('https://api.telegram.org/botvalid-token/getMe');
  });

  it('returns error for invalid token (401)', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error_code: 401, description: 'Unauthorized' }),
    });

    const result = await validateBotToken('invalid-token');

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns error for invalid token without description', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: false }),
    });

    const result = await validateBotToken('bad-token');

    expect(result).toEqual({ success: false, error: 'Token inválido' });
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await validateBotToken('token');

    expect(result).toEqual({ success: false, error: 'Network error' });
  });
});

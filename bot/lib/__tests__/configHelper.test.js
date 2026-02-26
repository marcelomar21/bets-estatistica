/**
 * Tests: configHelper.js - Centralized config reading with cache
 * Story 2.1: Feature Flag TRIAL_MODE e Helper getConfig
 */

jest.mock('../../../lib/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const mockSingle = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  },
}));

describe('configHelper', () => {
  let getConfig;
  let reloadConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module to clear the in-memory cache between tests
    jest.resetModules();

    // Re-mock after resetModules
    jest.mock('../../../lib/logger', () => ({
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    }));
    jest.mock('../../../lib/supabase', () => ({
      supabase: {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      },
    }));

    const mod = require('../configHelper');
    getConfig = mod.getConfig;
    reloadConfig = mod.reloadConfig;
  });

  it('returns value from DB when key exists', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'internal' }, error: null });

    const result = await getConfig('TRIAL_MODE', 'mercadopago');
    expect(result).toBe('internal');
  });

  it('returns defaultValue when key not found (PGRST116)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });

    const result = await getConfig('NONEXISTENT', 'fallback');
    expect(result).toBe('fallback');
  });

  it('returns defaultValue when data is null with no error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const result = await getConfig('MISSING_KEY', 'default_val');
    expect(result).toBe('default_val');
  });

  it('returns defaultValue on DB error (non-PGRST116)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'INTERNAL', message: 'DB down' } });

    const result = await getConfig('TRIAL_MODE', 'mercadopago');
    expect(result).toBe('mercadopago');
  });

  it('returns defaultValue on exception', async () => {
    mockSingle.mockRejectedValue(new Error('Network error'));

    const result = await getConfig('TRIAL_MODE', 'mercadopago');
    expect(result).toBe('mercadopago');
  });

  it('uses cache on second call (no duplicate DB query)', async () => {
    mockSingle.mockResolvedValue({ data: { value: 'cached_val' }, error: null });

    const result1 = await getConfig('CACHE_KEY', 'default');
    const result2 = await getConfig('CACHE_KEY', 'default');

    expect(result1).toBe('cached_val');
    expect(result2).toBe('cached_val');
    // DB called only once (second call is cache hit)
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });

  it('reloadConfig clears cache, forcing next call to query DB', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { value: 'old_val' }, error: null })
      .mockResolvedValueOnce({ data: { value: 'new_val' }, error: null });

    const result1 = await getConfig('RELOAD_KEY', 'default');
    expect(result1).toBe('old_val');

    reloadConfig();

    const result2 = await getConfig('RELOAD_KEY', 'default');
    expect(result2).toBe('new_val');
    expect(mockSingle).toHaveBeenCalledTimes(2);
  });

  it('expired cache entry triggers DB re-query', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { value: 'first' }, error: null })
      .mockResolvedValueOnce({ data: { value: 'second' }, error: null });

    const result1 = await getConfig('TTL_KEY', 'default', { ttlMs: 1 });
    expect(result1).toBe('first');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 10));

    const result2 = await getConfig('TTL_KEY', 'default', { ttlMs: 1 });
    expect(result2).toBe('second');
    expect(mockSingle).toHaveBeenCalledTimes(2);
  });
});

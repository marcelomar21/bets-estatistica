/**
 * Jest global setup
 * Mocks supabase when env vars are not available (CI environment)
 */

// If no SUPABASE_URL, mock the supabase module globally
if (!process.env.SUPABASE_URL) {
  jest.mock('./lib/supabase', () => ({
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: null, error: null })),
            maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
            limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          in: jest.fn(() => ({
            not: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          gte: jest.fn(() => ({
            lte: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
          order: jest.fn(() => ({
            limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: { id: 1 }, error: null })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      rpc: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    },
    testConnection: jest.fn(() => Promise.resolve({ success: true, data: { connected: true } })),
  }));
}

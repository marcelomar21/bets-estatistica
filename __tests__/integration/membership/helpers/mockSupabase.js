/**
 * Shared Mock Utilities for Supabase
 * Story 17.2: Adicionar Testes de Integração para Fluxo de Membership
 *
 * Provides reusable mock utilities for testing Supabase interactions.
 * Used by: membershipFlow.test.js, kickRejoinFlow.test.js, webhookProcessingFlow.test.js
 */

/**
 * Create a chainable mock query builder that mimics Supabase's query interface.
 * All chainable methods return the builder itself, allowing method chaining.
 *
 * @param {*} defaultData - Default data to return from single/maybeSingle methods
 * @returns {Object} Chainable mock query builder
 *
 * @example
 * const builder = createMockQueryBuilder({ id: 1, name: 'test' });
 * // Use in mock: mockSupabase.from.mockReturnValue(builder);
 */
function createMockQueryBuilder(defaultData = null) {
  const chainable = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'is', 'in', 'order', 'limit'];

  methods.forEach(method => {
    chainable[method] = jest.fn().mockReturnValue(chainable);
  });

  chainable.single = jest.fn().mockResolvedValue({ data: defaultData, error: null });
  chainable.maybeSingle = jest.fn().mockResolvedValue({ data: defaultData, error: null });

  return chainable;
}

/**
 * Create a mock Supabase client with a `from` method.
 *
 * @returns {Object} Mock Supabase client
 *
 * @example
 * const mockSupabase = createMockSupabase();
 * jest.mock('../../../lib/supabase', () => ({ supabase: mockSupabase }));
 */
function createMockSupabase() {
  return {
    from: jest.fn(() => createMockQueryBuilder()),
  };
}

module.exports = {
  createMockQueryBuilder,
  createMockSupabase,
};

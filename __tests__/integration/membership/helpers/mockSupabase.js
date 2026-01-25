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
 * Tracks query parameters to allow different responses based on filters.
 *
 * @param {*} defaultData - Default data to return from single/maybeSingle methods
 * @param {Object} options - Configuration options
 * @param {Object} options.dataByFilter - Map of filter conditions to data responses
 *   Example: { 'email:test@example.com': userData, 'id:123': otherData }
 * @returns {Object} Chainable mock query builder with query tracking
 *
 * @example
 * const builder = createMockQueryBuilder({ id: 1, name: 'test' });
 * // Use in mock: mockSupabase.from.mockReturnValue(builder);
 *
 * @example
 * // With filter-based responses:
 * const builder = createMockQueryBuilder(null, {
 *   dataByFilter: {
 *     'email:user1@test.com': { id: 1, email: 'user1@test.com' },
 *     'email:user2@test.com': { id: 2, email: 'user2@test.com' },
 *   }
 * });
 */
function createMockQueryBuilder(defaultData = null, options = {}) {
  const { dataByFilter = {} } = options;
  const chainable = {};
  
  // Track applied filters for conditional responses
  chainable._filters = [];
  chainable._dataByFilter = dataByFilter;
  
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'is', 'in', 'order', 'limit'];

  methods.forEach(method => {
    chainable[method] = jest.fn().mockReturnValue(chainable);
  });

  // eq method tracks the filter condition
  chainable.eq = jest.fn().mockImplementation((field, value) => {
    chainable._filters.push({ field, value });
    return chainable;
  });

  // Helper to get data based on current filters
  const getFilteredData = () => {
    for (const filter of chainable._filters) {
      const key = `${filter.field}:${filter.value}`;
      if (dataByFilter[key] !== undefined) {
        return dataByFilter[key];
      }
    }
    return defaultData;
  };

  chainable.single = jest.fn().mockImplementation(() => {
    const data = getFilteredData();
    return Promise.resolve({ data, error: null });
  });
  
  chainable.maybeSingle = jest.fn().mockImplementation(() => {
    const data = getFilteredData();
    return Promise.resolve({ data, error: null });
  });

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

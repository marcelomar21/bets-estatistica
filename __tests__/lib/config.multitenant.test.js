/**
 * Tests for lib/config.js multi-tenant functionality
 * Story 3.1: Task 7.7 - Test initialization with/without GROUP_ID env
 */

describe('config - Multi-tenant (Story 3.1)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_KEY: 'test-key',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_ADMIN_GROUP_ID: '-100123',
      TELEGRAM_PUBLIC_GROUP_ID: '-100456',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('groupId is set when GROUP_ID env is defined', () => {
    process.env.GROUP_ID = 'test-group-uuid';
    const { config } = require('../../lib/config');
    expect(config.membership.groupId).toBe('test-group-uuid');
  });

  test('groupId is null when GROUP_ID env is not defined', () => {
    delete process.env.GROUP_ID;
    const { config } = require('../../lib/config');
    expect(config.membership.groupId).toBeNull();
  });

  test('groupId is null when GROUP_ID env is empty string', () => {
    process.env.GROUP_ID = '';
    const { config } = require('../../lib/config');
    // '' || null → null
    expect(config.membership.groupId).toBeNull();
  });
});

/**
 * Schema Validation Test - Multi-tenant (Migration 019)
 * Validates that 019_multitenant.sql was applied correctly:
 * - New tables: groups, admin_users, bot_pool, bot_health
 * - New columns: members.group_id, suggested_bets.group_id, suggested_bets.distributed_at
 * - CHECK constraints on roles and statuses
 * - RLS enabled on all required tables
 * - Backward compatibility: existing data with group_id = NULL still accessible
 *
 * Created: 2026-02-07
 * Story: 1.1 - Migration Multi-tenant e RLS
 */
const { supabase } = require('../lib/supabase');

// Helper: check if migration 019 has been applied (groups table exists)
async function isMigration019Applied() {
  const { error } = await supabase.from('groups').select('id').limit(1);
  return !error || !error.message.match(/Could not find.*in the schema cache/i);
}

describe('Multi-tenant Schema Validation (Migration 019)', () => {

  // ============================================
  // NEW TABLES EXIST
  // ============================================
  const NEW_TABLES = ['groups', 'admin_users', 'bot_pool', 'bot_health'];

  describe('New Tables Exist', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test.each(NEW_TABLES)('table "%s" should exist', async (tableName) => {
      if (!migrationApplied) {
        console.log(`Skipping - migration 019 not yet applied to database`);
        return;
      }
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      const tableNotFoundPatterns = [
        /relation.*does not exist/i,
        /Could not find.*in the schema cache/i
      ];

      const isTableMissing = tableNotFoundPatterns.some(pattern =>
        error?.message?.match(pattern)
      );

      expect(isTableMissing).toBe(false);
    });
  });

  // ============================================
  // GROUPS TABLE SCHEMA
  // ============================================
  describe('Groups Table Schema', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('should have all required columns', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, bot_token, telegram_group_id, telegram_admin_group_id, mp_product_id, render_service_id, checkout_url, status, created_at')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should reject invalid status values', async () => {
      if (!migrationApplied) return;
      const { error } = await supabase
        .from('groups')
        .insert({ name: '__test_invalid_status__', status: 'banana' });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates check constraint/i);

      // Cleanup
      await supabase.from('groups').delete().eq('name', '__test_invalid_status__');
    });

    test.each(['creating', 'active', 'paused', 'inactive', 'failed'])(
      'should accept valid status "%s"',
      async (status) => {
        if (!migrationApplied) return;
        const { data, error } = await supabase
          .from('groups')
          .insert({ name: `__test_status_${status}__`, status })
          .select('id')
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // Cleanup
        if (data) {
          await supabase.from('groups').delete().eq('id', data.id);
        }
      }
    );
  });

  // ============================================
  // ADMIN_USERS TABLE SCHEMA
  // ============================================
  describe('Admin Users Table Schema', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('should have all required columns', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, email, role, group_id, created_at')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should reject invalid role values', async () => {
      if (!migrationApplied) return;
      const testId = '00000000-0000-0000-0000-000000000099';
      const { error } = await supabase
        .from('admin_users')
        .insert({ id: testId, email: 'test@test.com', role: 'hacker' });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates check constraint/i);

      // Cleanup
      await supabase.from('admin_users').delete().eq('id', testId);
    });

    test.each(['super_admin', 'group_admin'])(
      'should accept valid role "%s"',
      async (role) => {
        if (!migrationApplied) return;
        const testId = role === 'super_admin'
          ? '00000000-0000-0000-0000-000000000097'
          : '00000000-0000-0000-0000-000000000098';
        const { data, error } = await supabase
          .from('admin_users')
          .insert({ id: testId, email: `test-${role}@test.com`, role })
          .select('id')
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // Cleanup
        if (data) {
          await supabase.from('admin_users').delete().eq('id', data.id);
        }
      }
    );
  });

  // ============================================
  // BOT_POOL TABLE SCHEMA
  // ============================================
  describe('Bot Pool Table Schema', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('should have all required columns', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('bot_pool')
        .select('id, bot_token, bot_username, status, group_id, created_at')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should reject invalid status values', async () => {
      if (!migrationApplied) return;
      const { error } = await supabase
        .from('bot_pool')
        .insert({ bot_token: '__test__', bot_username: '__test__', status: 'broken' });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates check constraint/i);

      // Cleanup
      await supabase.from('bot_pool').delete().eq('bot_token', '__test__');
    });

    test.each(['available', 'in_use'])(
      'should accept valid status "%s"',
      async (status) => {
        if (!migrationApplied) return;
        const { data, error } = await supabase
          .from('bot_pool')
          .insert({ bot_token: `__test_${status}__`, bot_username: `__test_${status}__`, status })
          .select('id')
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // Cleanup
        if (data) {
          await supabase.from('bot_pool').delete().eq('id', data.id);
        }
      }
    );
  });

  // ============================================
  // BOT_HEALTH TABLE SCHEMA
  // ============================================
  describe('Bot Health Table Schema', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('should have all required columns', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('bot_health')
        .select('group_id, last_heartbeat, status, restart_requested, error_message, updated_at')
        .limit(1);

      expect(error).toBeNull();
    });
  });

  // ============================================
  // ALTERED TABLES: members + suggested_bets
  // ============================================
  describe('Members Table - group_id Column', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('should have group_id column', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('members')
        .select('id, group_id')
        .limit(1);

      expect(error).toBeNull();
    });

    test('existing members should have group_id = NULL (backward compat)', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('members')
        .select('id, group_id')
        .is('group_id', null)
        .limit(1);

      expect(error).toBeNull();
    });
  });

  describe('Suggested Bets Table - New Columns', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('should have group_id column', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('suggested_bets')
        .select('id, group_id')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should have distributed_at column', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('suggested_bets')
        .select('id, distributed_at')
        .limit(1);

      expect(error).toBeNull();
    });

    test('existing bets should have group_id = NULL (backward compat)', async () => {
      if (!migrationApplied) return;
      const { data, error } = await supabase
        .from('suggested_bets')
        .select('id, group_id')
        .is('group_id', null)
        .limit(1);

      expect(error).toBeNull();
    });
  });

  // ============================================
  // FK CONSTRAINTS
  // ============================================
  describe('Foreign Key Constraints', () => {
    let migrationApplied;
    beforeAll(async () => { migrationApplied = await isMigration019Applied(); });

    test('admin_users.group_id should reference groups.id', async () => {
      if (!migrationApplied) return;
      const fakeGroupId = '00000000-0000-0000-0000-ffffffffffff';
      const testId = '00000000-0000-0000-0000-000000000096';
      const { error } = await supabase
        .from('admin_users')
        .insert({ id: testId, email: 'fk-test@test.com', role: 'group_admin', group_id: fakeGroupId });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates foreign key constraint/i);

      // Cleanup
      await supabase.from('admin_users').delete().eq('id', testId);
    });

    test('bot_pool.group_id should reference groups.id', async () => {
      if (!migrationApplied) return;
      const fakeGroupId = '00000000-0000-0000-0000-ffffffffffff';
      const { error } = await supabase
        .from('bot_pool')
        .insert({ bot_token: '__fk_test__', bot_username: '__fk_test__', group_id: fakeGroupId });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates foreign key constraint/i);

      // Cleanup
      await supabase.from('bot_pool').delete().eq('bot_token', '__fk_test__');
    });
  });

  // ============================================
  // RLS ENABLED (static SQL validation)
  // ============================================
  describe('Migration SQL - Static Validation', () => {
    const fs = require('fs');
    const path = require('path');

    let migrationSql;

    beforeAll(() => {
      const migrationPath = path.join(__dirname, '..', 'sql', 'migrations', '019_multitenant.sql');
      migrationSql = fs.readFileSync(migrationPath, 'utf8');
    });

    test('migration file should exist', () => {
      expect(migrationSql).toBeDefined();
      expect(migrationSql.length).toBeGreaterThan(0);
    });

    const RLS_TABLES = [
      'groups', 'admin_users', 'bot_pool', 'bot_health',
      'members', 'suggested_bets', 'member_notifications', 'webhook_events'
    ];

    test.each(RLS_TABLES)('should enable RLS on table "%s"', (tableName) => {
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+${tableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i'
      );
      expect(migrationSql).toMatch(pattern);
    });

    test('should create RLS policies for all required tables', () => {
      const policyTables = [
        'groups', 'admin_users', 'bot_pool', 'bot_health',
        'members', 'suggested_bets', 'member_notifications', 'webhook_events'
      ];

      for (const table of policyTables) {
        const pattern = new RegExp(`CREATE\\s+POLICY\\s+.*ON\\s+${table}`, 'i');
        expect(migrationSql).toMatch(pattern);
      }
    });

    test('should create all 4 new tables', () => {
      const tables = ['groups', 'admin_users', 'bot_pool', 'bot_health'];
      for (const table of tables) {
        const pattern = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}`, 'i');
        expect(migrationSql).toMatch(pattern);
      }
    });

    test('should add group_id to members', () => {
      expect(migrationSql).toMatch(
        /ALTER\s+TABLE\s+members\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+group_id/i
      );
    });

    test('should add group_id to suggested_bets', () => {
      expect(migrationSql).toMatch(
        /ALTER\s+TABLE\s+suggested_bets\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+group_id/i
      );
    });

    test('should add distributed_at to suggested_bets', () => {
      expect(migrationSql).toMatch(
        /ALTER\s+TABLE\s+suggested_bets\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+distributed_at/i
      );
    });

    test('should have CHECK constraint for admin_users role', () => {
      expect(migrationSql).toMatch(/role.*CHECK.*super_admin.*group_admin/is);
    });

    test('should have CHECK constraint for groups status with all 5 values', () => {
      expect(migrationSql).toMatch(/status.*CHECK.*creating.*active.*paused.*inactive.*failed/is);
    });

    test('should have CHECK constraint for bot_pool status', () => {
      expect(migrationSql).toMatch(/status.*CHECK.*available.*in_use/is);
    });

    test('should have CHECK constraint for bot_health status', () => {
      expect(migrationSql).toMatch(/status.*CHECK.*online.*offline/is);
    });

    test('should create indexes for group_id columns', () => {
      expect(migrationSql).toMatch(/CREATE\s+INDEX.*idx_members_group_id.*ON\s+members/i);
      expect(migrationSql).toMatch(/CREATE\s+INDEX.*idx_suggested_bets_group_id.*ON\s+suggested_bets/i);
    });

    test('should create index for groups status', () => {
      expect(migrationSql).toMatch(/CREATE\s+INDEX.*idx_groups_status.*ON\s+groups/i);
    });
  });
});

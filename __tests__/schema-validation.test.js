/**
 * Schema Validation Test
 * Ensures all tables expected by code actually exist in database
 *
 * Created: 2026-01-18
 * Reason: member_events table was missing, causing runtime errors
 * Sprint Change Proposal: sprint-change-proposal-2026-01-18.md
 */
const { supabase } = require('../lib/supabase');

describe('Database Schema Validation', () => {
  // All tables that the codebase expects to exist
  const REQUIRED_TABLES = [
    'members',
    'member_notifications',
    'member_events',
    'webhook_events',
    'suggested_bets',
    'odds_update_history',
    'system_config'
  ];

  describe('Required Tables Exist', () => {
    test.each(REQUIRED_TABLES)('table "%s" should exist', async (tableName) => {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      // If table doesn't exist, error will contain these messages
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

  describe('Members Table Schema', () => {
    test('should have all required columns', async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, telegram_id, telegram_username, status, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at, payment_method, kicked_at, created_at, updated_at')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should have valid status constraint', async () => {
      // Try to insert invalid status - should fail
      const { error } = await supabase
        .from('members')
        .insert({ telegram_id: -999999, status: 'invalid_status' });

      // Should have constraint violation error
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates check constraint|invalid input/i);

      // Cleanup just in case
      await supabase.from('members').delete().eq('telegram_id', -999999);
    });
  });

  describe('Webhook Events Table Schema', () => {
    test('should have updated_at column (migration 007)', async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, idempotency_key, status, updated_at')
        .limit(1);

      expect(error).toBeNull();
    });
  });

  describe('Member Events Table Schema', () => {
    test('should have all required columns (migration 008)', async () => {
      const { data, error } = await supabase
        .from('member_events')
        .select('id, member_id, event_type, payload, created_at')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should have valid event_type constraint', async () => {
      // This test needs a valid member_id, so we skip if no members exist
      const { data: members } = await supabase
        .from('members')
        .select('id')
        .limit(1);

      if (!members || members.length === 0) {
        console.log('Skipping event_type constraint test - no members exist');
        return;
      }

      // Try to insert invalid event_type - should fail
      const { error } = await supabase
        .from('member_events')
        .insert({
          member_id: members[0].id,
          event_type: 'invalid_event_type'
        });

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/violates check constraint/i);
    });
  });

  describe('Member Notifications Table Schema', () => {
    test('should have all required columns', async () => {
      const { data, error } = await supabase
        .from('member_notifications')
        .select('id, member_id, type, channel, sent_at, message_id')
        .limit(1);

      expect(error).toBeNull();
    });
  });
});

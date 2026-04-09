-- Migration 066: Fix suggested_bets RLS policy for group_admin (use bet_group_assignments)
-- Date: 2026-04-05
-- Purpose: The old policy filtered by suggested_bets.group_id which was deprecated and
--          nulled in migration 065. Group admins got zero rows. This migration updates
--          the policy to check group membership via the bet_group_assignments junction table.
--
-- Rollback:
--   DROP POLICY IF EXISTS "suggested_bets_group_admin_all" ON suggested_bets;
--   CREATE POLICY "suggested_bets_group_admin_all" ON suggested_bets
--     FOR ALL USING (group_id = public.get_my_group_id())
--     WITH CHECK (group_id = public.get_my_group_id());

BEGIN;

-- Drop the broken policy (filters by deprecated group_id column, always NULL)
DROP POLICY IF EXISTS "suggested_bets_group_admin_all" ON suggested_bets;

-- New policy: group_admin sees only bets distributed to their group via junction table
CREATE POLICY "suggested_bets_group_admin_all" ON suggested_bets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bet_group_assignments bga
      WHERE bga.bet_id = suggested_bets.id
        AND bga.group_id = (SELECT au.group_id FROM admin_users au WHERE au.id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bet_group_assignments bga
      WHERE bga.bet_id = suggested_bets.id
        AND bga.group_id = (SELECT au.group_id FROM admin_users au WHERE au.id = auth.uid())
    )
  );

COMMIT;

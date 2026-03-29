-- Migration 063: Add DELETE RLS policy for group_admin on bet_group_assignments
-- Date: 2026-03-29
-- Purpose: group_admin needs DELETE permission on their own group's assignments
--          (required by DELETE /api/bets/[id]/assignments/[groupId])
--
-- Rollback:
--   DROP POLICY IF EXISTS "bga_group_admin_delete" ON bet_group_assignments;

CREATE POLICY "bga_group_admin_delete" ON bet_group_assignments
  FOR DELETE USING (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );

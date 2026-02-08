-- Migration 020: Fix infinite recursion in RLS policies
-- Date: 2026-02-08
-- Problem: Policies on admin_users query admin_users itself, causing infinite
--          recursion because Supabase applies RLS to the sub-query too.
-- Fix: Create SECURITY DEFINER helper functions that bypass RLS to resolve
--      the current user's role and group_id, then replace all inline sub-queries.

BEGIN;

-- =====================================================
-- 1. HELPER FUNCTIONS (SECURITY DEFINER = bypassa RLS)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM admin_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_group_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT group_id FROM admin_users WHERE id = auth.uid();
$$;


-- =====================================================
-- 2. DROP ALL EXISTING POLICIES (from migration 019)
-- =====================================================

-- groups
DROP POLICY IF EXISTS "groups_super_admin_all" ON groups;
DROP POLICY IF EXISTS "groups_group_admin_select" ON groups;

-- admin_users
DROP POLICY IF EXISTS "admin_users_super_admin_all" ON admin_users;
DROP POLICY IF EXISTS "admin_users_self_select" ON admin_users;

-- bot_pool
DROP POLICY IF EXISTS "bot_pool_super_admin_all" ON bot_pool;

-- bot_health
DROP POLICY IF EXISTS "bot_health_super_admin_all" ON bot_health;
DROP POLICY IF EXISTS "bot_health_group_admin_select" ON bot_health;

-- members
DROP POLICY IF EXISTS "members_super_admin_all" ON members;
DROP POLICY IF EXISTS "members_group_admin_all" ON members;

-- suggested_bets
DROP POLICY IF EXISTS "suggested_bets_super_admin_all" ON suggested_bets;
DROP POLICY IF EXISTS "suggested_bets_group_admin_all" ON suggested_bets;

-- member_notifications
DROP POLICY IF EXISTS "member_notifications_super_admin_all" ON member_notifications;
DROP POLICY IF EXISTS "member_notifications_group_admin_all" ON member_notifications;

-- webhook_events
DROP POLICY IF EXISTS "webhook_events_super_admin_all" ON webhook_events;


-- =====================================================
-- 3. RECREATE POLICIES using helper functions
-- =====================================================

-- 3a. admin_users
-- Self-select FIRST (no recursion risk — compares id directly)
CREATE POLICY "admin_users_self_select" ON admin_users
  FOR SELECT USING (id = auth.uid());

-- Super admin: full CRUD
CREATE POLICY "admin_users_super_admin_all" ON admin_users
  FOR ALL USING (public.get_my_role() = 'super_admin');

-- 3b. groups
CREATE POLICY "groups_super_admin_all" ON groups
  FOR ALL USING (public.get_my_role() = 'super_admin');

CREATE POLICY "groups_group_admin_select" ON groups
  FOR SELECT USING (id = public.get_my_group_id());

-- 3c. bot_pool
CREATE POLICY "bot_pool_super_admin_all" ON bot_pool
  FOR ALL USING (public.get_my_role() = 'super_admin');

-- 3d. bot_health
CREATE POLICY "bot_health_super_admin_all" ON bot_health
  FOR ALL USING (public.get_my_role() = 'super_admin');

CREATE POLICY "bot_health_group_admin_select" ON bot_health
  FOR SELECT USING (group_id = public.get_my_group_id());

-- 3e. members
CREATE POLICY "members_super_admin_all" ON members
  FOR ALL USING (public.get_my_role() = 'super_admin');

CREATE POLICY "members_group_admin_all" ON members
  FOR ALL USING (group_id = public.get_my_group_id())
  WITH CHECK (group_id = public.get_my_group_id());

-- 3f. suggested_bets
CREATE POLICY "suggested_bets_super_admin_all" ON suggested_bets
  FOR ALL USING (public.get_my_role() = 'super_admin');

CREATE POLICY "suggested_bets_group_admin_all" ON suggested_bets
  FOR ALL USING (group_id = public.get_my_group_id())
  WITH CHECK (group_id = public.get_my_group_id());

-- 3g. member_notifications
CREATE POLICY "member_notifications_super_admin_all" ON member_notifications
  FOR ALL USING (public.get_my_role() = 'super_admin');

CREATE POLICY "member_notifications_group_admin_all" ON member_notifications
  FOR ALL USING (
    member_id IN (
      SELECT id FROM members WHERE group_id = public.get_my_group_id()
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM members WHERE group_id = public.get_my_group_id()
    )
  );

-- 3h. webhook_events
CREATE POLICY "webhook_events_super_admin_all" ON webhook_events
  FOR ALL USING (public.get_my_role() = 'super_admin');

COMMIT;

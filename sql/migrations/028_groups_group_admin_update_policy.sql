-- Migration 028: Allow group_admin to UPDATE their own group
-- Fixes: "Postar Agora" button (post_now_requested_at) and posting_schedule save
-- were silently failing because RLS had no UPDATE policy for group_admin.

CREATE POLICY "groups_group_admin_update" ON groups
  FOR UPDATE
  USING (id = public.get_my_group_id())
  WITH CHECK (id = public.get_my_group_id());

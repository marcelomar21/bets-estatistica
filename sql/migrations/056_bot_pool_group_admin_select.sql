-- Allow group_admin to read bot_pool entries for their own group
-- Required for: members page bot invite link card
CREATE POLICY "bot_pool_group_admin_select" ON bot_pool
  FOR SELECT
  USING (
    group_id IN (
      SELECT au.group_id FROM admin_users au
      WHERE au.id = auth.uid() AND au.role = 'group_admin'
    )
  );

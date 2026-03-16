-- Allow group_admin to INSERT into audit_log for their own actions
-- Without this, toggle-admin, cancel, reactivate and group update
-- silently fail to write audit entries
CREATE POLICY "audit_log_group_admin_insert" ON audit_log
  FOR INSERT
  WITH CHECK (
    (SELECT au.role FROM admin_users au WHERE au.id = auth.uid()) = 'group_admin'
  );

-- Allow group_admin to INSERT notifications for their own group
-- Prevents silent failures if notification persistence is extended to group_admin
CREATE POLICY "notifications_group_admin_insert" ON notifications
  FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT au.group_id FROM admin_users au
      WHERE au.id = auth.uid() AND au.role = 'group_admin'
    )
  );

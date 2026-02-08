import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { LayoutShell } from '@/components/layout/LayoutShell';
import type { AdminUser } from '@/types/database';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (adminUser as Pick<AdminUser, 'role'> | null)?.role;

  return (
    <LayoutShell userEmail={user.email || ''} role={role}>
      {children}
    </LayoutShell>
  );
}

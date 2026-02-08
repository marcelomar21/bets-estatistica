import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { LayoutShell } from '@/components/layout/LayoutShell';

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

  return (
    <LayoutShell userEmail={user.email || ''}>
      {children}
    </LayoutShell>
  );
}

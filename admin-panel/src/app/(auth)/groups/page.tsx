import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { GroupCard } from '@/components/features/groups/GroupCard';
import type { GroupListItem, AdminUser } from '@/types/database';

export default async function GroupsPage() {
  const supabase = await createClient();

  // Fetch user role to control visibility of super_admin-only actions
  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminUser } = user
    ? await supabase.from('admin_users').select('role').eq('id', user.id).single()
    : { data: null };
  const role = adminUser?.role as AdminUser['role'] | undefined;
  const isSuperAdmin = role === 'super_admin';

  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, status, telegram_group_id, telegram_admin_group_id, telegram_invite_link, checkout_url, created_at, bot_pool(bot_username)')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  const typedGroups = (groups ?? []) as GroupListItem[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Grupos</h1>
        {isSuperAdmin && (
          <Link
            href="/groups/new"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            Novo Grupo
          </Link>
        )}
      </div>

      {typedGroups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Nenhum grupo cadastrado</p>
          {isSuperAdmin && (
            <Link
              href="/groups/new"
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Criar primeiro grupo
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {typedGroups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { GroupCard } from '@/components/features/groups/GroupCard';
import type { GroupListItem } from '@/types/database';

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
    .order('created_at', { ascending: false });

  const typedGroups = (groups ?? []) as GroupListItem[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Grupos</h1>
        <Link
          href="/groups/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Novo Grupo
        </Link>
      </div>

      {typedGroups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Nenhum grupo cadastrado</p>
          <Link
            href="/groups/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Criar primeiro grupo
          </Link>
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

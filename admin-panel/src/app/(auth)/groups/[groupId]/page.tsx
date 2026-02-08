import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import type { GroupListItem } from '@/types/database';
import { statusConfig, formatDateTime } from '@/components/features/groups/group-utils';

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
    .eq('id', groupId)
    .single();

  if (!group) {
    notFound();
  }

  const typedGroup = group as GroupListItem;
  const status = statusConfig[typedGroup.status];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/groups"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Grupos
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{typedGroup.name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1 text-sm text-gray-900">{status.label}</dd>
          </div>

          {typedGroup.telegram_group_id !== null && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Telegram Group ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{typedGroup.telegram_group_id}</dd>
            </div>
          )}

          {typedGroup.telegram_admin_group_id !== null && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Telegram Admin Group ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{typedGroup.telegram_admin_group_id}</dd>
            </div>
          )}

          {typedGroup.checkout_url && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Checkout URL</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <a
                  href={typedGroup.checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  {typedGroup.checkout_url}
                </a>
              </dd>
            </div>
          )}

          <div>
            <dt className="text-sm font-medium text-gray-500">Criado em</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(typedGroup.created_at)}</dd>
          </div>
        </dl>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <Link
            href={`/groups/${typedGroup.id}/edit`}
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Editar
          </Link>
        </div>
      </div>
    </div>
  );
}

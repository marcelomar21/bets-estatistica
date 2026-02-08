import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import type { Group } from '@/types/database';

const statusConfig: Record<Group['status'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-800' },
  inactive: { label: 'Inativo', className: 'bg-gray-100 text-gray-800' },
  creating: { label: 'Criando', className: 'bg-blue-100 text-blue-800' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-800' },
};

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

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

  const typedGroup = group as Group;
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

          {typedGroup.telegram_group_id && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Telegram Group ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{typedGroup.telegram_group_id}</dd>
            </div>
          )}

          {typedGroup.telegram_admin_group_id && (
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
            <dd className="mt-1 text-sm text-gray-900">{formatDate(typedGroup.created_at)}</dd>
          </div>
        </dl>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            disabled
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
            title="Funcionalidade de edicao sera implementada na Story 2.1"
          >
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

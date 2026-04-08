import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import type { GroupListItem, AdminUser } from '@/types/database';
import { statusConfig, formatDateTime } from '@/components/features/groups/group-utils';
import { CreateWhatsAppButton } from '@/components/features/groups/CreateWhatsAppButton';
import { DeleteGroupButton } from '@/components/features/groups/DeleteGroupButton';
import { InviteLinkManager } from '@/components/features/groups/InviteLinkManager';

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();

  // Fetch user role
  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminUser } = user
    ? await supabase.from('admin_users').select('role').eq('id', user.id).single()
    : { data: null };
  const isSuperAdmin = (adminUser?.role as AdminUser['role'] | undefined) === 'super_admin';

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, whatsapp_group_jid, whatsapp_invite_link, channels, is_test, enabled_modules, created_at')
    .eq('id', groupId)
    .single();

  if (!group) {
    notFound();
  }

  const typedGroup = group as GroupListItem & { whatsapp_group_jid: string | null; whatsapp_invite_link: string | null; channels: string[] | null; is_test: boolean; enabled_modules: string[] };
  const status = statusConfig[typedGroup.status];
  const channels = typedGroup.channels || ['telegram'];
  const hasWhatsApp = !!typedGroup.whatsapp_group_jid;

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
            <dt className="text-sm font-medium text-gray-500">Canais</dt>
            <dd className="mt-1 flex items-center gap-2">
              {channels.map((ch) => (
                <span
                  key={ch}
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ch === 'telegram' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}
                >
                  {ch === 'telegram' ? 'Telegram' : 'WhatsApp'}
                </span>
              ))}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Modulos</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {(typedGroup.enabled_modules || ['analytics', 'distribution', 'posting', 'members', 'tone']).map((mod) => (
                <span
                  key={mod}
                  className="inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800"
                >
                  {mod}
                </span>
              ))}
            </dd>
          </div>

          <InviteLinkManager
            groupId={typedGroup.id}
            hasWhatsApp={hasWhatsApp}
            initialInviteLink={typedGroup.whatsapp_invite_link}
          />

          <div>
            <dt className="text-sm font-medium text-gray-500">Criado em</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(typedGroup.created_at)}</dd>
          </div>
        </dl>

        <div className="mt-6 pt-6 border-t border-gray-200 flex items-center gap-3">
          <Link
            href={`/groups/${typedGroup.id}/edit`}
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Editar
          </Link>
          <Link
            href={`/groups/${typedGroup.id}/tone`}
            className="inline-block rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Tom de Voz
          </Link>
          <Link
            href={`/groups/${typedGroup.id}/leagues`}
            className="inline-block rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Campeonatos
          </Link>
          <Link
            href={`/groups/${typedGroup.id}/league-checkout`}
            className="inline-block rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100"
          >
            Ligas Extras
          </Link>
          {isSuperAdmin && <CreateWhatsAppButton groupId={typedGroup.id} hasWhatsApp={hasWhatsApp} />}
          {isSuperAdmin && <DeleteGroupButton groupId={typedGroup.id} groupName={typedGroup.name} />}
        </div>
      </div>
    </div>
  );
}

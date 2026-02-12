import type { MemberListItem } from '@/types/database';
import { formatDate } from '@/lib/format-utils';
import { getDisplayStatus, memberStatusConfig } from './member-utils';

interface MemberListProps {
  members: MemberListItem[];
  role: 'super_admin' | 'group_admin';
}

export function MemberList({ members, role }: MemberListProps) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
        Nenhum membro encontrado
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Nome Telegram
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Telegram ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Data de Entrada
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              Vencimento
            </th>
            {role === 'super_admin' && (
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Grupo
              </th>
            )}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {members.map((member) => {
            const displayStatus = getDisplayStatus({
              status: member.status,
              subscription_ends_at: member.subscription_ends_at,
            });
            const statusBadge = memberStatusConfig[displayStatus];

            return (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">
                  {member.telegram_username || '-'}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-gray-500">
                  {member.telegram_id ?? '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {formatDate(member.created_at)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {member.subscription_ends_at ? formatDate(member.subscription_ends_at) : '-'}
                </td>
                {role === 'super_admin' && (
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {member.groups?.name ?? '-'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

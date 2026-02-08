import Link from 'next/link';
import type { GroupListItem } from '@/types/database';
import { statusConfig, formatDate } from './group-utils';

interface GroupCardProps {
  group: GroupListItem;
}

export function GroupCard({ group }: GroupCardProps) {
  const status = statusConfig[group.status];

  return (
    <Link
      href={`/groups/${group.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Criado em {formatDate(group.created_at)}
      </p>
    </Link>
  );
}

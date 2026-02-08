import Link from 'next/link';
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
  }).format(new Date(dateString));
}

interface GroupCardProps {
  group: Group;
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

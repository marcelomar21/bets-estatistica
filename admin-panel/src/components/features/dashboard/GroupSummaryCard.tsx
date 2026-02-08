import Link from 'next/link';
import type { DashboardGroupCard } from '@/types/database';

const statusConfig: Record<DashboardGroupCard['status'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-800' },
  inactive: { label: 'Inativo', className: 'bg-gray-100 text-gray-800' },
  creating: { label: 'Criando', className: 'bg-blue-100 text-blue-800' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-800' },
};

interface GroupSummaryCardProps {
  group: DashboardGroupCard;
}

export default function GroupSummaryCard({ group }: GroupSummaryCardProps) {
  const { label, className } = statusConfig[group.status] ?? statusConfig.inactive;

  return (
    <Link href={`/groups/${group.id}`} className="block">
      <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{group.name}</h3>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
            {label}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {group.active_members} {group.active_members === 1 ? 'membro ativo' : 'membros ativos'}
        </p>
      </div>
    </Link>
  );
}

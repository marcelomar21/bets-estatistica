import type { Group } from '@/types/database';

export const statusConfig: Record<Group['status'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-800' },
  inactive: { label: 'Inativo', className: 'bg-gray-100 text-gray-800' },
  creating: { label: 'Criando', className: 'bg-blue-100 text-blue-800' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-800' },
};

export { formatDate, formatDateTime } from '@/lib/format-utils';

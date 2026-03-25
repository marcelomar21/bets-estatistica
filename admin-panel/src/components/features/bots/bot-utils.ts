import type { BotPoolListItem } from '@/types/database';

export const botStatusConfig: Record<BotPoolListItem['status'], { label: string; className: string }> = {
  available: { label: 'Disponível', className: 'bg-green-100 text-green-800' },
  in_use: { label: 'Em Uso', className: 'bg-orange-100 text-orange-800' },
};

export { formatDate } from '@/lib/format-utils';

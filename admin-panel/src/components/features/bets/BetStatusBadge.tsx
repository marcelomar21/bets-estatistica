'use client';

import type { BetStatus } from '@/types/database';

const statusConfig: Record<BetStatus, { label: string; className: string }> = {
  generated: { label: 'Gerada', className: 'bg-gray-100 text-gray-700' },
  pending_link: { label: 'Sem Link', className: 'bg-yellow-100 text-yellow-800' },
  pending_odds: { label: 'Sem Odds', className: 'bg-orange-100 text-orange-800' },
  ready: { label: 'Pronta', className: 'bg-green-100 text-green-800' },
  posted: { label: 'Postada', className: 'bg-blue-100 text-blue-800' },
};

interface BetStatusBadgeProps {
  status: BetStatus;
}

export function BetStatusBadge({ status }: BetStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.generated;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

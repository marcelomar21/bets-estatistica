'use client';

export type BetResult = 'success' | 'failure' | 'unknown' | 'cancelled' | null;

const resultConfig: Record<string, { label: string; className: string }> = {
  success: { label: 'Acerto', className: 'bg-green-100 text-green-800' },
  failure: { label: 'Erro', className: 'bg-red-100 text-red-800' },
  unknown: { label: 'Indefinido', className: 'bg-yellow-100 text-yellow-800' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Pendente', className: 'bg-gray-100 text-gray-500' },
};

interface BetResultBadgeProps {
  result: BetResult;
}

export function BetResultBadge({ result }: BetResultBadgeProps) {
  const config = resultConfig[result ?? 'pending'];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

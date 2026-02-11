'use client';

import type { BetCounters } from '@/types/database';

interface BetStatsBarProps {
  counters: BetCounters;
}

export function BetStatsBar({ counters }: BetStatsBarProps) {
  const stats = [
    { label: 'Total', value: counters.total, className: 'bg-gray-50 text-gray-700' },
    { label: 'Prontas', value: counters.ready, className: 'bg-green-50 text-green-700' },
    { label: 'Postadas', value: counters.posted, className: 'bg-blue-50 text-blue-700' },
    { label: 'Sem Link', value: counters.pending_link, className: 'bg-yellow-50 text-yellow-700' },
    { label: 'Sem Odds', value: counters.sem_odds, className: 'bg-orange-50 text-orange-700' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map((stat) => (
        <div key={stat.label} className={`rounded-lg p-3 text-center ${stat.className}`}>
          <p className="text-2xl font-bold">{stat.value}</p>
          <p className="text-xs font-medium">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

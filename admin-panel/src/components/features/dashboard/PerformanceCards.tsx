import Link from 'next/link';

export interface AccuracyPeriod {
  rate: number;
  wins: number;
  total: number;
}

export interface AccuracyPeriods {
  allTime: AccuracyPeriod;
  last7d: AccuracyPeriod;
  last30d: AccuracyPeriod;
}

export interface GroupAccuracy {
  group_id: string;
  group_name: string;
  rate: number;
  wins: number;
  total: number;
}

export function rateColor(rate: number, total: number): string {
  if (total === 0) return 'text-gray-400';
  if (rate >= 70) return 'text-green-600';
  if (rate >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

export function rateBg(rate: number, total: number): string {
  if (total === 0) return 'bg-gray-50 border-gray-200';
  if (rate >= 70) return 'bg-green-50 border-green-200';
  if (rate >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

interface PerformanceCardsProps {
  periods: AccuracyPeriods;
  byGroup?: GroupAccuracy[];
}

export default function PerformanceCards({ periods, byGroup }: PerformanceCardsProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Performance</h2>
        <Link href="/analytics" className="text-sm text-blue-600 hover:text-blue-800">
          Ver detalhes →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Taxa Total', period: periods.allTime },
          { label: 'Últimos 7 dias', period: periods.last7d },
          { label: 'Últimos 30 dias', period: periods.last30d },
        ].map(({ label, period }) => (
          <div key={label} className={`rounded-lg border p-4 ${rateBg(period.rate, period.total)}`}>
            <p className="text-sm font-medium text-gray-700">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${rateColor(period.rate, period.total)}`}>
              {period.total > 0 ? `${period.rate}%` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {period.wins}/{period.total} acertos
            </p>
          </div>
        ))}
      </div>
      {byGroup && byGroup.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {byGroup.map((g) => (
            <div key={g.group_id} className={`rounded-lg border p-3 ${rateBg(g.rate, g.total)}`}>
              <p className="text-xs font-medium text-gray-700 truncate">{g.group_name}</p>
              <p className={`text-lg font-bold ${rateColor(g.rate, g.total)}`}>{g.rate}%</p>
              <p className="text-xs text-gray-500">{g.wins}/{g.total}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

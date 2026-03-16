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
  overallRate?: { rate: number; wins: number; losses: number; total: number };
  postedRate?: { rate: number; wins: number; losses: number; total: number };
  byGroup?: GroupAccuracy[];
}

function PeriodStat({ label, period }: { label: string; period: AccuracyPeriod }) {
  const hasData = period.total > 0;
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold ${hasData ? rateColor(period.rate, period.total) : 'text-gray-400'}`}>
        {hasData ? `${period.rate}%` : '—'}
      </p>
    </div>
  );
}

export default function PerformanceCards({ periods, overallRate, postedRate, byGroup }: PerformanceCardsProps) {
  const hasOverall = overallRate && overallRate.total > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Performance</h2>
        <Link href="/analytics" className="text-sm text-blue-600 hover:text-blue-800">
          Ver detalhes &rarr;
        </Link>
      </div>

      <div className="flex items-start justify-between gap-6">
        {/* Hero: Taxa Geral */}
        {hasOverall && (
          <div>
            <p className={`text-4xl font-bold ${rateColor(overallRate.rate, overallRate.total)}`}>
              {overallRate.rate}%
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {overallRate.wins}/{overallRate.total} acertos
            </p>
          </div>
        )}

        {/* Secondary stats */}
        <div className="flex gap-6">
          {postedRate && postedRate.total > 0 && (
            <div>
              <p className="text-xs text-gray-500">Postadas</p>
              <p className={`text-sm font-semibold ${rateColor(postedRate.rate, postedRate.total)}`}>
                {postedRate.rate}%
              </p>
            </div>
          )}
          <PeriodStat label="7 dias" period={periods.last7d} />
          <PeriodStat label="30 dias" period={periods.last30d} />
        </div>
      </div>

      {/* Per-group accuracy inline */}
      {byGroup && byGroup.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
          {byGroup.map((g) => (
            <span key={g.group_id} className="text-sm text-gray-600">
              {g.group_name}{' '}
              <span className={`font-semibold ${rateColor(g.rate, g.total)}`}>{g.rate}%</span>
              <span className="text-gray-400 text-xs ml-0.5">({g.wins}/{g.total})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

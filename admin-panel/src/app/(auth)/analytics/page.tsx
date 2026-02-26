'use client';

import { useState, useEffect, useCallback } from 'react';

interface PeriodData {
  rate: number;
  wins: number;
  total: number;
}

interface BreakdownRow {
  rate: number;
  wins: number;
  losses: number;
  total: number;
}

interface GroupRow extends BreakdownRow {
  group_id: string;
  group_name: string;
}

interface MarketRow extends BreakdownRow {
  market: string;
  category: string;
}

interface ChampionshipRow extends BreakdownRow {
  league_name: string;
  country: string;
}

interface AnalyticsData {
  total: { rate: number; wins: number; losses: number; total: number };
  byGroup: GroupRow[];
  byMarket: MarketRow[];
  byChampionship: ChampionshipRow[];
  periods: {
    last7d: PeriodData;
    last30d: PeriodData;
    allTime: PeriodData;
  };
}

function rateColor(rate: number): string {
  if (rate >= 70) return 'text-green-700';
  if (rate >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function rateBg(rate: number): string {
  if (rate >= 70) return 'bg-green-50 border-green-200';
  if (rate >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

function TrendIndicator({ current, baseline }: { current: number; baseline: number }) {
  if (baseline === 0) return null;
  const diff = current - baseline;
  if (Math.abs(diff) < 0.5) return null;
  const arrow = diff > 0 ? '\u2191' : '\u2193';
  const color = diff > 0 ? 'text-green-600' : 'text-red-500';
  return <span className={`ml-1 text-xs font-medium ${color}`}>{arrow} {Math.abs(diff).toFixed(1)}%</span>;
}

type SortField = 'rate' | 'total';
type SortDir = 'asc' | 'desc';

function useSortable<T extends BreakdownRow>(data: T[]) {
  const [sortField, setSortField] = useState<SortField>('rate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = [...data].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1;
    return (a[sortField] - b[sortField]) * mul;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return '';
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2';
  }

  return { sorted, toggleSort, sortIcon };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('super_admin');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/analytics/accuracy');
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar analytics');
        return;
      }
      setData(json.data);
    } catch {
      setError('Erro de conexao ao carregar analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((json) => {
        if (json.role) setRole(json.role);
      })
      .catch(() => {});
  }, []);

  const marketSort = useSortable(data?.byMarket ?? []);
  const champSort = useSortable(data?.byChampionship ?? []);
  const groupSort = useSortable(data?.byGroup ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      ) : !data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhum dado disponivel
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className={`rounded-lg border p-6 ${rateBg(data.total.rate)}`}>
              <p className="text-sm font-medium text-gray-500">Taxa de Acerto Total</p>
              <p className={`mt-1 text-3xl font-bold ${rateColor(data.total.rate)}`}>
                {data.total.rate}%
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {data.total.wins} acertos / {data.total.total} apostas
              </p>
            </div>

            <div className={`rounded-lg border p-6 ${rateBg(data.periods.last7d.rate)}`}>
              <p className="text-sm font-medium text-gray-500">Ultimos 7 dias</p>
              <p className={`mt-1 text-3xl font-bold ${rateColor(data.periods.last7d.rate)}`}>
                {data.periods.last7d.rate}%
                <TrendIndicator current={data.periods.last7d.rate} baseline={data.periods.last30d.rate} />
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {data.periods.last7d.wins} / {data.periods.last7d.total}
              </p>
            </div>

            <div className={`rounded-lg border p-6 ${rateBg(data.periods.last30d.rate)}`}>
              <p className="text-sm font-medium text-gray-500">Ultimos 30 dias</p>
              <p className={`mt-1 text-3xl font-bold ${rateColor(data.periods.last30d.rate)}`}>
                {data.periods.last30d.rate}%
                <TrendIndicator current={data.periods.last30d.rate} baseline={data.periods.allTime.rate} />
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {data.periods.last30d.wins} / {data.periods.last30d.total}
              </p>
            </div>
          </div>

          {/* By Market Table */}
          <BreakdownTable
            title="Acerto por Mercado"
            rows={marketSort.sorted}
            labelHeader="Mercado"
            labelFn={(r) => (r as MarketRow).market}
            toggleSort={marketSort.toggleSort}
            sortIcon={marketSort.sortIcon}
          />

          {/* By Championship Table */}
          <BreakdownTable
            title="Acerto por Campeonato"
            rows={champSort.sorted}
            labelHeader="Campeonato"
            labelFn={(r) => {
              const cr = r as ChampionshipRow;
              return `${cr.league_name} (${cr.country})`;
            }}
            toggleSort={champSort.toggleSort}
            sortIcon={champSort.sortIcon}
          />

          {/* By Group Table — super_admin only */}
          {role === 'super_admin' && data.byGroup.length > 0 && (
            <BreakdownTable
              title="Acerto por Grupo"
              rows={groupSort.sorted}
              labelHeader="Grupo"
              labelFn={(r) => (r as GroupRow).group_name}
              toggleSort={groupSort.toggleSort}
              sortIcon={groupSort.sortIcon}
            />
          )}
        </>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  labelHeader,
  labelFn,
  toggleSort,
  sortIcon,
}: {
  title: string;
  rows: BreakdownRow[];
  labelHeader: string;
  labelFn: (row: BreakdownRow) => string;
  toggleSort: (field: SortField) => void;
  sortIcon: (field: SortField) => string;
}) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-gray-800">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {labelHeader}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => toggleSort('rate')}
              >
                Taxa{sortIcon('rate')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Acertos
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Erros
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => toggleSort('total')}
              >
                Total{sortIcon('total')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {labelFn(row)}
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-bold ${rateColor(row.rate)}`}>
                  {row.rate}%
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {row.wins}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {row.losses}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

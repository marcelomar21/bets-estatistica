'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MarketCategory } from '@/lib/bet-categories';

const MARKET_OPTIONS: MarketCategory[] = ['Gols', 'Escanteios', 'Cartões', 'BTTS', 'Outros'];

type PeriodPreset = '7d' | '30d' | 'month' | 'custom' | '';

function presetToDates(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const to = fmt(today);

  switch (preset) {
    case '7d': {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { from: fmt(d), to };
    }
    case '30d': {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { from: fmt(d), to };
    }
    case 'month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(from), to };
    }
    default:
      return { from: '', to: '' };
  }
}

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
  postedOnly: { rate: number; wins: number; losses: number; total: number };
  notPosted: { rate: number; wins: number; losses: number; total: number };
  byGroup: GroupRow[];
  byMarket: MarketRow[];
  byChampionship: ChampionshipRow[];
  periods: {
    last7d: PeriodData;
    last30d: PeriodData;
    allTime: PeriodData;
  };
}

interface GroupOption {
  id: string;
  name: string;
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

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function generateCsv(data: AnalyticsData): string {
  const lines: string[] = [];

  lines.push('Secao,Item,Taxa (%),Acertos,Erros,Total');

  lines.push(`Resumo,Taxa Geral,${data.total.rate},${data.total.wins},${data.total.losses},${data.total.total}`);
  lines.push(`Resumo,Taxa das Postadas,${data.postedOnly.rate},${data.postedOnly.wins},${data.postedOnly.losses},${data.postedOnly.total}`);
  lines.push(`Resumo,Taxa Nao Postadas,${data.notPosted.rate},${data.notPosted.wins},${data.notPosted.losses},${data.notPosted.total}`);
  lines.push(`Resumo,Ultimos 7d,${data.periods.last7d.rate},${data.periods.last7d.wins},,${data.periods.last7d.total}`);
  lines.push(`Resumo,Ultimos 30d,${data.periods.last30d.rate},${data.periods.last30d.wins},,${data.periods.last30d.total}`);

  for (const m of data.byMarket) {
    lines.push(`Mercado,${csvEscape(m.market)},${m.rate},${m.wins},${m.losses},${m.total}`);
  }

  for (const c of data.byChampionship) {
    lines.push(`Campeonato,${csvEscape(`${c.league_name} (${c.country})`)},${c.rate},${c.wins},${c.losses},${c.total}`);
  }

  for (const g of data.byGroup) {
    lines.push(`Grupo,${csvEscape(g.group_name)},${g.rate},${g.wins},${g.losses},${g.total}`);
  }

  return lines.join('\n');
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    }>
      <AnalyticsPage />
    </Suspense>
  );
}

function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<'super_admin' | 'group_admin' | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);

  // Filters — initialized from URL search params
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(
    (searchParams.get('period') as PeriodPreset) || '',
  );
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '');
  const [groupId, setGroupId] = useState(searchParams.get('group_id') || '');
  const [market, setMarket] = useState(searchParams.get('market') || '');

  // Sync URL with filter state
  const updateUrl = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v) sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(`/analytics${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (groupId) params.set('group_id', groupId);
      if (market) params.set('market', market);

      const res = await fetch(`/api/analytics/accuracy?${params}`);
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
  }, [dateFrom, dateTo, groupId, market]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch role and groups on mount
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((json) => {
        const userRole = json.data?.role;
        if (userRole === 'super_admin' || userRole === 'group_admin') {
          setRole(userRole);
        }
        if (userRole === 'super_admin') {
          fetch('/api/groups')
            .then((r2) => r2.json())
            .then((g) => {
              if (g.success && g.data) setGroups(g.data);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // When period preset changes, update date fields
  function handlePeriodChange(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset !== 'custom') {
      const { from, to } = presetToDates(preset);
      setDateFrom(from);
      setDateTo(to);
      updateUrl({ period: preset, date_from: from, date_to: to, group_id: groupId, market });
    } else {
      updateUrl({ period: 'custom', date_from: dateFrom, date_to: dateTo, group_id: groupId, market });
    }
  }

  function handleCustomDateChange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    updateUrl({ period: 'custom', date_from: from, date_to: to, group_id: groupId, market });
  }

  function handleGroupChange(gid: string) {
    setGroupId(gid);
    updateUrl({ period: periodPreset, date_from: dateFrom, date_to: dateTo, group_id: gid, market });
  }

  function handleMarketChange(m: string) {
    setMarket(m);
    updateUrl({ period: periodPreset, date_from: dateFrom, date_to: dateTo, group_id: groupId, market: m });
  }

  function clearFilters() {
    setPeriodPreset('');
    setDateFrom('');
    setDateTo('');
    setGroupId('');
    setMarket('');
    updateUrl({});
  }

  const hasFilters = periodPreset || dateFrom || dateTo || groupId || market;

  const marketSort = useSortable(data?.byMarket ?? []);
  const champSort = useSortable(data?.byChampionship ?? []);
  const groupSort = useSortable(data?.byGroup ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        {data && (
          <button
            onClick={() => downloadCsv(generateCsv(data))}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Exportar CSV
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label htmlFor="period" className="block text-xs font-medium text-gray-500 uppercase">
            Periodo
          </label>
          <select
            id="period"
            value={periodPreset}
            onChange={(e) => handlePeriodChange(e.target.value as PeriodPreset)}
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            <option value="7d">Ultimos 7 dias</option>
            <option value="30d">Ultimos 30 dias</option>
            <option value="month">Este mes</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        {periodPreset === 'custom' && (
          <>
            <div>
              <label htmlFor="date_from" className="block text-xs font-medium text-gray-500 uppercase">
                De
              </label>
              <input
                id="date_from"
                type="date"
                value={dateFrom}
                onChange={(e) => handleCustomDateChange(e.target.value, dateTo)}
                className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="date_to" className="block text-xs font-medium text-gray-500 uppercase">
                Ate
              </label>
              <input
                id="date_to"
                type="date"
                value={dateTo}
                onChange={(e) => handleCustomDateChange(dateFrom, e.target.value)}
                className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="market-filter" className="block text-xs font-medium text-gray-500 uppercase">
            Mercado
          </label>
          <select
            id="market-filter"
            value={market}
            onChange={(e) => handleMarketChange(e.target.value)}
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {MARKET_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {role === 'super_admin' && groups.length > 0 && (
          <div>
            <label htmlFor="group-filter" className="block text-xs font-medium text-gray-500 uppercase">
              Grupo
            </label>
            <select
              id="group-filter"
              value={groupId}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Limpar filtros
          </button>
        )}
      </div>

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border p-6 bg-blue-50 border-blue-200">
              <p className="text-sm font-medium text-gray-500">Taxa Geral</p>
              <p className="mt-1 text-3xl font-bold text-blue-700">
                {data.total.rate}%
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {data.total.wins} acertos / {data.total.total} apostas
              </p>
            </div>

            <div className={`rounded-lg border p-6 ${rateBg(data.postedOnly.rate)}`}>
              <p className="text-sm font-medium text-gray-500">Taxa das Postadas</p>
              <p className={`mt-1 text-3xl font-bold ${rateColor(data.postedOnly.rate)}`}>
                {data.postedOnly.rate}%
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {data.postedOnly.wins} acertos / {data.postedOnly.total} apostas
              </p>
            </div>

            <div className="rounded-lg border p-6 bg-gray-50 border-gray-300">
              <p className="text-sm font-medium text-gray-500">Taxa Nao Postadas</p>
              <p className="mt-1 text-3xl font-bold text-gray-600">
                {data.notPosted.rate}%
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {data.notPosted.wins} acertos / {data.notPosted.total} apostas
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
            keyFn={(r) => (r as MarketRow).market}
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
            keyFn={(r) => {
              const cr = r as ChampionshipRow;
              return `${cr.country}|${cr.league_name}`;
            }}
            toggleSort={champSort.toggleSort}
            sortIcon={champSort.sortIcon}
          />

          {/* By Group Table — super_admin only */}
          {role !== null && role === 'super_admin' && data.byGroup.length > 0 && (
            <BreakdownTable
              title="Acerto por Grupo"
              rows={groupSort.sorted}
              labelHeader="Grupo"
              labelFn={(r) => (r as GroupRow).group_name}
              keyFn={(r) => (r as GroupRow).group_id}
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
  keyFn,
  toggleSort,
  sortIcon,
}: {
  title: string;
  rows: BreakdownRow[];
  labelHeader: string;
  labelFn: (row: BreakdownRow) => string;
  keyFn: (row: BreakdownRow) => string;
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
            {rows.map((row) => (
              <tr key={keyFn(row)} className="hover:bg-gray-50">
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

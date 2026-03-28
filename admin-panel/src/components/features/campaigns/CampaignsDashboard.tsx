'use client';

import { useState, useEffect, useCallback } from 'react';
import StatCard from '@/components/features/dashboard/StatCard';

type Period = '7d' | '30d' | '90d' | 'all';

interface AffiliateRow {
  code: string;
  clicks: number;
  uniqueMembers: number;
  trials: number;
  active: number;
  cancelled: number;
  conversionRate: number;
  lastClickAt: string | null;
}

interface CampaignsData {
  summary: {
    totalAffiliates: number;
    activeAffiliates: number;
    totalClicks: number;
    globalConversionRate: number;
  };
  affiliates: AffiliateRow[];
}

type SortField = 'code' | 'clicks' | 'trials' | 'active' | 'cancelled' | 'conversionRate' | 'lastClickAt';

interface SortHeaderProps {
  field: SortField;
  sortField: SortField;
  sortAsc: boolean;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}

function SortHeader({ field, sortField, sortAsc, onSort, children }: SortHeaderProps) {
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-gray-400">{sortAsc ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );
}

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'all', label: 'Todos' },
];

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-16" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden animate-pulse">
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  );
}

export function CampaignsDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<CampaignsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('clicks');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/stats?period=${period}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || 'Erro ao carregar dados');
        return;
      }
      setData(json.data);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedAffiliates = data?.affiliates
    ? [...data.affiliates].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      })
    : [];

  const conversionColor = (rate: number) => {
    if (rate >= 70) return 'text-green-600';
    if (rate >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
        <p className="text-sm text-gray-500 mt-1">Performance dos códigos de afiliados</p>
      </div>

      {/* Period filter */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              period === p.value
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Afiliados"
            value={data.summary.totalAffiliates}
            subtitle="Códigos únicos"
          />
          <StatCard
            title="Afiliados Ativos"
            value={data.summary.activeAffiliates}
            subtitle="Últimos 14 dias"
          />
          <StatCard
            title="Total de Cliques"
            value={data.summary.totalClicks}
            subtitle={`Período: ${PERIODS.find((p) => p.value === period)?.label}`}
          />
          <StatCard
            title="Taxa de Conversão"
            value={data.summary.globalConversionRate}
            subtitle="Afiliados → Ativos (%)"
          />
        </div>
      ) : null}

      {/* Affiliates table */}
      {loading ? (
        <SkeletonTable />
      ) : data && data.affiliates.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader field="code" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Código</SortHeader>
                  <SortHeader field="clicks" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Cliques</SortHeader>
                  <SortHeader field="trials" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Trials</SortHeader>
                  <SortHeader field="active" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Ativos</SortHeader>
                  <SortHeader field="cancelled" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Cancelados</SortHeader>
                  <SortHeader field="conversionRate" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Conversão</SortHeader>
                  <SortHeader field="lastClickAt" sortField={sortField} sortAsc={sortAsc} onSort={handleSort}>Último Clique</SortHeader>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAffiliates.map((affiliate) => (
                  <tr key={affiliate.code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {affiliate.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{affiliate.clicks}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{affiliate.trials}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{affiliate.active}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{affiliate.cancelled}</td>
                    <td className={`px-4 py-3 text-sm font-medium ${conversionColor(affiliate.conversionRate)}`}>
                      {affiliate.conversionRate}%
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {affiliate.lastClickAt
                        ? new Date(affiliate.lastClickAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !loading && data ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">Nenhum dado de afiliados encontrado.</p>
          <p className="text-gray-400 text-sm mt-2">
            Distribua links com códigos de afiliado para começar a rastrear.
          </p>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { SuggestedBetListItem, BetPagination } from '@/types/database';
import { BetStatusBadge } from './BetStatusBadge';
import type { BetStatus } from '@/types/database';
import { categorizeMarket, CATEGORY_STYLES, formatPickDisplay } from '@/lib/bet-categories';

interface BetTableProps {
  bets: SuggestedBetListItem[];
  pagination: BetPagination;
  role: 'super_admin' | 'group_admin';
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onPageChange: (page: number) => void;
  onEditOdds: (bet: SuggestedBetListItem) => void;
  onEditLink?: (bet: SuggestedBetListItem) => void;
  onSort: (field: string) => void;
  sortBy: string;
  sortDir: string;
}

function formatKickoffDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCreatedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getHitRateStyle(rate: number): string {
  if (rate >= 70) return 'text-green-700 bg-green-50';
  if (rate >= 50) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

export function BetTable({
  bets,
  pagination,
  role,
  selectedIds,
  onSelectionChange,
  onPageChange,
  onEditOdds,
  onEditLink,
  onSort,
  sortBy,
  sortDir,
}: BetTableProps) {
  const isSuperAdmin = role === 'super_admin';
  const allSelected = bets.length > 0 && bets.every((b) => selectedIds.has(b.id));
  const [showHitRateTooltip, setShowHitRateTooltip] = useState(false);

  function getDistributionStatus(bet: SuggestedBetListItem): { label: string; className: string } {
    if (bet.group_id) {
      return { label: 'Distribuida', className: 'bg-emerald-100 text-emerald-800' };
    }
    return { label: 'Nao distribuida', className: 'bg-gray-100 text-gray-700' };
  }

  function toggleAll() {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(bets.map((b) => b.id)));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    const isActive = sortBy === field;
    return (
      <th
        className="cursor-pointer px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900"
        onClick={() => onSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {isActive && (
            <span className="text-blue-600">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
          )}
        </span>
      </th>
    );
  }

  if (bets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
        Nenhuma aposta encontrada
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {isSuperAdmin && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    aria-label="Selecionar todas"
                  />
                </th>
              )}
              <SortHeader field="kickoff_time">Jogo</SortHeader>
              <SortHeader field="kickoff_time">Data Jogo</SortHeader>
              <SortHeader field="bet_market">Mercado</SortHeader>
              <SortHeader field="bet_pick">Pick</SortHeader>
              <th className="relative px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                <span className="inline-flex items-center gap-1">
                  Taxa Hist.
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 hover:bg-gray-300"
                    onClick={() => setShowHitRateTooltip(!showHitRateTooltip)}
                    onMouseEnter={() => setShowHitRateTooltip(true)}
                    onMouseLeave={() => setShowHitRateTooltip(false)}
                    aria-label="Info taxa historica"
                  >
                    i
                  </button>
                </span>
                {showHitRateTooltip && (
                  <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg bg-gray-900 p-3 text-xs font-normal normal-case tracking-normal text-white shadow-lg">
                    Taxa de acerto historica para esta combinacao de liga e categoria de mercado. Baseada em apostas com resultado definido (minimo 3 apostas). Categorias: Gols, Escanteios, Cartoes, BTTS, Outros.
                  </div>
                )}
              </th>
              <SortHeader field="odds">Odds</SortHeader>
              <SortHeader field="deep_link">Link</SortHeader>
              <SortHeader field="group_id">Grupo</SortHeader>
              <SortHeader field="bet_status">Status</SortHeader>
              <SortHeader field="distributed_at">Distribuicao</SortHeader>
              <SortHeader field="created_at">Criada</SortHeader>
              {isSuperAdmin && (
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Acoes</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bets.map((bet) => {
              const match = bet.league_matches;
              const distribution = getDistributionStatus(bet);
              const category = categorizeMarket(bet.bet_market);
              const categoryStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES['Outros'];
              const pickDisplay = formatPickDisplay(bet.bet_market, bet.bet_pick);

              return (
                <tr key={bet.id} className={`hover:bg-gray-50 ${selectedIds.has(bet.id) ? 'bg-blue-50' : ''}`}>
                  {isSuperAdmin && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(bet.id)}
                        onChange={() => toggleOne(bet.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        aria-label={`Selecionar aposta ${bet.id}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">
                    {match ? `${match.home_team_name} vs ${match.away_team_name}` : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {match ? formatKickoffDate(match.kickoff_time) : '-'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryStyle}`}>
                      {category}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={pickDisplay}>
                    {pickDisplay}
                  </td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    {bet.hit_rate ? (
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${getHitRateStyle(bet.hit_rate.rate)}`}>
                        {bet.hit_rate.rate.toFixed(0)}% ({bet.hit_rate.wins}/{bet.hit_rate.total})
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {bet.odds != null ? (
                      <span className={`font-medium ${bet.odds < 1.60 ? 'text-orange-600' : 'text-gray-900'}`}>
                        {bet.odds.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {bet.deep_link ? (
                      <a
                        href={bet.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                        title={bet.deep_link}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {bet.groups?.name ?? <span className="text-gray-400">Nao distribuida</span>}
                  </td>
                  <td className="px-3 py-3">
                    <BetStatusBadge status={bet.bet_status as BetStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${distribution.className}`}>
                      {distribution.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {formatCreatedDate(bet.created_at)}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditOdds(bet)}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          Editar Odds
                        </button>
                        {onEditLink && (
                          <button
                            onClick={() => onEditLink(bet)}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            Editar Link
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Pagina {pagination.page} de {pagination.total_pages} ({pagination.total} apostas)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Proximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

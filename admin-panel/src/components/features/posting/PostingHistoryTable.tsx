'use client';

import { useState, useMemo } from 'react';

export interface HistoryBet {
  id: number;
  bet_market: string;
  bet_pick: string;
  odds: number | null;
  odds_at_post: number | null;
  bet_status: string;
  telegram_posted_at: string | null;
  telegram_message_id: number | null;
  group_id: string | null;
  historico_postagens: unknown[] | null;
  created_at: string;
  league_matches: {
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
  };
  groups: { name: string } | null;
}

interface PostingHistoryTableProps {
  bets: HistoryBet[];
  sortBy: string;
  sortDir: string;
  onSort: (field: string) => void;
  emptyMessage?: string;
}

type SortField = 'match' | 'kickoff_time' | 'odds_at_post' | 'group' | 'telegram_posted_at' | 'status';

function formatDateTime(isoString: string | null) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function getPostingStatus(bet: HistoryBet): { label: string; className: string } {
  if (bet.bet_status === 'posted' && bet.telegram_posted_at) {
    return {
      label: 'Postada',
      className: 'bg-blue-100 text-blue-800',
    };
  }

  const kickoff = new Date(bet.league_matches.kickoff_time);
  if (bet.bet_status === 'ready' && kickoff > new Date()) {
    return {
      label: 'Pendente',
      className: 'bg-yellow-100 text-yellow-800',
    };
  }

  if (bet.bet_status === 'ready' && kickoff <= new Date() && !bet.telegram_posted_at) {
    return {
      label: 'Não postada',
      className: 'bg-red-100 text-red-800',
    };
  }

  return {
    label: bet.bet_status,
    className: 'bg-gray-100 text-gray-800',
  };
}

function SortIcon({ field, currentSort, currentDir }: { field: string; currentSort: string; currentDir: string }) {
  if (currentSort !== field) {
    return <span className="text-gray-400 ml-1">↕</span>;
  }
  return <span className="ml-1">{currentDir === 'asc' ? '↑' : '↓'}</span>;
}

export function PostingHistoryTable({
  bets,
  sortBy,
  sortDir,
  onSort,
  emptyMessage = 'Nenhuma postagem encontrada',
}: PostingHistoryTableProps) {
  if (bets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
              onClick={() => onSort('kickoff_time')}
            >
              Jogo
              <SortIcon field="kickoff_time" currentSort={sortBy} currentDir={sortDir} />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Mercado
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
              onClick={() => onSort('odds_at_post')}
            >
              Odds
              <SortIcon field="odds_at_post" currentSort={sortBy} currentDir={sortDir} />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Grupo
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
              onClick={() => onSort('telegram_posted_at')}
            >
              Postado em
              <SortIcon field="telegram_posted_at" currentSort={sortBy} currentDir={sortDir} />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Msg ID
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {bets.map((bet) => {
            const status = getPostingStatus(bet);
            const match = bet.league_matches;
            return (
              <tr key={bet.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {match.home_team_name} vs {match.away_team_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDateTime(match.kickoff_time)}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {bet.bet_market} — {bet.bet_pick}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {bet.odds_at_post?.toFixed(2) ?? bet.odds?.toFixed(2) ?? '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {bet.groups?.name ?? '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {formatDateTime(bet.telegram_posted_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {bet.telegram_message_id ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

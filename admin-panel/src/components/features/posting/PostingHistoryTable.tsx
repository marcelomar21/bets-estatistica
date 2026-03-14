'use client';

import { BetResultBadge } from './BetResultBadge';
import type { BetResult } from './BetResultBadge';
import { formatDateTimeShort } from '@/lib/format-utils';

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
  bet_result: BetResult;
  result_reason: string | null;
  result_source: string | null;
  result_confidence: string | null;
  result_updated_at: string | null;
  league_matches: {
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
    league_seasons?: {
      league_name: string;
      country: string;
    } | null;
  };
  groups: { name: string } | null;
}

interface PostingHistoryTableProps {
  bets: HistoryBet[];
  sortBy: string;
  sortDir: string;
  onSort: (field: string) => void;
  onEditResult?: (bet: HistoryBet) => void;
  emptyMessage?: string;
}

function formatDateTimeOrDash(isoString: string | null) {
  if (!isoString) return '—';
  return formatDateTimeShort(isoString);
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

function getRowClassName(bet: HistoryBet): string {
  if (bet.bet_result === 'success') return 'bg-green-50 hover:bg-green-100';
  if (bet.bet_result === 'failure') return 'bg-red-50 hover:bg-red-100';
  return 'hover:bg-gray-50';
}

const SOURCE_LABELS: Record<string, string> = {
  deterministic: 'Det.',
  llm: 'LLM',
  consensus: 'Consenso',
  manual: 'Manual',
};

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
  onEditResult,
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
              Campeonato
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
            <th
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
              onClick={() => onSort('bet_result')}
            >
              Resultado
              <SortIcon field="bet_result" currentSort={sortBy} currentDir={sortDir} />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Explicação
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {bets.map((bet) => {
            const status = getPostingStatus(bet);
            const match = bet.league_matches;
            return (
              <tr key={bet.id} className={getRowClassName(bet)}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {match.home_team_name} vs {match.away_team_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDateTimeOrDash(match.kickoff_time)}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {match.league_seasons?.league_name ?? '—'}
                </td>
                <td
                  className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate"
                  title={`${bet.bet_market} — ${bet.bet_pick}`}
                >
                  {bet.bet_market} — {bet.bet_pick}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {bet.odds_at_post?.toFixed(2) ?? bet.odds?.toFixed(2) ?? '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {bet.groups?.name ?? '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {formatDateTimeOrDash(bet.telegram_posted_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <BetResultBadge result={bet.bet_result} />
                    {onEditResult && (
                      <button
                        type="button"
                        onClick={() => onEditResult(bet)}
                        className="text-gray-400 hover:text-blue-600"
                        title="Editar resultado"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                  {bet.result_reason ? (
                    <div>
                      <span className="line-clamp-2" title={bet.result_reason}>{bet.result_reason}</span>
                      {bet.result_source && (
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          {SOURCE_LABELS[bet.result_source] ?? bet.result_source}
                        </span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { categorizeMarket, CATEGORY_STYLES, formatPickDisplay } from '@/lib/bet-categories';

interface QueueBet {
  id: number;
  bet_market: string;
  bet_pick: string;
  bet_status: string;
  odds: number | null;
  has_link: boolean;
  deep_link: string | null;
  hit_rate?: { rate: number; wins: number; total: number } | null;
  match: {
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
  };
}

interface PostingQueueTableProps {
  bets: QueueBet[];
  onRemove?: (betId: number) => Promise<void>;
  onEditOdds?: (bet: QueueBet) => void;
  onEditLink?: (bet: QueueBet) => void;
  onPromote?: (betId: number) => Promise<void>;
  emptyMessage?: string;
}

export type { QueueBet };

type SortField = 'id' | 'match' | 'kickoff_time' | 'market' | 'pick' | 'hit_rate' | 'odds' | 'link' | 'status';
type SortDir = 'asc' | 'desc';

function getStatusBadge(bet: QueueBet) {
  if (bet.bet_status === 'ready') {
    return { label: 'pronta', className: 'bg-green-100 text-green-800' };
  }
  if (!bet.has_link) {
    return { label: 'faltando link', className: 'bg-yellow-100 text-yellow-800' };
  }
  return { label: 'faltando odds', className: 'bg-orange-100 text-orange-800' };
}

function formatKickoffDate(isoString: string) {
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function getHitRateStyle(rate: number): string {
  if (rate >= 70) return 'text-green-700 bg-green-50';
  if (rate >= 50) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

function compareBets(a: QueueBet, b: QueueBet, field: SortField, dir: SortDir): number {
  let result = 0;

  switch (field) {
    case 'id':
      result = a.id - b.id;
      break;
    case 'match':
      result = a.match.home_team_name.localeCompare(b.match.home_team_name);
      break;
    case 'kickoff_time':
      result = new Date(a.match.kickoff_time).getTime() - new Date(b.match.kickoff_time).getTime();
      break;
    case 'market':
      result = categorizeMarket(a.bet_market).localeCompare(categorizeMarket(b.bet_market));
      break;
    case 'pick':
      result = formatPickDisplay(a.bet_market, a.bet_pick).localeCompare(formatPickDisplay(b.bet_market, b.bet_pick));
      break;
    case 'hit_rate': {
      const rateA = a.hit_rate?.rate ?? -1;
      const rateB = b.hit_rate?.rate ?? -1;
      result = rateA - rateB;
      break;
    }
    case 'odds': {
      const oddsA = a.odds ?? -1;
      const oddsB = b.odds ?? -1;
      result = oddsA - oddsB;
      break;
    }
    case 'link': {
      const linkA = a.has_link ? 1 : 0;
      const linkB = b.has_link ? 1 : 0;
      result = linkA - linkB;
      break;
    }
    case 'status':
      result = a.bet_status.localeCompare(b.bet_status);
      break;
  }

  return dir === 'asc' ? result : -result;
}

export function PostingQueueTable({ bets, onRemove, onEditOdds, onEditLink, onPromote, emptyMessage }: PostingQueueTableProps) {
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('kickoff_time');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const sortedBets = useMemo(
    () => [...bets].sort((a, b) => compareBets(a, b, sortField, sortDir)),
    [bets, sortField, sortDir],
  );

  async function handleRemove(betId: number) {
    if (!onRemove) return;
    setRemovingId(betId);
    try {
      await onRemove(betId);
    } finally {
      setRemovingId(null);
      setConfirmId(null);
    }
  }

  function SortHeader({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) {
    const isActive = sortField === field;
    return (
      <th
        className={`cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900 ${className ?? ''}`}
        onClick={() => handleSort(field)}
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
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-500">{emptyMessage ?? 'Nenhuma aposta na fila de postagem.'}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortHeader field="id">ID</SortHeader>
            <SortHeader field="match">Jogo</SortHeader>
            <SortHeader field="market">Mercado</SortHeader>
            <SortHeader field="pick">Pick</SortHeader>
            <SortHeader field="hit_rate">Taxa Hist.</SortHeader>
            <SortHeader field="odds">Odds</SortHeader>
            <SortHeader field="link" className="text-center">Link</SortHeader>
            <SortHeader field="kickoff_time">Data Jogo</SortHeader>
            <SortHeader field="status">Status</SortHeader>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
              Acoes
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sortedBets.map((bet) => {
            const status = getStatusBadge(bet);
            const category = categorizeMarket(bet.bet_market);
            const categoryStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES['Outros'];
            const pickDisplay = formatPickDisplay(bet.bet_market, bet.bet_pick);

            return (
              <tr key={bet.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs font-mono text-gray-500">
                  {bet.id}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  <span className="font-medium">{bet.match.home_team_name}</span>
                  {' x '}
                  <span className="font-medium">{bet.match.away_team_name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryStyle}`}>
                    {category}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={pickDisplay}>
                  {pickDisplay}
                </td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">
                  {bet.hit_rate ? (
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${getHitRateStyle(bet.hit_rate.rate)}`}>
                      {bet.hit_rate.rate.toFixed(0)}% ({bet.hit_rate.wins}/{bet.hit_rate.total})
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {bet.odds !== null ? (
                    <span className={`font-medium ${bet.odds < 1.60 ? 'text-orange-600' : 'text-gray-900'}`}>
                      {bet.odds.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {bet.has_link ? (
                    bet.deep_link ? (
                      <a
                        href={bet.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 hover:bg-green-200"
                        title={bet.deep_link}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </a>
                    ) : (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600" title="Link disponivel">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600" title="Sem link">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                  {formatKickoffDate(bet.match.kickoff_time)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    {/* Promote action */}
                    {bet.bet_status !== 'ready' && onPromote && (
                      <button
                        onClick={async () => {
                          setPromotingId(bet.id);
                          try { await onPromote(bet.id); } finally { setPromotingId(null); }
                        }}
                        disabled={promotingId === bet.id}
                        className="rounded px-2 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-50"
                        title="Promover para a fila de postagem"
                      >
                        {promotingId === bet.id ? '...' : 'Promover'}
                      </button>
                    )}
                    {/* Edit actions for pending bets */}
                    {bet.bet_status !== 'ready' && onEditOdds && bet.odds === null && (
                      <button
                        onClick={() => onEditOdds(bet)}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Odds
                      </button>
                    )}
                    {bet.bet_status !== 'ready' && onEditLink && !bet.has_link && (
                      <button
                        onClick={() => onEditLink(bet)}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Link
                      </button>
                    )}
                    {/* Remove action */}
                    {onRemove && (
                      confirmId === bet.id ? (
                        <>
                          <button
                            onClick={() => handleRemove(bet.id)}
                            disabled={removingId === bet.id}
                            className="rounded px-2 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-50"
                          >
                            {removingId === bet.id ? '...' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="rounded px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                          >
                            Nao
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmId(bet.id)}
                          className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"
                          title="Remover da fila"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

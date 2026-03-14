'use client';

import { useState, useEffect, useRef } from 'react';
import type { SuggestedBetListItem, OddsHistoryEntry } from '@/types/database';
import { BetStatusBadge } from './BetStatusBadge';
import type { BetStatus } from '@/types/database';
import { categorizeMarket, CATEGORY_STYLES, formatPickDisplay } from '@/lib/bet-categories';
import { formatDateTime, formatDateTimeShort } from '@/lib/format-utils';

interface BetEditDrawerProps {
  bet: SuggestedBetListItem;
  onClose: () => void;
  onSaveOdds: (betId: number, odds: number) => Promise<void>;
  onSaveLink: (betId: number, link: string | null) => Promise<void>;
  oddsHistory: OddsHistoryEntry[];
  historyLoading: boolean;
}

function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 2048) return 'URL muito longa (maximo 2048 caracteres)';
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'O link deve comecar com http:// ou https://';
  }
  try {
    new URL(trimmed);
    return null;
  } catch {
    return 'URL invalida';
  }
}

export function BetEditDrawer({
  bet,
  onClose,
  onSaveOdds,
  onSaveLink,
  oddsHistory,
  historyLoading,
}: BetEditDrawerProps) {
  const match = bet.league_matches;
  const category = categorizeMarket(bet.bet_market);
  const categoryStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES['Outros'];
  const pickDisplay = formatPickDisplay(bet.bet_market, bet.bet_pick);

  // Odds state
  const [oddsInput, setOddsInput] = useState(bet.odds?.toString() ?? '');
  const [oddsError, setOddsError] = useState('');
  const [oddsSaving, setOddsSaving] = useState(false);
  const [oddsSuccess, setOddsSuccess] = useState(false);

  // Link state
  const [linkInput, setLinkInput] = useState(bet.deep_link ?? '');
  const [linkError, setLinkError] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);

  const oddsInputRef = useRef<HTMLInputElement>(null);

  const MIN_ODDS = 1.60;

  // Reset form when bet changes
  useEffect(() => {
    setOddsInput(bet.odds?.toString() ?? '');
    setLinkInput(bet.deep_link ?? '');
    setOddsError('');
    setLinkError('');
    setOddsSuccess(false);
    setLinkSuccess(false);
  }, [bet.id, bet.odds, bet.deep_link]);

  // Auto-focus odds input if no odds set
  useEffect(() => {
    if (!bet.odds && oddsInputRef.current) {
      oddsInputRef.current.focus();
    }
  }, [bet.id, bet.odds]);

  async function handleSaveOdds(e: React.FormEvent) {
    e.preventDefault();
    setOddsError('');
    setOddsSuccess(false);

    const newOdds = parseFloat(oddsInput);
    if (isNaN(newOdds) || newOdds <= 0) {
      setOddsError('Odds deve ser um numero positivo');
      return;
    }

    setOddsSaving(true);
    try {
      await onSaveOdds(bet.id, newOdds);
      setOddsSuccess(true);
      setTimeout(() => setOddsSuccess(false), 3000);
    } catch {
      setOddsError('Erro ao salvar odds');
    } finally {
      setOddsSaving(false);
    }
  }

  async function handleSaveLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkError('');
    setLinkSuccess(false);

    const trimmed = linkInput.trim();
    const validationError = validateUrl(trimmed);
    if (validationError) {
      setLinkError(validationError);
      return;
    }

    const newLink = trimmed.length === 0 ? null : trimmed;

    setLinkSaving(true);
    try {
      await onSaveLink(bet.id, newLink);
      setLinkSuccess(true);
      setTimeout(() => setLinkSuccess(false), 3000);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Erro ao salvar link');
    } finally {
      setLinkSaving(false);
    }
  }

  const showOddsWarning = oddsInput && parseFloat(oddsInput) < MIN_ODDS && parseFloat(oddsInput) > 0;
  const linkTrimmed = linkInput.trim();
  const hasLink = linkTrimmed.length > 0;
  const linkIsValid = !validateUrl(linkTrimmed);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Editar Aposta</h2>
            <BetStatusBadge status={bet.bet_status as BetStatus} />
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Bet Info Card */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400">#{bet.id}</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryStyle}`}>
                {category}
              </span>
            </div>
            {match && (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  {match.home_team_name} vs {match.away_team_name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(match.kickoff_time)}
                  {match.league_seasons?.league_name && ` \u2022 ${match.league_seasons.league_name}`}
                </p>
              </>
            )}
            <p className="text-sm text-gray-600">
              {bet.bet_market} {'\u2014'} {pickDisplay}
            </p>
            {bet.hit_rate && (
              <p className="text-xs text-gray-500">
                Taxa historica: {bet.hit_rate.rate.toFixed(0)}% ({bet.hit_rate.wins}/{bet.hit_rate.total})
              </p>
            )}
          </div>

          {/* Odds Section */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Odds</h3>
              {bet.odds != null && (
                <span className={`text-sm font-medium ${bet.odds < MIN_ODDS ? 'text-orange-600' : 'text-green-700'}`}>
                  Atual: {bet.odds.toFixed(2)}
                </span>
              )}
              {!bet.odds && (
                <span className="text-xs text-orange-500 font-medium">Pendente</span>
              )}
            </div>
            <form onSubmit={handleSaveOdds} className="flex gap-2">
              <input
                ref={oddsInputRef}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Ex: 1.85"
                value={oddsInput}
                onChange={(e) => setOddsInput(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={oddsSaving}
              />
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={oddsSaving}
              >
                {oddsSaving ? '...' : 'Salvar'}
              </button>
            </form>
            {showOddsWarning && (
              <p className="text-xs text-orange-600">
                Odds abaixo de {MIN_ODDS}. A aposta nao sera promovida automaticamente.
              </p>
            )}
            {oddsError && <p className="text-xs text-red-600">{oddsError}</p>}
            {oddsSuccess && <p className="text-xs text-green-600">Odds salvo com sucesso!</p>}
          </div>

          {/* Link Section */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Link</h3>
              {bet.deep_link ? (
                <a
                  href={bet.deep_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline truncate max-w-[180px]"
                  title={bet.deep_link}
                >
                  Abrir link atual
                </a>
              ) : (
                <span className="text-xs text-orange-500 font-medium">Pendente</span>
              )}
            </div>
            <form onSubmit={handleSaveLink} className="space-y-2">
              <input
                type="text"
                placeholder="https://..."
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={linkSaving}
              />
              <div className="flex items-center justify-between">
                <div>
                  {hasLink && linkIsValid && (
                    <span className="text-xs text-green-600">URL valida</span>
                  )}
                  {bet.deep_link && (
                    <button
                      type="button"
                      onClick={() => { setLinkInput(''); setLinkError(''); }}
                      className="ml-2 text-xs text-red-500 hover:text-red-700"
                      disabled={linkSaving}
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={linkSaving}
                >
                  {linkSaving ? '...' : 'Salvar'}
                </button>
              </div>
            </form>
            {linkError && <p className="text-xs text-red-600">{linkError}</p>}
            {linkSuccess && <p className="text-xs text-green-600">Link salvo com sucesso!</p>}
          </div>

          {/* Odds History */}
          {historyLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            </div>
          ) : oddsHistory.length > 0 ? (
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">Historico de Odds</h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-1">Anterior</th>
                      <th className="pb-1">Novo</th>
                      <th className="pb-1">Origem</th>
                      <th className="pb-1">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oddsHistory.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-100">
                        <td className="py-1 text-gray-600">{entry.old_value ?? '-'}</td>
                        <td className="py-1 font-medium">{entry.new_value}</td>
                        <td className="py-1 text-gray-500">{entry.job_name}</td>
                        <td className="py-1 text-gray-400">
                          {formatDateTimeShort(entry.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Notes */}
          {bet.notes && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">Notas</p>
              <p className="mt-1 text-sm text-amber-900">{bet.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}

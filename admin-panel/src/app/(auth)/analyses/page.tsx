'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GameAnalysisListItem } from '@/types/database';

interface AnalysisRow {
  id: number;
  match_id: number;
  pdf_storage_path: string | null;
  pdf_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
  league_matches: {
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
  };
}

export default function AnalysesPage() {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchAnalyses = useCallback(async () => {
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (dateFilter) params.set('date', dateFilter);
    if (teamFilter) params.set('team', teamFilter);

    try {
      const res = await fetch(`/api/analyses?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar analises');
        return;
      }

      setAnalyses(json.data ?? []);
    } catch {
      setError('Erro de conexao ao carregar analises');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, teamFilter]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  async function handleOpenPdf(analysisId: number) {
    setPdfLoading(analysisId);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/pdf`);
      const json = await res.json();

      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao obter PDF', 'error');
        return;
      }

      window.open(json.data.url, '_blank');
    } catch {
      showToast('Erro de conexao ao obter PDF', 'error');
    } finally {
      setPdfLoading(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analises</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="date-filter" className="block text-sm font-medium text-gray-700">
            Data
          </label>
          <input
            id="date-filter"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="team-filter" className="block text-sm font-medium text-gray-700">
            Time
          </label>
          <input
            id="team-filter"
            type="text"
            placeholder="Ex: Flamengo"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        {(dateFilter || teamFilter) && (
          <button
            onClick={() => {
              setDateFilter('');
              setTeamFilter('');
            }}
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
      ) : analyses.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhuma analise encontrada
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Jogo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Data do Jogo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  PDF
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Criado em
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Acao
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {analyses.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {a.league_matches.home_team_name} vs {a.league_matches.away_team_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatDate(a.league_matches.kickoff_time)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {a.pdf_storage_path ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Disponivel
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        Sem PDF
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatDate(a.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    {a.pdf_storage_path ? (
                      <button
                        onClick={() => handleOpenPdf(a.id)}
                        disabled={pdfLoading === a.id}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {pdfLoading === a.id ? 'Abrindo...' : 'Ver PDF'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

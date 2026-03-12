'use client';

import { useState, useEffect, useCallback } from 'react';
import { JobExecutionsTable } from '@/components/features/jobs/JobExecutionsTable';
import { JobHealthSummary } from '@/components/features/jobs/JobHealthSummary';
import { SuperAdminGuard } from '@/components/guards/SuperAdminGuard';
import type { JobExecution } from '@/components/features/jobs/JobExecutionsTable';

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface Counters {
  total: number;
  success: number;
  failed: number;
  success_rate: number;
}

interface HealthData {
  total_jobs: number;
  failed_count: number;
  status: 'healthy' | 'degraded';
  last_error: { job_name: string; error_message: string | null; started_at: string } | null;
}

interface JobSummary {
  id: string;
  job_name: string;
  started_at: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
}

const DEFAULT_PAGINATION: Pagination = { page: 1, per_page: 50, total: 0, total_pages: 0 };
const DEFAULT_COUNTERS: Counters = { total: 0, success: 0, failed: 0, success_rate: 100 };
const DEFAULT_HEALTH: HealthData = { total_jobs: 0, failed_count: 0, status: 'healthy', last_error: null };

export default function JobExecutionsPage() {
  return (
    <SuperAdminGuard>
      <JobExecutionsContent />
    </SuperAdminGuard>
  );
}

function JobExecutionsContent() {
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);
  const [counters, setCounters] = useState<Counters>(DEFAULT_COUNTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobNameFilter, setJobNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);

  // Summary data
  const [summaryJobs, setSummaryJobs] = useState<JobSummary[]>([]);
  const [health, setHealth] = useState<HealthData>(DEFAULT_HEALTH);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Known job names (extracted from summary)
  const [jobNames, setJobNames] = useState<string[]>([]);

  // Fetch summary
  useEffect(() => {
    async function fetchSummary() {
      setSummaryLoading(true);
      try {
        const res = await fetch('/api/job-executions/summary');
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) {
          setSummaryJobs(json.data.jobs);
          setHealth(json.data.health);
          setJobNames(json.data.jobs.map((j: JobSummary) => j.job_name).sort());
        }
      } catch {
        // Summary is non-critical
      } finally {
        setSummaryLoading(false);
      }
    }
    fetchSummary();
  }, []);

  const fetchExecutions = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      if (jobNameFilter) params.set('job_name', jobNameFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (hideEmpty) params.set('hide_empty', '1');

      const res = await fetch(`/api/job-executions?${params}`);
      if (!res.ok) {
        setError(`Erro HTTP ${res.status}`);
        return;
      }
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar execuções');
        return;
      }

      setExecutions(json.data.items);
      setPagination(json.data.pagination);
      setCounters(json.data.counters);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, [jobNameFilter, statusFilter, hideEmpty]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Execuções de Jobs</h1>

      {/* Health summary */}
      <JobHealthSummary jobs={summaryJobs} health={health} loading={summaryLoading} />

      {/* Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Execuções</p>
          <p className="text-2xl font-bold text-gray-900">{counters.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Sucesso</p>
          <p className="text-2xl font-bold text-green-600">{counters.success}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Falhas</p>
          <p className="text-2xl font-bold text-red-600">{counters.failed}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Taxa de Sucesso</p>
          <p className="text-2xl font-bold text-green-600">{counters.success_rate}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="job-name-filter" className="text-sm font-medium text-gray-700">Job:</label>
          <select
            id="job-name-filter"
            value={jobNameFilter}
            onChange={(e) => setJobNameFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
          >
            <option value="">Todos</option>
            {jobNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">Status:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
          >
            <option value="">Todos</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="hide-empty"
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="hide-empty" className="text-sm font-medium text-gray-700">
            Ocultar execucoes vazias
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : (
          <JobExecutionsTable executions={executions} />
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Página {pagination.page} de {pagination.total_pages} ({pagination.total} registros)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchExecutions(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              onClick={() => fetchExecutions(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

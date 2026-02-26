'use client';

interface JobSummary {
  id: string;
  job_name: string;
  started_at: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
}

interface HealthData {
  total_jobs: number;
  failed_count: number;
  status: 'healthy' | 'degraded';
  last_error: { job_name: string; error_message: string | null; started_at: string } | null;
}

interface JobHealthSummaryProps {
  jobs: JobSummary[];
  health: HealthData;
  loading?: boolean;
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export function JobHealthSummary({ jobs, health, loading }: JobHealthSummaryProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Health status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Jobs Monitorados</p>
          <p className="text-2xl font-bold text-gray-900">{health.total_jobs}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Com Falha</p>
          <p className={`text-2xl font-bold ${health.failed_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {health.failed_count}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Status Geral</p>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            health.status === 'healthy'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {health.status === 'healthy' ? 'Saudável' : 'Degradado'}
          </span>
        </div>
      </div>

      {/* Last error highlight */}
      {health.last_error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">
            Último erro: <span className="font-bold">{health.last_error.job_name}</span>
          </p>
          <p className="text-sm text-red-700 mt-1">
            {health.last_error.error_message ?? 'Erro desconhecido'}
          </p>
          <p className="text-xs text-red-500 mt-1">
            {formatTimeAgo(health.last_error.started_at)}
          </p>
        </div>
      )}

      {/* Per-job status list */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700">Última Execução por Job</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {jobs.map((job) => (
            <div key={job.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{job.job_name}</p>
                <p className="text-xs text-gray-500">{formatTimeAgo(job.started_at)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                job.status === 'success' ? 'bg-green-100 text-green-800' :
                job.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {job.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

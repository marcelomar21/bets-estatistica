'use client';

export interface JobExecution {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
}

interface JobExecutionsTableProps {
  executions: JobExecution[];
  emptyMessage?: string;
}

function formatDateTime(isoString: string) {
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatResult(jobName: string, result: Record<string, unknown> | null): string {
  if (!result) return '';

  switch (jobName) {
    case 'post-bets':
    case 'post-bets-manual': {
      const posted = (result.posted as number) || 0;
      const reposted = (result.reposted as number) || 0;
      const sf = (result.sendFailed as number) || 0;
      if (posted > 0 || reposted > 0) {
        const failPart = sf > 0 ? `, ${sf} fail` : '';
        return `${posted} posted, ${reposted} repost${failPart}`;
      }
      if (sf > 0) return `${sf} failed`;
      return 'nenhuma';
    }
    case 'track-results': {
      const tracked = (result.tracked as number) || 0;
      const green = (result.green as number) || 0;
      const red = (result.red as number) || 0;
      if (tracked > 0) return `${tracked} tracked (${green}G/${red}R)`;
      return 'nenhum';
    }
    case 'kick-expired':
      return `${(result.kicked as number) || (result.count as number) || 0} kicked`;
    case 'enrich-odds':
    case 'enrich-odds-manual':
      return `${(result.enriched as number) || (result.count as number) || 0} enriched`;
    case 'distribute-bets':
      return `${(result.distributed as number) || (result.count as number) || 0} distributed`;
    case 'healthCheck':
      if (result.alerts && Array.isArray(result.alerts) && result.alerts.length > 0) {
        return `${result.alerts.length} warns`;
      }
      return 'ok';
    default: {
      if (typeof result.count === 'number') return `${result.count} items`;
      const str = JSON.stringify(result);
      return str.length > 30 ? str.substring(0, 27) + '...' : str;
    }
  }
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  running: 'bg-yellow-100 text-yellow-800',
};

export function JobExecutionsTable({
  executions,
  emptyMessage = 'Nenhuma execução encontrada',
}: JobExecutionsTableProps) {
  if (executions.length === 0) {
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
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Início</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duração</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resultado</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Erro</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {executions.map((exec) => (
            <tr key={exec.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                {exec.job_name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {formatDateTime(exec.started_at)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {formatDuration(exec.duration_ms)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {formatResult(exec.job_name, exec.result)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[exec.status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {exec.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-red-600 max-w-xs truncate" title={exec.error_message ?? undefined}>
                {exec.error_message ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

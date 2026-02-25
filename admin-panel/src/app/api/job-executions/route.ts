import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const VALID_STATUSES = new Set(['success', 'failed', 'running']);
const VALID_SORT_DIRS = new Set(['asc', 'desc']);

function parsePositiveInt(rawValue: string | null, fallback: number): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase } = context;

    const url = new URL(req.url);

    const page = parsePositiveInt(url.searchParams.get('page'), DEFAULT_PAGE);
    const perPageRaw = parsePositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE);
    const perPage = Math.min(perPageRaw, MAX_PER_PAGE);
    const from = (page - 1) * perPage;

    const jobNameFilter = url.searchParams.get('job_name')?.trim() || null;
    const statusFilter = url.searchParams.get('status')?.trim().toLowerCase() || null;
    const sortDir = url.searchParams.get('sort_dir')?.trim().toLowerCase() || 'desc';

    // Validate
    if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Status invalido' } },
        { status: 400 },
      );
    }
    if (!VALID_SORT_DIRS.has(sortDir)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Direcao de ordenacao invalida' } },
        { status: 400 },
      );
    }

    // Main query
    let query = supabase
      .from('job_executions')
      .select('id, job_name, started_at, finished_at, status, duration_ms, result, error_message', { count: 'exact' });

    if (jobNameFilter) {
      query = query.eq('job_name', jobNameFilter);
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    query = query.order('started_at', { ascending: sortDir === 'asc' });

    // Counter queries
    let successQuery = supabase.from('job_executions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'success');
    let failedQuery = supabase.from('job_executions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    if (jobNameFilter) {
      successQuery = successQuery.eq('job_name', jobNameFilter);
      failedQuery = failedQuery.eq('job_name', jobNameFilter);
    }

    const [mainResult, successResult, failedResult] = await Promise.all([
      query.range(from, from + perPage - 1),
      successQuery,
      failedQuery,
    ]);

    if (mainResult.error || successResult.error || failedResult.error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar execucoes de jobs' } },
        { status: 500 },
      );
    }

    const total = mainResult.count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
    const successCount = successResult.count ?? 0;
    const failedCount = failedResult.count ?? 0;
    const totalExecutions = successCount + failedCount;

    return NextResponse.json({
      success: true,
      data: {
        items: mainResult.data ?? [],
        pagination: { page, per_page: perPage, total, total_pages: totalPages },
        counters: {
          total: totalExecutions,
          success: successCount,
          failed: failedCount,
          success_rate: totalExecutions > 0 ? Math.round((successCount / totalExecutions) * 100) : 100,
        },
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);

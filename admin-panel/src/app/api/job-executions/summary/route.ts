import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (_req, context) => {
    const { supabase } = context;

    // Fetch recent executions (last 100), then extract latest per job in JS
    // (Supabase doesn't support DISTINCT ON)
    const { data, error } = await supabase
      .from('job_executions')
      .select('id, job_name, started_at, finished_at, status, duration_ms, result, error_message')
      .order('started_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar resumo de jobs' } },
        { status: 500 },
      );
    }

    // Get latest execution per job_name
    const latestByJob = new Map<string, typeof data[0]>();
    for (const row of data ?? []) {
      if (!latestByJob.has(row.job_name)) {
        latestByJob.set(row.job_name, row);
      }
    }

    const jobs = Array.from(latestByJob.values());
    const failedJobs = jobs.filter(j => j.status === 'failed');
    const lastError = failedJobs.length > 0
      ? { job_name: failedJobs[0].job_name, error_message: failedJobs[0].error_message, started_at: failedJobs[0].started_at }
      : null;

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        health: {
          total_jobs: jobs.length,
          failed_count: failedJobs.length,
          status: failedJobs.length > 0 ? 'degraded' : 'healthy',
          last_error: lastError,
        },
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);

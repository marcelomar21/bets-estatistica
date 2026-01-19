-- Migration 011: Job Executions Logging
-- Tech-Spec: automacao-monitoramento-jobs
-- Purpose: Log de execuções de jobs para monitoramento e debugging

CREATE TABLE IF NOT EXISTS job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running/success/failed
  duration_ms INTEGER,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_executions_job_name ON job_executions(job_name);
CREATE INDEX IF NOT EXISTS idx_job_executions_started_at ON job_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_created_at ON job_executions(created_at);

COMMENT ON TABLE job_executions IS 'Log de execuções de jobs. Cleanup: DELETE WHERE created_at < NOW() - INTERVAL 30 days';
COMMENT ON COLUMN job_executions.status IS 'running = em execução, success = sucesso, failed = falhou';

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobExecutionsTable } from '../JobExecutionsTable';
import type { JobExecution } from '../JobExecutionsTable';

const mockExecution: JobExecution = {
  id: '1',
  job_name: 'post-bets',
  started_at: '2026-02-25T10:30:00Z',
  finished_at: '2026-02-25T10:30:05Z',
  status: 'success',
  duration_ms: 5000,
  result: { posted: 3, reposted: 1, sendFailed: 0 },
  error_message: null,
};

const mockFailedExecution: JobExecution = {
  id: '2',
  job_name: 'track-results',
  started_at: '2026-02-25T09:00:00Z',
  finished_at: '2026-02-25T09:00:02Z',
  status: 'failed',
  duration_ms: 2000,
  result: null,
  error_message: 'Connection timeout',
};

describe('JobExecutionsTable', () => {
  it('renders empty state message when no executions', () => {
    render(<JobExecutionsTable executions={[]} />);
    expect(screen.getByText('Nenhuma execução encontrada')).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(<JobExecutionsTable executions={[]} emptyMessage="Sem dados" />);
    expect(screen.getByText('Sem dados')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<JobExecutionsTable executions={[mockExecution]} />);
    expect(screen.getByText('Job')).toBeInTheDocument();
    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.getByText('Duração')).toBeInTheDocument();
    expect(screen.getByText('Resultado')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
  });

  it('renders job name in table row', () => {
    render(<JobExecutionsTable executions={[mockExecution]} />);
    expect(screen.getByText('post-bets')).toBeInTheDocument();
  });

  it('renders status badge with correct style', () => {
    render(<JobExecutionsTable executions={[mockExecution, mockFailedExecution]} />);
    const successBadge = screen.getByText('success');
    const failedBadge = screen.getByText('failed');
    expect(successBadge.className).toContain('bg-green-100');
    expect(failedBadge.className).toContain('bg-red-100');
  });

  it('formats duration correctly', () => {
    render(<JobExecutionsTable executions={[mockExecution]} />);
    // 5000ms → 5.0s
    expect(screen.getByText('5.0s')).toBeInTheDocument();
  });

  it('formats post-bets result correctly', () => {
    render(<JobExecutionsTable executions={[mockExecution]} />);
    expect(screen.getByText('3 posted, 1 repost')).toBeInTheDocument();
  });

  it('shows error message for failed executions', () => {
    render(<JobExecutionsTable executions={[mockFailedExecution]} />);
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('shows dash when no error message', () => {
    render(<JobExecutionsTable executions={[mockExecution]} />);
    // The error column shows '—' for null error_message
    const dashCells = screen.getAllByText('—');
    expect(dashCells.length).toBeGreaterThan(0);
  });
});

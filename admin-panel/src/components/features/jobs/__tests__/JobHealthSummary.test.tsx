import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobHealthSummary } from '../JobHealthSummary';

const mockHealthyJobs = [
  { id: '1', job_name: 'post-bets', started_at: '2026-02-25T10:00:00Z', status: 'success', duration_ms: 1000, error_message: null },
  { id: '2', job_name: 'track-results', started_at: '2026-02-25T09:00:00Z', status: 'success', duration_ms: 500, error_message: null },
];

const healthyHealth = {
  total_jobs: 2,
  failed_count: 0,
  status: 'healthy' as const,
  last_error: null,
};

const degradedHealth = {
  total_jobs: 2,
  failed_count: 1,
  status: 'degraded' as const,
  last_error: { job_name: 'post-bets', error_message: 'Connection timeout', started_at: '2026-02-25T10:00:00Z' },
};

describe('JobHealthSummary', () => {
  it('renders loading skeleton when loading', () => {
    const { container } = render(<JobHealthSummary jobs={[]} health={healthyHealth} loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders healthy status badge', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={healthyHealth} />);
    expect(screen.getByText('Saudável')).toBeInTheDocument();
  });

  it('renders degraded status badge', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={degradedHealth} />);
    expect(screen.getByText('Degradado')).toBeInTheDocument();
  });

  it('shows total jobs count', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={healthyHealth} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Jobs Monitorados')).toBeInTheDocument();
  });

  it('shows failed count', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={degradedHealth} />);
    expect(screen.getByText('Com Falha')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows last error when degraded', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={degradedHealth} />);
    expect(screen.getByText(/Último erro/)).toBeInTheDocument();
    // post-bets appears in both the error box and the job list, so use getAllByText
    expect(screen.getAllByText('post-bets').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('does not show last error when healthy', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={healthyHealth} />);
    expect(screen.queryByText(/Último erro/)).not.toBeInTheDocument();
  });

  it('renders per-job status list', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={healthyHealth} />);
    expect(screen.getByText('post-bets')).toBeInTheDocument();
    expect(screen.getByText('track-results')).toBeInTheDocument();
  });

  it('renders section title for per-job list', () => {
    render(<JobHealthSummary jobs={mockHealthyJobs} health={healthyHealth} />);
    expect(screen.getByText('Última Execução por Job')).toBeInTheDocument();
  });
});

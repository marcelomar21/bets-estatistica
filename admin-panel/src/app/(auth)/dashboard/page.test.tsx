import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockDashboardData = {
  summary: {
    groups: { active: 2, paused: 1, total: 3 },
    bots: { available: 1, in_use: 2, total: 3, online: 2, offline: 1 },
    members: { total: 25 },
  },
  groups: [
    { id: 'g1', name: 'Grupo Alpha', status: 'active', created_at: '2026-01-01T00:00:00Z', active_members: 15 },
    { id: 'g2', name: 'Grupo Beta', status: 'paused', created_at: '2026-01-02T00:00:00Z', active_members: 10 },
  ],
  alerts: [
    { type: 'bot_offline', message: 'Bot offline', timestamp: '2026-02-08T10:00:00Z', group_name: 'Alpha' },
  ],
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading skeleton initially', () => {
    // Never-resolving fetch to keep loading state
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    // Skeleton has animate-pulse elements
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders dashboard data after loading', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockDashboardData }),
    } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Verify stat cards render — check by title presence
    expect(screen.getByText('Membros Ativos')).toBeInTheDocument();
    expect(screen.getByText('Bots em Uso')).toBeInTheDocument();
    expect(screen.getByText('Bots Online')).toBeInTheDocument();
    // Verify group cards
    expect(screen.getByText('Grupo Alpha')).toBeInTheDocument();
    expect(screen.getByText('Grupo Beta')).toBeInTheDocument();
    // Verify alerts
    expect(screen.getByText('Bot offline')).toBeInTheDocument();
  });

  it('shows error message with retry button on API failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: { message: 'DB Error' } }),
    } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('DB Error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Tentar Novamente' })).toBeInTheDocument();
  });

  it('retries fetch when retry button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: { message: 'Erro' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockDashboardData }),
      } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Erro')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Tentar Novamente' }));

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('shows error on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Erro de conexao. Verifique sua internet.')).toBeInTheDocument();
    });
  });

  it('shows error on HTTP error status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Invalid JSON')),
    } as unknown as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Erro HTTP 500')).toBeInTheDocument();
    });
  });
});

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

vi.mock('@/components/features/dashboard/GroupAdminDashboard', () => ({
  default: () => <div>Group Admin Dashboard Mock</div>,
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
};

const mockNotificationsData = {
  notifications: [
    {
      id: 'n1',
      type: 'bot_offline',
      severity: 'error',
      title: 'Bot Offline',
      message: 'Bot do grupo Alpha esta offline',
      group_id: 'g1',
      metadata: {},
      read: false,
      created_at: '2026-02-08T10:00:00Z',
    },
    {
      id: 'n2',
      type: 'onboarding_completed',
      severity: 'success',
      title: 'Onboarding OK',
      message: 'Grupo Delta pronto',
      group_id: 'g2',
      metadata: {},
      read: true,
      created_at: '2026-02-08T09:00:00Z',
    },
  ],
  unread_count: 1,
};

const mockAccuracyData = {
  total: { rate: 59.4, wins: 38, losses: 26, total: 64 },
  periods: {
    last7d: { rate: 55.6, wins: 5, total: 9 },
    last30d: { rate: 60.0, wins: 18, total: 30 },
    allTime: { rate: 59.4, wins: 38, total: 64 },
  },
  byGroup: [
    { group_id: 'g1', group_name: 'Grupo Alpha', rate: 65.0, wins: 13, total: 20 },
    { group_id: 'g2', group_name: 'Grupo Beta', rate: 50.0, wins: 10, total: 20 },
  ],
  byMarket: [],
  byChampionship: [],
};

const mockMeResponse = {
  ok: true,
  json: () => Promise.resolve({ success: true, data: { userId: 'u1', email: 'admin@test.com', role: 'super_admin', groupId: null } }),
};

const defaultOkResponse = {
  ok: true,
  json: () => Promise.resolve({ success: true, data: {} }),
};

/**
 * Helper that creates a URL-aware fetch mock.
 * Routes /api/me, /api/dashboard/stats, /api/notifications, /api/analytics/accuracy, and /api/job-executions.
 */
function mockFetchByUrl(
  statsResponse?: { ok: boolean; json: () => Promise<unknown> },
  notificationsResponse?: { ok: boolean; json: () => Promise<unknown> },
  meResponse?: { ok: boolean; json: () => Promise<unknown> },
  accuracyResponse?: { ok: boolean; json: () => Promise<unknown> },
) {
  const defaultStatsResponse = {
    ok: true,
    json: () => Promise.resolve({ success: true, data: mockDashboardData }),
  };
  const defaultNotificationsResponse = {
    ok: true,
    json: () => Promise.resolve({ success: true, data: mockNotificationsData }),
  };
  const defaultAccuracyResponse = {
    ok: true,
    json: () => Promise.resolve({ success: true, data: mockAccuracyData }),
  };

  return vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/me')) {
      return Promise.resolve((meResponse ?? mockMeResponse) as Response);
    }
    if (url.includes('/api/analytics/accuracy')) {
      return Promise.resolve((accuracyResponse ?? defaultAccuracyResponse) as Response);
    }
    if (url.includes('/api/notifications')) {
      return Promise.resolve((notificationsResponse ?? defaultNotificationsResponse) as Response);
    }
    if (url.includes('/api/job-executions')) {
      return Promise.resolve(defaultOkResponse as Response);
    }
    return Promise.resolve((statsResponse ?? defaultStatsResponse) as Response);
  });
}

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
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Verify stat cards render — check by title presence
    expect(screen.getByText('Membros Ativos')).toBeInTheDocument();
    expect(screen.getByText('Bots em Uso')).toBeInTheDocument();
    expect(screen.getByText('Bots Online')).toBeInTheDocument();
    // Verify group cards (name also appears in accuracy mini-cards)
    expect(screen.getAllByText('Grupo Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Grupo Beta').length).toBeGreaterThanOrEqual(1);
  });

  it('renders GroupAdminDashboard for group_admin and skips super_admin fetches', async () => {
    const groupAdminMeResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: { userId: 'u2', email: 'group@test.com', role: 'group_admin', groupId: 'g1' } }),
    };

    const fetchSpy = mockFetchByUrl(undefined, undefined, groupAdminMeResponse);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Group Admin Dashboard Mock')).toBeInTheDocument();
    });

    expect(screen.queryByText('Grupos Ativos')).not.toBeInTheDocument();

    const calledUrls = fetchSpy.mock.calls.map((call) => {
      const input = call[0];
      return typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    });

    expect(calledUrls.some((url: string) => url.includes('/api/me'))).toBe(true);
    expect(calledUrls.some((url: string) => url.includes('/api/dashboard/stats'))).toBe(false);
    expect(calledUrls.some((url: string) => url.includes('/api/notifications'))).toBe(false);
  });

  it('shows error message with retry button on API failure', async () => {
    mockFetchByUrl({
      ok: true,
      json: () => Promise.resolve({ success: false, error: { message: 'DB Error' } }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('DB Error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Tentar Novamente' })).toBeInTheDocument();
  });

  it('retries fetch when retry button is clicked', async () => {
    let statsCallCount = 0;
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/me')) {
        return Promise.resolve(mockMeResponse as Response);
      }
      if (url.includes('/api/notifications')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockNotificationsData }),
        } as Response);
      }
      if (url.includes('/api/job-executions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { jobs: [], health: { total_jobs: 0, failed_count: 0, status: 'healthy', last_error: null } } }),
        } as Response);
      }
      if (url.includes('/api/analytics/accuracy')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockAccuracyData }),
        } as Response);
      }
      statsCallCount++;
      if (statsCallCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: false, error: { message: 'Erro' } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockDashboardData }),
      } as Response);
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Erro')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Tentar Novamente' }));

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // At least 2 stats calls (initial fail + retry) plus notification calls
    expect(fetchSpy).toHaveBeenCalled();
    expect(statsCallCount).toBe(2);
  });

  it('shows error on network failure', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/me')) {
        return Promise.resolve(mockMeResponse as Response);
      }
      return Promise.reject(new Error('Network error'));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Erro de conexao. Verifique sua internet.')).toBeInTheDocument();
    });
  });

  it('shows error on HTTP error status', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/me')) {
        return Promise.resolve(mockMeResponse as Response);
      }
      if (url.includes('/api/notifications')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockNotificationsData }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as unknown as Response);
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Erro HTTP 500')).toBeInTheDocument();
    });
  });

  it('fetches notifications alongside dashboard stats', async () => {
    const fetchSpy = mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Verify both endpoints were called
    const calledUrls = fetchSpy.mock.calls.map(
      (call) => {
        const input = call[0];
        return typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      }
    );
    expect(calledUrls.some((url: string) => url.includes('/api/dashboard/stats'))).toBe(true);
    expect(calledUrls.some((url: string) => url.includes('/api/notifications'))).toBe(true);
  });

  it('renders NotificationsPanel within the dashboard', async () => {
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Verify the NotificationsPanel heading appears
    expect(screen.getByText(/Notifica/)).toBeInTheDocument();
    // Verify unread notification content from mock data
    expect(screen.getByText('Bot Offline')).toBeInTheDocument();
    expect(screen.getByText('Bot do grupo Alpha esta offline')).toBeInTheDocument();
    // Read notification (n2) should NOT appear — dashboard shows only unread
    expect(screen.queryByText('Onboarding OK')).not.toBeInTheDocument();
  });

  it('mark as read removes notification from dashboard (unread only)', async () => {
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Unread notification (n1) should be visible with a "Marcar lida" button
    expect(screen.getByText('Bot Offline')).toBeInTheDocument();
    const markReadButtons = screen.getAllByText('Marcar lida');
    expect(markReadButtons.length).toBeGreaterThan(0);

    // Click the "Marcar lida" button for the first unread notification
    await userEvent.click(markReadButtons[0]);

    // After clicking, notification becomes read and disappears from unread-only list
    await waitFor(() => {
      expect(screen.queryByText('Bot Offline')).not.toBeInTheDocument();
    });

    // Verify fetch was called with the correct notification URL and PATCH method
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('mark all as read clears notifications from dashboard and calls API', async () => {
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Should have unread notifications and "Marcar todas como lidas" button
    const markAllButton = screen.getByText('Marcar todas como lidas');
    expect(markAllButton).toBeInTheDocument();

    // Unread notification visible
    expect(screen.getByText('Bot Offline')).toBeInTheDocument();

    // Click "Marcar todas como lidas"
    await userEvent.click(markAllButton);

    // After clicking, all notifications become read and disappear from unread-only view
    await waitFor(() => {
      expect(screen.queryByText('Bot Offline')).not.toBeInTheDocument();
    });

    // "Marcar todas como lidas" button should disappear when unreadCount = 0
    expect(screen.queryByText('Marcar todas como lidas')).not.toBeInTheDocument();

    // Verify fetch was called with the mark-all-read endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/mark-all-read',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('renders performance cards with accuracy data', async () => {
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });

    // Period cards
    expect(screen.getByText('Taxa Total')).toBeInTheDocument();
    expect(screen.getByText(/59\.4%/)).toBeInTheDocument();
    expect(screen.getByText('38/64 acertos')).toBeInTheDocument();

    expect(screen.getByText(/ltimos 7 dias/)).toBeInTheDocument();
    expect(screen.getByText(/55\.6%/)).toBeInTheDocument();

    expect(screen.getByText(/ltimos 30 dias/)).toBeInTheDocument();
    expect(screen.getByText(/60(\.0)?%/)).toBeInTheDocument();

    // Group mini-cards
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows empty state when accuracy has zero bets', async () => {
    const emptyAccuracy = {
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          total: { rate: 0, wins: 0, losses: 0, total: 0 },
          periods: {
            last7d: { rate: 0, wins: 0, total: 0 },
            last30d: { rate: 0, wins: 0, total: 0 },
            allTime: { rate: 0, wins: 0, total: 0 },
          },
          byGroup: [],
          byMarket: [],
          byChampionship: [],
        },
      }),
    };

    mockFetchByUrl(undefined, undefined, undefined, emptyAccuracy);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Sem dados suficientes')).toBeInTheDocument();
    });
  });

  it('fetches accuracy data alongside other dashboard endpoints', async () => {
    const fetchSpy = mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    const calledUrls = fetchSpy.mock.calls.map((call) => {
      const input = call[0];
      return typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    });
    expect(calledUrls.some((url: string) => url.includes('/api/analytics/accuracy'))).toBe(true);
  });
});

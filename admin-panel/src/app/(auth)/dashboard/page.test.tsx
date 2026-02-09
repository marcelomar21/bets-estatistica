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
  alerts: [
    { type: 'bot_offline', message: 'Bot offline', timestamp: '2026-02-08T10:00:00Z', group_name: 'Alpha' },
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

const mockMeResponse = {
  ok: true,
  json: () => Promise.resolve({ success: true, data: { userId: 'u1', email: 'admin@test.com', role: 'super_admin', groupId: null } }),
};

/**
 * Helper that creates a URL-aware fetch mock.
 * Routes /api/me, /api/dashboard/stats, and /api/notifications to their respective responses.
 */
function mockFetchByUrl(
  statsResponse?: { ok: boolean; json: () => Promise<unknown> },
  notificationsResponse?: { ok: boolean; json: () => Promise<unknown> },
  meResponse?: { ok: boolean; json: () => Promise<unknown> },
) {
  const defaultStatsResponse = {
    ok: true,
    json: () => Promise.resolve({ success: true, data: mockDashboardData }),
  };
  const defaultNotificationsResponse = {
    ok: true,
    json: () => Promise.resolve({ success: true, data: mockNotificationsData }),
  };

  return vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/me')) {
      return Promise.resolve((meResponse ?? mockMeResponse) as Response);
    }
    if (url.includes('/api/notifications')) {
      return Promise.resolve((notificationsResponse ?? defaultNotificationsResponse) as Response);
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
    // Verify group cards
    expect(screen.getByText('Grupo Alpha')).toBeInTheDocument();
    expect(screen.getByText('Grupo Beta')).toBeInTheDocument();
    // Verify alerts
    expect(screen.getByText('Bot offline')).toBeInTheDocument();
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
    // Verify notification content from mock data
    expect(screen.getByText('Bot Offline')).toBeInTheDocument();
    expect(screen.getByText('Bot do grupo Alpha esta offline')).toBeInTheDocument();
    expect(screen.getByText('Onboarding OK')).toBeInTheDocument();
  });

  it('mark as read updates UI optimistically', async () => {
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Unread notification (n1) should have a "Marcar lida" button
    const markReadButtons = screen.getAllByText('Marcar lida');
    expect(markReadButtons.length).toBeGreaterThan(0);

    // The unread notification (n1 "Bot Offline") should have border-l-4
    const unreadItem = screen.getByText('Bot Offline').closest('li');
    expect(unreadItem).toHaveClass('border-l-4');

    // Click the "Marcar lida" button for the first unread notification
    await userEvent.click(markReadButtons[0]);

    // After clicking, the notification should become read optimistically:
    // - border-l-4 should be removed and opacity-60 should be applied
    await waitFor(() => {
      const updatedItem = screen.getByText('Bot Offline').closest('li');
      expect(updatedItem).toHaveClass('opacity-60');
      expect(updatedItem).not.toHaveClass('border-l-4');
    });

    // The "Marcar lida" button for that notification should disappear
    // Both notifications are now read so no "Marcar lida" buttons
    expect(screen.queryByText('Marcar lida')).not.toBeInTheDocument();

    // Verify fetch was called with the correct notification URL and PATCH method
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('mark all as read updates UI optimistically and calls API', async () => {
    mockFetchByUrl();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    });

    // Should have unread notifications and "Marcar todas como lidas" button
    const markAllButton = screen.getByText('Marcar todas como lidas');
    expect(markAllButton).toBeInTheDocument();

    // Verify there is at least one unread notification with border-l-4
    const unreadItem = screen.getByText('Bot Offline').closest('li');
    expect(unreadItem).toHaveClass('border-l-4');

    // Click "Marcar todas como lidas"
    await userEvent.click(markAllButton);

    // After clicking, all notifications should become read optimistically:
    // - All notifications should have opacity-60 (read state)
    // - No more border-l-4 (unread indicator)
    await waitFor(() => {
      const botOfflineItem = screen.getByText('Bot Offline').closest('li');
      expect(botOfflineItem).toHaveClass('opacity-60');
      expect(botOfflineItem).not.toHaveClass('border-l-4');
    });

    // "Marcar todas como lidas" button should disappear when unreadCount = 0
    expect(screen.queryByText('Marcar todas como lidas')).not.toBeInTheDocument();

    // No individual "Marcar lida" buttons should remain
    expect(screen.queryByText('Marcar lida')).not.toBeInTheDocument();

    // Verify fetch was called with the mark-all-read endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/mark-all-read',
      expect.objectContaining({ method: 'PATCH' })
    );
  });
});

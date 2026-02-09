import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsPanel from './NotificationsPanel';
import type { Notification } from '@/types/database';

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  type: 'bot_offline',
  severity: 'error',
  title: 'Bot Offline',
  message: 'Bot do grupo Alpha esta offline',
  group_id: 'g1',
  metadata: {},
  read: false,
  created_at: '2026-02-08T10:00:00Z',
  ...overrides,
});

const sampleNotifications: Notification[] = [
  makeNotification({ id: 'n1', type: 'bot_offline', severity: 'error', title: 'Bot Offline', message: 'Bot do grupo Alpha esta offline' }),
  makeNotification({ id: 'n2', type: 'group_failed', severity: 'error', title: 'Grupo Falhou', message: 'Onboarding do grupo Beta falhou' }),
  makeNotification({ id: 'n3', type: 'group_paused', severity: 'warning', title: 'Grupo Pausado', message: 'Grupo Gamma foi pausado' }),
  makeNotification({ id: 'n4', type: 'integration_error', severity: 'warning', title: 'Erro Integracao', message: 'Falha na integracao MP' }),
  makeNotification({ id: 'n5', type: 'onboarding_completed', severity: 'success', title: 'Onboarding OK', message: 'Grupo Delta pronto', read: true }),
];

describe('NotificationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    notifications: sampleNotifications,
    unreadCount: 4,
    onMarkAsRead: vi.fn(),
    onMarkAllRead: vi.fn(),
  };

  it('renders list of notifications with correct icons', () => {
    render(<NotificationsPanel {...defaultProps} />);

    // bot_offline = 🔴, group_failed = ❌, group_paused = ⏸️, integration_error = ⚠️, onboarding_completed = ✅
    expect(screen.getByText('\u{1F534}')).toBeInTheDocument(); // 🔴
    expect(screen.getByText('\u274C')).toBeInTheDocument();     // ❌
    expect(screen.getByText('\u23F8\uFE0F')).toBeInTheDocument(); // ⏸️
    expect(screen.getByText('\u26A0\uFE0F')).toBeInTheDocument(); // ⚠️
    expect(screen.getByText('\u2705')).toBeInTheDocument();     // ✅
  });

  it('shows unread badge with correct count when unreadCount > 0', () => {
    render(<NotificationsPanel {...defaultProps} unreadCount={4} />);

    const badge = screen.getByText('4');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('rounded-full', 'bg-red-500', 'text-white');
  });

  it('does NOT show badge when unreadCount = 0', () => {
    render(<NotificationsPanel {...defaultProps} unreadCount={0} />);

    // The heading should exist, but no badge / status indicator
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows "Marcar todas como lidas" button when unreadCount > 0', () => {
    render(<NotificationsPanel {...defaultProps} unreadCount={3} />);

    expect(screen.getByText('Marcar todas como lidas')).toBeInTheDocument();
  });

  it('hides "Marcar todas como lidas" button when unreadCount = 0', () => {
    render(<NotificationsPanel {...defaultProps} unreadCount={0} />);

    expect(screen.queryByText('Marcar todas como lidas')).not.toBeInTheDocument();
  });

  it('calls onMarkAllRead when "Marcar todas como lidas" is clicked', async () => {
    const onMarkAllRead = vi.fn();
    render(<NotificationsPanel {...defaultProps} onMarkAllRead={onMarkAllRead} />);

    await userEvent.click(screen.getByText('Marcar todas como lidas'));

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('calls onMarkAsRead with correct id when individual "Marcar lida" is clicked', async () => {
    const onMarkAsRead = vi.fn();
    // Use only two notifications: one unread, one read
    const notifications: Notification[] = [
      makeNotification({ id: 'abc-123', type: 'bot_offline', read: false }),
      makeNotification({ id: 'def-456', type: 'group_failed', read: true }),
    ];

    render(
      <NotificationsPanel
        notifications={notifications}
        unreadCount={1}
        onMarkAsRead={onMarkAsRead}
        onMarkAllRead={vi.fn()}
      />
    );

    // Only one "Marcar lida" button should be present (for the unread one)
    const markReadButtons = screen.getAllByText('Marcar lida');
    expect(markReadButtons).toHaveLength(1);

    await userEvent.click(markReadButtons[0]);

    expect(onMarkAsRead).toHaveBeenCalledTimes(1);
    expect(onMarkAsRead).toHaveBeenCalledWith('abc-123');
  });

  it('shows "Marcar lida" button only for unread notifications', () => {
    const notifications: Notification[] = [
      makeNotification({ id: 'u1', read: false }),
      makeNotification({ id: 'u2', read: false }),
      makeNotification({ id: 'r1', read: true }),
    ];

    render(
      <NotificationsPanel
        notifications={notifications}
        unreadCount={2}
        onMarkAsRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );

    const markReadButtons = screen.getAllByText('Marcar lida');
    expect(markReadButtons).toHaveLength(2);
  });

  it('read notifications have opacity-60 class', () => {
    const notifications: Notification[] = [
      makeNotification({ id: 'r1', read: true, title: 'Read Notification' }),
    ];

    render(
      <NotificationsPanel
        notifications={notifications}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );

    const listItem = screen.getByText('Read Notification').closest('li');
    expect(listItem).toHaveClass('opacity-60');
  });

  it('unread notifications have border-l-4 class', () => {
    const notifications: Notification[] = [
      makeNotification({ id: 'u1', read: false, title: 'Unread Notification' }),
    ];

    render(
      <NotificationsPanel
        notifications={notifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );

    const listItem = screen.getByText('Unread Notification').closest('li');
    expect(listItem).toHaveClass('border-l-4');
  });

  it('empty state shows "Nenhuma notificacao"', () => {
    render(
      <NotificationsPanel
        notifications={[]}
        unreadCount={0}
        onMarkAsRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );

    expect(screen.getByText(/Nenhuma notifica/)).toBeInTheDocument();
  });

  it('renders title, message, and formatted timestamp', () => {
    const notifications: Notification[] = [
      makeNotification({
        id: 'ts1',
        title: 'Titulo Teste',
        message: 'Mensagem de teste detalhada',
        created_at: '2026-02-08T14:30:00Z',
      }),
    ];

    render(
      <NotificationsPanel
        notifications={notifications}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );

    expect(screen.getByText('Titulo Teste')).toBeInTheDocument();
    expect(screen.getByText('Mensagem de teste detalhada')).toBeInTheDocument();

    // Verify formatted timestamp exists using the notification title to locate the item
    const listItem = screen.getByText('Titulo Teste').closest('li');
    expect(listItem).not.toBeNull();
    const timestampText = listItem!.textContent!;
    // Should contain date components (day/month/year and time) from pt-BR format
    expect(timestampText).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  describe('severity styling', () => {
    it('group_failed notification gets orange styling (type override)', () => {
      const notifications: Notification[] = [
        makeNotification({
          id: 'sf1',
          type: 'group_failed',
          severity: 'error',
          title: 'Grupo Falhou',
          read: false,
        }),
      ];

      render(
        <NotificationsPanel
          notifications={notifications}
          unreadCount={1}
          onMarkAsRead={vi.fn()}
          onMarkAllRead={vi.fn()}
        />
      );

      const listItem = screen.getByText('Grupo Falhou').closest('li');
      expect(listItem).toHaveClass('border-orange-200');
      expect(listItem).toHaveClass('bg-orange-50');
    });

    it('onboarding_completed notification gets green styling', () => {
      const notifications: Notification[] = [
        makeNotification({
          id: 'sf2',
          type: 'onboarding_completed',
          severity: 'success',
          title: 'Onboarding OK',
          read: false,
        }),
      ];

      render(
        <NotificationsPanel
          notifications={notifications}
          unreadCount={1}
          onMarkAsRead={vi.fn()}
          onMarkAllRead={vi.fn()}
        />
      );

      const listItem = screen.getByText('Onboarding OK').closest('li');
      expect(listItem).toHaveClass('border-green-200');
      expect(listItem).toHaveClass('bg-green-50');
    });

    it('bot_offline notification gets red styling', () => {
      const notifications: Notification[] = [
        makeNotification({
          id: 'sf3',
          type: 'bot_offline',
          severity: 'error',
          title: 'Bot Offline',
          read: false,
        }),
      ];

      render(
        <NotificationsPanel
          notifications={notifications}
          unreadCount={1}
          onMarkAsRead={vi.fn()}
          onMarkAllRead={vi.fn()}
        />
      );

      const listItem = screen.getByText('Bot Offline').closest('li');
      expect(listItem).toHaveClass('border-red-200');
      expect(listItem).toHaveClass('bg-red-50');
    });
  });
});

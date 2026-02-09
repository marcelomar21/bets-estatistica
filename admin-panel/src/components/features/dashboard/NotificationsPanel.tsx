import type { Notification } from '@/types/database';
import { formatDateTime } from '@/lib/format-utils';

interface NotificationsPanelProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const typeIcons: Record<Notification['type'], string> = {
  bot_offline: '\u{1F534}',
  group_failed: '\u274C',
  group_paused: '\u23F8\uFE0F',
  integration_error: '\u26A0\uFE0F',
  onboarding_completed: '\u2705',
  telegram_group_created: '\u2705',
  telegram_group_failed: '\u274C',
  telegram_notification_failed: '\u26A0\uFE0F',
  mtproto_session_expired: '\u{1F510}',
};

const severityStyles: Record<Notification['severity'], string> = {
  error: 'border-red-200 bg-red-50',
  warning: 'border-yellow-200 bg-yellow-50',
  success: 'border-green-200 bg-green-50',
  info: 'border-blue-200 bg-blue-50',
};

const typeStyleOverrides: Partial<Record<Notification['type'], string>> = {
  group_failed: 'border-orange-200 bg-orange-50',
};

export default function NotificationsPanel({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllRead,
}: NotificationsPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Notifica\u00E7\u00F5es</h2>
          {unreadCount > 0 && (
            <div role="status" aria-live="polite">
              <span
                className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium"
                aria-label={`${unreadCount} notificações não lidas`}
              >
                {unreadCount}
              </span>
            </div>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma notifica\u00E7\u00E3o</p>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => {
            const icon = typeIcons[notification.type] ?? typeIcons.bot_offline;
            const severityClass = typeStyleOverrides[notification.type] ?? severityStyles[notification.severity] ?? severityStyles.info;
            return (
              <li
                key={notification.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${severityClass} ${
                  notification.read ? 'opacity-60' : 'border-l-4'
                }`}
              >
                <span className="text-lg flex-shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900">{notification.title}</p>
                  <p className="text-sm text-gray-700">{notification.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatDateTime(notification.created_at)}</p>
                </div>
                {!notification.read && (
                  <button
                    type="button"
                    onClick={() => onMarkAsRead(notification.id)}
                    className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-700 font-medium mt-0.5"
                    title="Marcar como lida"
                  >
                    Marcar lida
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

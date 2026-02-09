import type { DashboardAlert } from '@/types/database';
import { formatDateTime } from '@/lib/format-utils';

const alertConfig: Record<DashboardAlert['type'], { icon: string; className: string }> = {
  bot_offline: { icon: '🔴', className: 'border-red-200 bg-red-50' },
  group_failed: { icon: '🟠', className: 'border-orange-200 bg-orange-50' },
  group_paused: { icon: '🟡', className: 'border-yellow-200 bg-yellow-50' },
  onboarding_completed: { icon: '🟢', className: 'border-green-200 bg-green-50' },
  telegram_group_created: { icon: '🟢', className: 'border-green-200 bg-green-50' },
  telegram_group_failed: { icon: '🔴', className: 'border-red-200 bg-red-50' },
  telegram_notification_failed: { icon: '🟠', className: 'border-orange-200 bg-orange-50' },
  mtproto_session_expired: { icon: '🟡', className: 'border-yellow-200 bg-yellow-50' },
};

interface AlertsSectionProps {
  alerts: DashboardAlert[];
}

/** @deprecated Use NotificationsPanel instead. Kept for Story 2.4 test compatibility. */
export default function AlertsSection({ alerts }: AlertsSectionProps) {
  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alertas</h2>
        <p className="text-sm text-gray-500">Nenhum alerta no momento</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Alertas</h2>
      <ul className="space-y-3">
        {alerts.map((alert, index) => {
          const config = alertConfig[alert.type] ?? alertConfig.bot_offline;
          return (
            <li key={`${alert.type}-${alert.timestamp}-${index}`} className={`flex items-start gap-3 rounded-lg border p-3 ${config.className}`}>
              <span className="text-lg flex-shrink-0">{config.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">{alert.message}</p>
                <p className="text-xs text-gray-500 mt-1">{formatDateTime(alert.timestamp)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

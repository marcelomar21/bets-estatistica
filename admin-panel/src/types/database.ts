export interface Group {
  id: string;
  name: string;
  bot_token: string | null;
  telegram_group_id: number | null;
  telegram_admin_group_id: number | null;
  mp_product_id: string | null;
  render_service_id: string | null;
  checkout_url: string | null;
  status: 'creating' | 'active' | 'paused' | 'inactive' | 'failed';
  created_at: string;
}

export type GroupListItem = Pick<Group, 'id' | 'name' | 'status' | 'telegram_group_id' | 'telegram_admin_group_id' | 'checkout_url' | 'created_at'>;

export interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'group_admin';
  group_id: string | null;
  created_at: string;
}

export interface BotPool {
  id: string;
  bot_token: string;
  bot_username: string;
  status: 'available' | 'in_use';
  group_id: string | null;
  created_at: string;
}

export type BotPoolListItem = Omit<BotPool, 'bot_token'> & {
  groups: { name: string } | null;
};

export interface BotHealth {
  group_id: string;
  last_heartbeat: string;
  status: 'online' | 'offline';
  restart_requested: boolean;
  error_message: string | null;
  updated_at: string;
}

export interface DashboardSummary {
  groups: { active: number; paused: number; total: number };
  bots: { available: number; in_use: number; total: number; online: number; offline: number };
  members: { total: number };
}

export interface DashboardGroupCard {
  id: string;
  name: string;
  status: Group['status'];
  created_at: string;
  active_members: number;
}

export type NotificationType =
  | 'bot_offline'
  | 'group_failed'
  | 'onboarding_completed'
  | 'group_paused'
  | 'integration_error'
  | 'telegram_group_created'
  | 'telegram_group_failed'
  | 'telegram_notification_failed'
  | 'mtproto_session_expired';
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export type DashboardAlertType = Exclude<NotificationType, 'integration_error'>;

export interface DashboardAlert {
  type: DashboardAlertType;
  message: string;
  timestamp: string;
  group_name?: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  groups: DashboardGroupCard[];
  alerts: DashboardAlert[];
  unread_count: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  group_id: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export type OnboardingStep = 'creating' | 'validating_bot' | 'configuring_mp' | 'deploying_bot' | 'creating_admin' | 'creating_telegram_group' | 'finalizing';

export type StepRequest =
  | { step: 'creating'; name: string; email: string; bot_id: string; price: number }
  | { step: 'validating_bot'; group_id: string }
  | { step: 'configuring_mp'; group_id: string; price: number }
  | { step: 'deploying_bot'; group_id: string }
  | { step: 'creating_admin'; group_id: string; email: string }
  | { step: 'creating_telegram_group'; group_id: string }
  | { step: 'finalizing'; group_id: string };

export interface MtprotoSession {
  id: string;
  phone_number: string;
  label: string;
  is_active: boolean;
  requires_reauth: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface SuperAdminBotConfig {
  id: string;
  bot_username: string;
  founder_chat_ids: number[];
  is_active: boolean;
  created_at: string;
}

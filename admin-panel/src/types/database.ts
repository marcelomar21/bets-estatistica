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

export interface BotHealth {
  group_id: string;
  last_heartbeat: string;
  status: 'online' | 'offline';
  restart_requested: boolean;
  error_message: string | null;
  updated_at: string;
}

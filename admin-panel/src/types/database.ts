export interface Group {
  id: string;
  name: string;
  bot_token: string | null;
  telegram_group_id: number | null;
  telegram_admin_group_id: number | null;
  mp_plan_id: string | null;
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

export interface Member {
  id: number;
  telegram_id: number;
  telegram_username: string | null;
  email: string | null;
  status: 'trial' | 'ativo' | 'inadimplente' | 'removido';
  mp_subscription_id: string | null;
  mp_payer_id: string | null;
  trial_started_at: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  payment_method: string | null;
  last_payment_at: string | null;
  kicked_at: string | null;
  notes: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MemberListItem = Pick<
  Member,
  'id' | 'telegram_id' | 'telegram_username' | 'status' | 'subscription_ends_at' | 'created_at' | 'group_id'
> & {
  groups?: { name: string } | null;
};

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

export interface GroupAdminMemberSummary {
  total: number;
  trial: number;
  ativo: number;
  vencendo: number;
}

export interface GroupAdminDashboardData {
  summary: { members: GroupAdminMemberSummary };
  group: Pick<DashboardGroupCard, 'id' | 'name' | 'status' | 'created_at'> | null;
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

// ============================================================
// Suggested Bets (Story 5.2)
// ============================================================

export type BetStatus = 'generated' | 'pending_link' | 'pending_odds' | 'ready' | 'posted';
export type BetElegibilidade = 'elegivel' | 'removida' | 'expirada';

export interface SuggestedBet {
  id: number;
  match_id: number | null;
  bet_market: string;
  bet_pick: string;
  odds: number | null;
  confidence: number | null;
  bet_status: BetStatus;
  elegibilidade: BetElegibilidade;
  promovida_manual: boolean;
  deep_link: string | null;
  odds_at_post: number | null;
  telegram_posted_at: string | null;
  group_id: string | null;
  distributed_at: string | null;
  notes: string | null;
  created_at: string;
}

export type SuggestedBetListItem = Pick<
  SuggestedBet,
  | 'id'
  | 'bet_market'
  | 'bet_pick'
  | 'odds'
  | 'deep_link'
  | 'bet_status'
  | 'elegibilidade'
  | 'promovida_manual'
  | 'group_id'
  | 'distributed_at'
  | 'created_at'
  | 'odds_at_post'
  | 'notes'
> & {
  league_matches: {
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
    status: string;
  } | null;
  groups: { name: string } | null;
};

export interface OddsHistoryEntry {
  id: number;
  bet_id: number;
  update_type: string;
  old_value: number | null;
  new_value: number;
  job_name: string;
  created_at: string;
}

// Request / Response types for Bets API

export interface BetOddsUpdateRequest {
  odds: number;
}

export interface BulkOddsUpdateRequest {
  updates: Array<{ id: number; odds: number }>;
}

export interface BetPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface BetCounters {
  total: number;
  ready: number;
  posted: number;
  pending_link: number;
  pending_odds: number;
  sem_odds: number;
  sem_link: number;
}

export interface BetListResponse {
  success: true;
  data: {
    items: SuggestedBetListItem[];
    pagination: BetPagination;
    counters: BetCounters;
  };
}

export interface BetDetailResponse {
  success: true;
  data: {
    bet: SuggestedBetListItem;
    odds_history: OddsHistoryEntry[];
  };
}

export interface BetOddsUpdateResponse {
  success: true;
  data: {
    bet: SuggestedBet;
    promoted: boolean;
    old_odds: number | null;
    new_odds: number;
  };
}

export interface BulkOddsUpdateResponse {
  success: true;
  data: {
    updated: number;
    promoted: number;
    skipped: number;
    failed: number;
    errors: Array<{ id: number; error: string }>;
  };
}

// ============================================================
// Link Updates (Story 5.3)
// ============================================================

export interface BetLinkUpdateRequest {
  link: string | null;
}

export interface BulkLinksUpdateRequest {
  updates: Array<{ id: number; link: string | null }>;
}

export interface BetLinkUpdateResponse {
  success: true;
  data: {
    bet: SuggestedBet;
    promoted: boolean;
    old_link: string | null;
    new_link: string | null;
  };
}

export interface BulkLinksUpdateResponse {
  success: true;
  data: {
    updated: number;
    promoted: number;
    skipped: number;
    failed: number;
    errors: Array<{ id: number; error: string }>;
  };
}

import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import type { DashboardSummary, DashboardGroupCard, DashboardAlert, GroupAdminDashboardData } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/middleware/tenant';

const SEVERITY_MAP: Record<string, string> = {
  bot_offline: 'error',
  group_failed: 'error',
  group_paused: 'warning',
  onboarding_completed: 'success',
  integration_error: 'error',
};

async function persistNotifications(
  supabase: SupabaseClient,
  alerts: DashboardAlert[],
  groupsById: Map<string, { id: string; name: string }>,
) {
  if (alerts.length === 0) return;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Fetch recent notifications for deduplication
  const { data: recent, error: dedupError } = await supabase
    .from('notifications')
    .select('type, group_id')
    .gte('created_at', oneHourAgo);

  if (dedupError) {
    console.warn('[notifications] Failed to fetch recent for dedup, skipping insert:', dedupError.message);
    return;
  }

  const recentSet = new Set(
    (recent ?? []).map((n: { type: string; group_id: string | null }) =>
      `${n.type}::${n.group_id ?? ''}`,
    ),
  );

  // Build name-based lookup for O(1) access instead of O(N) linear scan
  const groupsByName = new Map<string, { id: string; name: string }>();
  for (const g of groupsById.values()) {
    groupsByName.set(g.name, g);
  }

  const toInsert = alerts
    .filter((alert) => {
      const group = alert.group_name
        ? groupsByName.get(alert.group_name)
        : undefined;
      const key = `${alert.type}::${group?.id ?? ''}`;
      return !recentSet.has(key);
    })
    .map((alert) => {
      const group = alert.group_name
        ? groupsByName.get(alert.group_name)
        : undefined;
      return {
        type: alert.type,
        severity: SEVERITY_MAP[alert.type] ?? 'info',
        title: alertTitle(alert.type),
        message: alert.message,
        group_id: group?.id ?? null,
        metadata: { group_name: alert.group_name ?? null },
      };
    });

  if (toInsert.length > 0) {
    const { error } = await supabase.from('notifications').insert(toInsert);
    if (error) {
      console.warn('[notifications] Failed to persist notifications:', error.message);
    }
  }
}

function alertTitle(type: string): string {
  switch (type) {
    case 'bot_offline': return 'Bot Offline';
    case 'group_failed': return 'Onboarding Falhou';
    case 'group_paused': return 'Grupo Pausado';
    case 'onboarding_completed': return 'Onboarding Concluido';
    case 'integration_error': return 'Erro de Integração';
    default: return 'Alerta';
  }
}

async function handleGroupAdmin(supabase: TenantContext['supabase'], groupFilter: string): Promise<NextResponse> {
  const [groupResult, membersResult] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, status, created_at')
      .eq('id', groupFilter),
    supabase
      .from('members')
      .select('id, status, vencimento_at')
      .eq('group_id', groupFilter),
  ]);

  const dbError = groupResult.error || membersResult.error;
  if (dbError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: dbError.message } },
      { status: 500 },
    );
  }

  const group = (groupResult.data ?? [])[0] ?? null;
  const members = membersResult.data ?? [];

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const activeMembers = members.filter((m) => m.status === 'trial' || m.status === 'ativo');
  const memberSummary = {
    total: activeMembers.length,
    trial: members.filter((m) => m.status === 'trial').length,
    ativo: members.filter((m) => m.status === 'ativo').length,
    vencendo: members.filter((m) =>
      m.status === 'ativo' && m.vencimento_at &&
      new Date(m.vencimento_at) <= sevenDays &&
      new Date(m.vencimento_at) > now,
    ).length,
  };

  // Get unread notification count
  const { count: unreadCount, error: unreadError } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false)
    .eq('group_id', groupFilter);

  if (unreadError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: unreadError.message } },
      { status: 500 },
    );
  }

  const data: GroupAdminDashboardData = {
    summary: { members: memberSummary },
    group: group ? {
      id: group.id,
      name: group.name,
      status: group.status,
      created_at: group.created_at,
    } : null,
    alerts: [],
    unread_count: unreadCount ?? 0,
  };

  return NextResponse.json({ success: true, data });
}

export const GET = createApiHandler(async (_req, context) => {
  const { supabase, role, groupFilter } = context;

  // group_admin gets a simplified dashboard with member summary
  if (role === 'group_admin' && groupFilter) {
    return handleGroupAdmin(supabase, groupFilter);
  }

  // super_admin: full dashboard with all groups, bots, alerts
  // Parallel queries — RLS automatically filters for group_admin
  const [groupsResult, botsResult, botHealthResult, membersResult, auditLogResult] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, status, created_at'),
    supabase
      .from('bot_pool')
      .select('id, status'),
    supabase
      .from('bot_health')
      .select('group_id, status, last_heartbeat, error_message, groups(name)'),
    supabase
      .from('members')
      .select('id, group_id, status'),
    supabase
      .from('audit_log')
      .select('table_name, record_id, action, changes, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Check for DB errors (audit_log is non-fatal — RLS restricts to super_admin)
  const dbError = groupsResult.error || botsResult.error || botHealthResult.error || membersResult.error;
  if (dbError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: dbError.message } },
      { status: 500 },
    );
  }

  const groups = groupsResult.data ?? [];
  const bots = botsResult.data ?? [];
  const botHealth = botHealthResult.data ?? [];
  const members = membersResult.data ?? [];

  // Build summary
  const summary: DashboardSummary = {
    groups: {
      active: groups.filter((g) => g.status === 'active').length,
      paused: groups.filter((g) => g.status === 'paused').length,
      total: groups.length,
    },
    bots: {
      available: bots.filter((b) => b.status === 'available').length,
      in_use: bots.filter((b) => b.status === 'in_use').length,
      total: bots.length,
      online: botHealth.filter((h) => h.status === 'online').length,
      offline: botHealth.filter((h) => h.status === 'offline').length,
    },
    members: {
      total: members.filter((m) => m.status === 'trial' || m.status === 'ativo').length,
    },
  };

  // Build group cards with active member counts
  const activeMembers = members.filter((m) => m.status === 'trial' || m.status === 'ativo');
  const memberCountByGroup = new Map<string, number>();
  for (const m of activeMembers) {
    if (m.group_id) {
      memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1);
    }
  }

  const groupCards: DashboardGroupCard[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    status: g.status,
    created_at: g.created_at,
    active_members: memberCountByGroup.get(g.id) ?? 0,
  }));

  // Build alerts
  const alerts: DashboardAlert[] = [];

  // Bots offline
  for (const h of botHealth) {
    if (h.status === 'offline') {
      const groupName = (h.groups as unknown as { name: string } | null)?.name;
      alerts.push({
        type: 'bot_offline',
        message: `Bot do grupo "${groupName ?? 'Desconhecido'}" esta offline${h.error_message ? `: ${h.error_message}` : ''}`,
        timestamp: h.last_heartbeat,
        group_name: groupName ?? undefined,
      });
    }
  }

  // Groups with failed status
  for (const g of groups) {
    if (g.status === 'failed') {
      alerts.push({
        type: 'group_failed',
        message: `Onboarding do grupo "${g.name}" falhou`,
        timestamp: g.created_at,
        group_name: g.name,
      });
    }
  }

  // Groups with paused status
  for (const g of groups) {
    if (g.status === 'paused') {
      alerts.push({
        type: 'group_paused',
        message: `Grupo "${g.name}" esta pausado`,
        timestamp: g.created_at,
        group_name: g.name,
      });
    }
  }

  // Onboarding completed alerts from audit_log (non-fatal if audit_log query failed)
  const auditLogEntries = auditLogResult.data ?? [];
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  for (const entry of auditLogEntries) {
    if (entry.table_name === 'groups' && entry.action === 'UPDATE') {
      const changes = entry.changes as Record<string, unknown> | null;
      if (changes?.status === 'active') {
        const group = groupsById.get(entry.record_id);
        const groupName = group?.name ?? 'Desconhecido';
        alerts.push({
          type: 'onboarding_completed',
          message: `Grupo "${groupName}" onboarding concluido`,
          timestamp: entry.created_at,
          group_name: groupName,
        });
      }
    }
  }

  // Persist alerts as notifications BEFORE querying unread count
  await persistNotifications(supabase, alerts, groupsById);

  // Get unread notification count
  const { count: unreadCount, error: unreadError } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false);

  if (unreadError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: unreadError.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { summary, groups: groupCards, alerts, unread_count: unreadCount ?? 0 },
  });
});

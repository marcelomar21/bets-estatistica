import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import type { DashboardSummary, DashboardGroupCard, DashboardAlert } from '@/types/database';

export const GET = createApiHandler(async (_req, context) => {
  const { supabase } = context;

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

  return NextResponse.json({
    success: true,
    data: { summary, groups: groupCards, alerts },
  });
});

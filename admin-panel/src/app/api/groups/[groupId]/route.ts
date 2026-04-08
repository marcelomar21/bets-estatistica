import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';
import { deactivateSubscriptionPlan } from '@/lib/mercadopago';
import { suspendBotService, toBotApiGroupId } from '@/lib/render';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type GroupRouteContext = { params: Promise<{ groupId: string }> };

// Story 5.5: posting_schedule schema with duplicate validation
const postingScheduleSchema = z.object({
  enabled: z.boolean(),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/, 'Formato deve ser HH:mm')).min(1).max(12),
}).refine(
  (data) => new Set(data.times).size === data.times.length,
  { message: 'Horários duplicados não são permitidos' },
).refine(
  (data) => data.times.every(t => {
    const [h, m] = t.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }),
  { message: 'Horário inválido (deve ser 00:00-23:59)' },
);

const updateGroupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  telegram_group_id: z.number().nullable().optional(),
  telegram_admin_group_id: z.number().nullable().optional(),
  status: z.enum(['creating', 'active', 'paused', 'inactive', 'failed']).optional(),
  posting_schedule: postingScheduleSchema.optional(),
  is_test: z.boolean().optional(),
  enabled_modules: z.array(z.enum(['analytics', 'distribution', 'posting', 'members', 'tone'])).optional(),
});

const GROUP_SELECT_FIELDS = 'id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, mp_plan_id, render_service_id, posting_schedule, is_test, enabled_modules, created_at';

export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    // Story 5.5: Group admin can only GET their own group
    if (context.groupFilter && context.groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    const { data: group, error } = await context.supabase
      .from('groups')
      .select(GROUP_SELECT_FIELDS)
      .eq('id', groupId)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    if (!group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: group });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    // Story 5.5: Group admin can only update their own group
    if (context.groupFilter && context.groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = updateGroupSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Only super_admin can change enabled_modules
    if (parsed.data.enabled_modules && context.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Apenas super_admin pode alterar modulos' } },
        { status: 403 },
      );
    }

    // Fetch current data for audit log comparison
    const { data: currentGroup } = await context.supabase
      .from('groups')
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, posting_schedule, is_test, enabled_modules')
      .eq('id', groupId)
      .single();

    const { data: group, error } = await context.supabase
      .from('groups')
      .update(parsed.data)
      .eq('id', groupId)
      .select(GROUP_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    if (!group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found or update failed' } },
        { status: 404 },
      );
    }

    // Reassign post_at for unposted bets when posting_schedule.times changes
    if (parsed.data.posting_schedule && currentGroup) {
      const oldTimes = (currentGroup.posting_schedule as { times?: string[] } | null)?.times ?? [];
      const newTimes = parsed.data.posting_schedule.times;
      const timesChanged = JSON.stringify([...oldTimes].sort()) !== JSON.stringify([...newTimes].sort());

      if (timesChanged && newTimes.length > 0) {
        const supabaseAdmin = getSupabaseAdmin();
        // Fetch unposted bets with stale post_at (not in new schedule)
        const { data: staleBets } = await supabaseAdmin
          .from('bet_group_assignments')
          .select('id, post_at')
          .eq('group_id', groupId)
          .eq('posting_status', 'ready');

        if (staleBets && staleBets.length > 0) {
          // Count bets per new time slot for round-robin
          const timeCounts: Record<string, number> = {};
          for (const t of newTimes) timeCounts[t] = 0;
          for (const bet of staleBets) {
            if (bet.post_at && newTimes.includes(bet.post_at)) {
              timeCounts[bet.post_at]++;
            }
          }

          // Reassign bets whose post_at is not in the new schedule
          for (const bet of staleBets) {
            if (bet.post_at && newTimes.includes(bet.post_at)) continue;

            // Pick time with fewest bets (round-robin)
            let minTime = newTimes[0];
            let minCount = timeCounts[minTime] ?? 0;
            for (const t of newTimes) {
              if ((timeCounts[t] ?? 0) < minCount) {
                minTime = t;
                minCount = timeCounts[t] ?? 0;
              }
            }

            await supabaseAdmin
              .from('bet_group_assignments')
              .update({ post_at: minTime })
              .eq('id', bet.id);
            timeCounts[minTime] = (timeCounts[minTime] ?? 0) + 1;
          }
        }
      }
    }

    // Insert audit log — non-blocking (failure does not affect the update response)
    if (currentGroup) {
      const changedFields: Record<string, unknown> = {};
      const oldFields: Record<string, unknown> = {};
      const auditKeys = ['name', 'status', 'telegram_group_id', 'telegram_admin_group_id', 'posting_schedule', 'is_test', 'enabled_modules'] as const;

      for (const key of auditKeys) {
        const oldVal = currentGroup[key as keyof typeof currentGroup];
        const newVal = parsed.data[key as keyof typeof parsed.data];
        if (newVal !== undefined && JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
          oldFields[key] = oldVal;
          changedFields[key] = newVal;
        }
      }

      if (Object.keys(changedFields).length > 0) {
        const { error: auditError } = await context.supabase.from('audit_log').insert({
          table_name: 'groups',
          record_id: groupId,
          action: 'update',
          changed_by: context.user.id,
          changes: { old: oldFields, new: changedFields },
        });
        if (auditError) {
          console.warn('[audit_log] Failed to insert audit log for group update', groupId, auditError.message);
        }
      }
    }

    // Sync telegram_admin_group_id and telegram_group_id changes to bot_pool
    if (parsed.data.telegram_admin_group_id !== undefined || parsed.data.telegram_group_id !== undefined) {
      const supabaseAdmin = getSupabaseAdmin();
      const botPoolUpdate: Record<string, unknown> = {};

      if (parsed.data.telegram_admin_group_id !== undefined) {
        botPoolUpdate.admin_group_id = parsed.data.telegram_admin_group_id !== null
          ? Number(toBotApiGroupId(parsed.data.telegram_admin_group_id))
          : null;
      }

      if (parsed.data.telegram_group_id !== undefined) {
        botPoolUpdate.public_group_id = parsed.data.telegram_group_id !== null
          ? Number(toBotApiGroupId(parsed.data.telegram_group_id))
          : null;
      }

      if (Object.keys(botPoolUpdate).length > 0) {
        const { error: syncError } = await supabaseAdmin
          .from('bot_pool')
          .update(botPoolUpdate)
          .eq('group_id', groupId);

        if (syncError) {
          console.warn('[group-update] Failed to sync chat IDs to bot_pool', groupId, syncError.message);
        }
      }
    }

    return NextResponse.json({ success: true, data: group });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

export const DELETE = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    // Fetch group with cleanup-relevant fields
    const { data: group, error: fetchError } = await context.supabase
      .from('groups')
      .select('id, name, status, mp_plan_id, render_service_id')
      .eq('id', groupId)
      .single();

    if (fetchError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Grupo não encontrado' } },
        { status: 404 },
      );
    }

    if (group.status === 'deleted') {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_DELETED', message: 'Grupo já foi excluído' } },
        { status: 400 },
      );
    }

    // Best-effort cleanup — failures are logged but don't block the delete

    // 1. Cancel MercadoPago subscription plan
    if (group.mp_plan_id) {
      const mpResult = await deactivateSubscriptionPlan(group.mp_plan_id);
      if (!mpResult.success) {
        console.warn('[delete-group] Failed to deactivate MP plan', groupId, mpResult.error);
      }
    }

    // 2. Suspend Render bot service (for legacy groups with individual services)
    if (group.render_service_id) {
      const renderResult = await suspendBotService(group.render_service_id);
      if (!renderResult.success) {
        console.warn('[delete-group] Failed to suspend Render service', groupId, renderResult.error);
      }
    }

    // 3. Release bot_pool entries
    await context.supabase
      .from('bot_pool')
      .update({ group_id: null, status: 'available', is_active: false })
      .eq('group_id', groupId);

    // 4. Delete admin users (auth + admin_users table)
    const supabaseAdmin = getSupabaseAdmin();
    const { data: adminUsers } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('group_id', groupId);

    if (adminUsers && adminUsers.length > 0) {
      for (const adminUser of adminUsers) {
        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(adminUser.id);
        if (authErr) {
          console.warn('[delete-group] Failed to delete auth user', adminUser.id, authErr.message);
        }
        const { error: rowErr } = await supabaseAdmin
          .from('admin_users')
          .delete()
          .eq('id', adminUser.id);
        if (rowErr) {
          console.warn('[delete-group] Failed to delete admin_users row', adminUser.id, rowErr.message);
        }
      }
    }

    // 5. Delete bot_health
    await context.supabase
      .from('bot_health')
      .delete()
      .eq('group_id', groupId);

    // 6. Release whatsapp_numbers
    await context.supabase
      .from('whatsapp_numbers')
      .update({ group_id: null, status: 'available' })
      .eq('group_id', groupId);

    // 7. Soft delete: set group status to 'deleted'
    const { error: updateError } = await context.supabase
      .from('groups')
      .update({ status: 'deleted' })
      .eq('id', groupId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    // Audit log
    const { error: auditError } = await context.supabase.from('audit_log').insert({
      table_name: 'groups',
      record_id: groupId,
      action: 'delete',
      changed_by: context.user.id,
      changes: { old: { status: group.status }, new: { status: 'deleted' }, group_name: group.name },
    });
    if (auditError) {
      console.warn('[audit_log] Failed to insert audit log for group delete', groupId, auditError.message);
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Grupo excluído com sucesso' },
    });
  },
  { allowedRoles: ['super_admin'] },
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

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
});

const GROUP_SELECT_FIELDS = 'id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, mp_plan_id, render_service_id, posting_schedule, created_at';

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

    // Fetch current data for audit log comparison
    const { data: currentGroup } = await context.supabase
      .from('groups')
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, posting_schedule')
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

    // Insert audit log — non-blocking (failure does not affect the update response)
    if (currentGroup) {
      const changedFields: Record<string, unknown> = {};
      const oldFields: Record<string, unknown> = {};
      const auditKeys = ['name', 'status', 'telegram_group_id', 'telegram_admin_group_id', 'posting_schedule'] as const;

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

    return NextResponse.json({ success: true, data: group });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

type GroupRouteContext = { params: Promise<{ groupId: string }> };

const updateGroupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  telegram_group_id: z.number().nullable().optional(),
  telegram_admin_group_id: z.number().nullable().optional(),
  status: z.enum(['creating', 'active', 'paused', 'inactive', 'failed']).optional(),
});

export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    const { data: group, error } = await context.supabase
      .from('groups')
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
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
  { allowedRoles: ['super_admin'] },
);

export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

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
      .select('id, name, status, telegram_group_id, telegram_admin_group_id')
      .eq('id', groupId)
      .single();

    const { data: group, error } = await context.supabase
      .from('groups')
      .update(parsed.data)
      .eq('id', groupId)
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
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
      const auditKeys = ['name', 'status', 'telegram_group_id', 'telegram_admin_group_id'] as const;

      for (const key of auditKeys) {
        if (parsed.data[key] !== undefined && parsed.data[key] !== currentGroup[key]) {
          oldFields[key] = currentGroup[key];
          changedFields[key] = parsed.data[key];
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
  { allowedRoles: ['super_admin'] },
);

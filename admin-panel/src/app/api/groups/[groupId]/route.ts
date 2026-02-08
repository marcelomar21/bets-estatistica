import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

const updateGroupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  telegram_group_id: z.number().nullable().optional(),
  telegram_admin_group_id: z.number().nullable().optional(),
  status: z.enum(['creating', 'active', 'paused', 'inactive', 'failed']).optional(),
});

export const GET = createApiHandler(
  async (req: NextRequest, context) => {
    const groupId = req.nextUrl.pathname.split('/').pop();

    const { data: group, error } = await context.supabase
      .from('groups')
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
      .eq('id', groupId)
      .single();

    if (error || !group) {
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
  async (req: NextRequest, context) => {
    const groupId = req.nextUrl.pathname.split('/').pop();

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

    const { data: group, error } = await context.supabase
      .from('groups')
      .update(parsed.data)
      .eq('id', groupId)
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
      .single();

    if (error || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found or update failed' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: group });
  },
  { allowedRoles: ['super_admin'] },
);

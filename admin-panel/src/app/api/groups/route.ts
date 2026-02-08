import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

const createGroupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telegram_group_id: z.number().optional(),
  telegram_admin_group_id: z.number().optional(),
});

export const GET = createApiHandler(
  async (_req, context) => {
    const { data: groups, error } = await context.supabase
      .from('groups')
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: groups });
  },
  { allowedRoles: ['super_admin'] },
);

export const POST = createApiHandler(
  async (req, context) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { data: group, error } = await context.supabase
      .from('groups')
      .insert(parsed.data)
      .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  },
  { allowedRoles: ['super_admin'] },
);

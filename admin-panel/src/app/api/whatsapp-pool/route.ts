import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

const addNumberSchema = z.object({
  phone_number: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Telefone deve estar no formato E.164 (ex: +5511999887766)'),
});

export const GET = createApiHandler(
  async (_req, context) => {
    const { data: numbers, error } = await context.supabase
      .from('whatsapp_numbers')
      .select('id, phone_number, status, group_id, role, last_heartbeat, banned_at, allocated_at, created_at, groups(name)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    const list = numbers ?? [];
    const summary = {
      total: list.length,
      available: list.filter((n) => n.status === 'available').length,
      active: list.filter((n) => n.status === 'active').length,
      backup: list.filter((n) => n.status === 'backup').length,
      banned: list.filter((n) => n.status === 'banned').length,
      cooldown: list.filter((n) => n.status === 'cooldown').length,
      connecting: list.filter((n) => n.status === 'connecting').length,
    };

    return NextResponse.json({ success: true, data: list, summary });
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

    const parsed = addNumberSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const phoneNumber = parsed.data.phone_number;
    const jid = phoneNumber.replace(/^\+/, '') + '@s.whatsapp.net';

    const { data: number, error } = await context.supabase
      .from('whatsapp_numbers')
      .insert({
        phone_number: phoneNumber,
        jid,
        status: 'connecting',
      })
      .select('id, phone_number, status, group_id, role, last_heartbeat, banned_at, allocated_at, created_at, groups(name)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_NUMBER', message: 'Numero ja existe no pool' } },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: number }, { status: 201 });
  },
  { allowedRoles: ['super_admin'] },
);

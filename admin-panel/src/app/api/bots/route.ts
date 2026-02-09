import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';
import { validateBotToken } from '@/lib/telegram';

const createBotSchema = z.object({
  bot_token: z.string().trim().min(1, 'Token é obrigatório'),
});

export const GET = createApiHandler(
  async (_req, context) => {
    const { data: bots, error } = await context.supabase
      .from('bot_pool')
      .select('id, bot_username, status, group_id, created_at, groups(name)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    const botList = bots ?? [];
    const summary = {
      available: botList.filter((b) => b.status === 'available').length,
      in_use: botList.filter((b) => b.status === 'in_use').length,
      total: botList.length,
    };

    return NextResponse.json({ success: true, data: botList, summary });
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

    const parsed = createBotSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const validation = await validateBotToken(parsed.data.bot_token);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: validation.error } },
        { status: 400 },
      );
    }

    const { data: bot, error } = await context.supabase
      .from('bot_pool')
      .insert({
        bot_token: parsed.data.bot_token,
        bot_username: validation.data.username,
        status: 'available',
      })
      .select('id, bot_username, status, group_id, created_at, groups(name)')
      .single();

    if (error) {
      const isConstraintError =
        error.code?.startsWith('23') ||
        /duplicate|violates|constraint/i.test(error.message);

      if (isConstraintError) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Token ou username já existe no pool' } },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: bot }, { status: 201 });
  },
  { allowedRoles: ['super_admin'] },
);

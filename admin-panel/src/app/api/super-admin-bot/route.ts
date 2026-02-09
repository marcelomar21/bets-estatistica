import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';
import { encrypt } from '@/lib/encryption';
import { validateBotTokenViaTelegram } from '@/lib/super-admin-bot';
import { logAudit } from '@/lib/audit';

const postSchema = z.object({
  bot_token: z.string().min(20, 'Token do bot inválido'),
  founder_chat_ids: z.array(z.number()).min(1, 'Pelo menos um founder chat ID é necessário'),
});

export const GET = createApiHandler(
  async (_req, context) => {
    const { data: config, error } = await context.supabase
      .from('super_admin_bot_config')
      .select('id, bot_username, founder_chat_ids, is_active, created_at')
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    // NEVER return bot_token
    return NextResponse.json({
      success: true,
      data: config || null,
    });
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

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map(e => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { bot_token, founder_chat_ids } = parsed.data;

    // Validate token via Telegram API (getMe)
    const validation = await validateBotTokenViaTelegram(bot_token);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_BOT_TOKEN', message: validation.error || 'Token inválido' } },
        { status: 400 },
      );
    }

    const encryptedToken = encrypt(bot_token);

    // Deactivate any existing config
    await context.supabase
      .from('super_admin_bot_config')
      .update({ is_active: false })
      .eq('is_active', true);

    // Insert new config
    const { data: config, error: insertError } = await context.supabase
      .from('super_admin_bot_config')
      .insert({
        bot_token: encryptedToken,
        bot_username: validation.username!,
        founder_chat_ids,
        is_active: true,
      })
      .select('id, bot_username, founder_chat_ids, is_active, created_at')
      .single();

    if (insertError || !config) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: insertError?.message || 'Falha ao salvar configuração' } },
        { status: 500 },
      );
    }

    logAudit(context.supabase, context.user.id, config.id, 'super_admin_bot_config', 'config_saved', {
      bot_username: validation.username,
      founder_count: founder_chat_ids.length,
    });

    return NextResponse.json({ success: true, data: config });
  },
  { allowedRoles: ['super_admin'] },
);

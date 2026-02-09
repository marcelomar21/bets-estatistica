import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getBotConfig, testFounderReachability } from '@/lib/super-admin-bot';

export const POST = createApiHandler(
  async (_req, context) => {
    const config = await getBotConfig(context.supabase);

    if (!config) {
      return NextResponse.json(
        { success: false, error: { code: 'BOT_SUPER_ADMIN_NOT_CONFIGURED', message: 'Bot Super Admin não configurado. Configure em /settings/telegram' } },
        { status: 400 },
      );
    }

    const results = await testFounderReachability(config.bot_token, config.founder_chat_ids);

    return NextResponse.json({
      success: true,
      data: { results },
    });
  },
  { allowedRoles: ['super_admin'] },
);

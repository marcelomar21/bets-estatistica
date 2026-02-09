import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (_req, context) => {
    const { data: sessions, error } = await context.supabase
      .from('mtproto_sessions')
      .select('id, phone_number, label, is_active, requires_reauth, last_used_at, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    // NEVER include session_string
    return NextResponse.json({ success: true, data: sessions });
  },
  { allowedRoles: ['super_admin'] },
);

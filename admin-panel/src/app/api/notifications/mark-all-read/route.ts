import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const PATCH = createApiHandler(
  async (_req, context) => {
    const { count, error } = await context.supabase
      .from('notifications')
      .update({ read: true }, { count: 'exact' })
      .eq('read', false);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { updated_count: count ?? 0 },
    });
  },
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

const querySchema = z.object({
  read: z.enum(['true', 'false']).optional(),
  days: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = createApiHandler(
  async (req: NextRequest, context) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { read, days, limit, offset } = parsed.data;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = context.supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (read !== undefined) {
      query = query.eq('read', read === 'true');
    }

    // Run both queries in parallel
    const [mainResult, unreadResult] = await Promise.all([
      query,
      context.supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
        .gte('created_at', since),
    ]);

    const { data: notifications, error, count } = mainResult;

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    const { count: unreadCount, error: unreadError } = unreadResult;

    if (unreadError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: unreadError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        notifications: notifications ?? [],
        total: count ?? 0,
        unread_count: unreadCount ?? 0,
      },
    });
  },
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

type NotificationRouteContext = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  read: z.boolean(),
});

export const PATCH = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { id } = await (routeContext as NotificationRouteContext).params;

    const uuidResult = z.string().uuid().safeParse(id);
    if (!uuidResult.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid notification ID format' } },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { data: notifications, error } = await context.supabase
      .from('notifications')
      .update({ read: parsed.data.read })
      .eq('id', id)
      .select('id, read');

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: notifications[0] });
  },
);

import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { logAudit } from '@/lib/audit';

export const DELETE = createApiHandler(
  async (_req, context, routeContext) => {
    const { id } = await routeContext.params;

    const { data: session, error: fetchError } = await context.supabase
      .from('mtproto_sessions')
      .select('id, phone_number, label')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Sessão não encontrada' } },
        { status: 404 },
      );
    }

    const { error: updateError } = await context.supabase
      .from('mtproto_sessions')
      .update({ is_active: false, locked_at: null, locked_by: null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    logAudit(context.supabase, context.user.id, id, 'mtproto_sessions', 'session_deactivated', {
      phone_number: session.phone_number,
      label: session.label,
    });

    return NextResponse.json({ success: true, data: { id, deactivated: true } });
  },
  { allowedRoles: ['super_admin'] },
);

import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const DELETE = createApiHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req, context, routeContext: any) => {
    const { supabase, groupFilter } = context;
    const { id } = await routeContext.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID invalido' } },
        { status: 400 },
      );
    }

    // Fetch message
    let query = supabase
      .from('scheduled_messages')
      .select('id, status, group_id')
      .eq('id', id);

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data: message, error: fetchError } = await query.single();

    if (fetchError || !message) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mensagem nao encontrada' } },
        { status: 404 },
      );
    }

    if (message.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATUS', message: 'Mensagem ja foi enviada ou cancelada' } },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao cancelar mensagem' } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  },
);

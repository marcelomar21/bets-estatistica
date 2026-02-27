import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const VALID_RESULTS = new Set(['success', 'failure', 'unknown', 'cancelled']);

export const PATCH = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase, groupFilter, user } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { bet_result, result_reason } = body;

    if (!bet_result || !VALID_RESULTS.has(bet_result)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Resultado invalido. Valores aceitos: success, failure, unknown, cancelled' } },
        { status: 400 },
      );
    }

    if (!result_reason || typeof result_reason !== 'string' || result_reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Motivo da alteracao e obrigatorio' } },
        { status: 400 },
      );
    }

    if (result_reason.trim().length > 500) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Motivo muito longo (maximo 500 caracteres)' } },
        { status: 400 },
      );
    }

    // Verify bet exists and user has access
    let checkQuery = supabase
      .from('suggested_bets')
      .select('id, group_id')
      .eq('id', betId);

    if (groupFilter) {
      checkQuery = checkQuery.eq('group_id', groupFilter);
    }

    const { data: bet, error: checkError } = await checkQuery.single();

    if (checkError || !bet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Update result
    const reasonWithAuthor = `[manual:${user.email}] ${result_reason.trim()}`;

    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({
        bet_result,
        result_reason: reasonWithAuthor,
        result_source: 'manual',
        result_updated_at: new Date().toISOString(),
      })
      .eq('id', betId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao atualizar resultado' } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

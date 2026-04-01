import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

/**
 * POST /api/bets/[id]/remove
 * Same logic as bot's /remover command:
 * sets elegibilidade = 'removida' to take the bet out of the posting queue.
 * Does NOT change bet_status — the pipeline status is independent.
 * Can be reversed with /promote (promoverAposta).
 */
export const POST = createApiHandler(
  async (_req, context, routeContext) => {
    const { supabase, groupFilter } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    // Verify group access via junction table (for group_admin)
    if (groupFilter) {
      const { data: assignment } = await supabase
        .from('bet_group_assignments')
        .select('id')
        .eq('bet_id', betId)
        .eq('group_id', groupFilter)
        .limit(1);
      if (!assignment || assignment.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
          { status: 404 },
        );
      }
    }

    // Fetch bet
    const query = supabase
      .from('suggested_bets')
      .select('id, bet_status, elegibilidade')
      .eq('id', betId);

    const { data: bet, error: fetchError } = await query.single();

    if (fetchError || !bet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    if (bet.elegibilidade === 'removida') {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_REMOVED', message: 'Aposta ja esta removida da fila' } },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({ elegibilidade: 'removida' })
      .eq('id', betId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: betId,
        elegibilidade: 'removida',
        bet_status: bet.bet_status,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

/**
 * POST /api/bets/[id]/promote
 * Manually promotes a bet to the posting queue.
 * Same logic as bot's /promover command:
 * sets elegibilidade = 'elegivel' and promovida_manual = true.
 * Does NOT force bet_status — the bot handles status transitions.
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

    // Fetch current bet
    let query = supabase
      .from('suggested_bets')
      .select('id, bet_status, odds, deep_link, promovida_manual, elegibilidade, group_id')
      .eq('id', betId);

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data: bet, error: fetchError } = await query.single();

    if (fetchError || !bet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Removed bets can always be re-promoted (restoring to the queue)
    const isRestore = bet.elegibilidade === 'removida';

    if (!isRestore && bet.bet_status === 'posted') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Aposta ja foi postada' } },
        { status: 400 },
      );
    }

    if (!isRestore && bet.promovida_manual === true) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_PROMOTED', message: 'Aposta ja esta promovida' } },
        { status: 400 },
      );
    }

    // Must have deep_link to be promoted — without link the bet can never be posted
    if (!bet.deep_link) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Aposta nao pode ser promovida sem link. Adicione o link primeiro.' } },
        { status: 400 },
      );
    }

    // Same as bot's promoverAposta: set elegibilidade + promovida_manual
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({
        elegibilidade: 'elegivel',
        promovida_manual: true,
      })
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
        elegibilidade: 'elegivel',
        promovida_manual: true,
        bet_status: bet.bet_status,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

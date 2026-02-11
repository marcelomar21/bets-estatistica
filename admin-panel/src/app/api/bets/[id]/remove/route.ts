import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { determineStatus } from '@/lib/bet-utils';
import type { BetStatus } from '@/types/database';

/**
 * POST /api/bets/[id]/remove
 * Removes a bet from the posting queue by reverting its promotion.
 * Sets promovida_manual = false and recalculates bet_status.
 * The bet returns to "Apostas Pendentes" instead of disappearing.
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

    // Verify bet exists and belongs to the admin's group
    let query = supabase
      .from('suggested_bets')
      .select('id, group_id, bet_status, odds, deep_link, promovida_manual')
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

    if (bet.bet_status !== 'ready') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Aposta nao esta na fila de postagem' } },
        { status: 400 },
      );
    }

    // Recalculate natural status without manual promotion
    const newStatus = determineStatus(
      bet.bet_status as BetStatus,
      bet.odds,
      bet.deep_link,
      false, // promovida_manual = false
    );

    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({
        promovida_manual: false,
        bet_status: newStatus,
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
        old_status: bet.bet_status,
        new_status: newStatus,
        promovida_manual: false,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

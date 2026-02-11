import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import type { BetStatus } from '@/types/database';

const MIN_ODDS = 1.60;

function determineStatus(
  currentStatus: BetStatus,
  odds: number | null,
  deepLink: string | null,
  promovidaManual: boolean,
): BetStatus {
  if (currentStatus === 'posted') return 'posted';
  const hasOdds = odds != null && (odds >= MIN_ODDS || promovidaManual);
  const hasLink = !!deepLink;
  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}

export const PATCH = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    // Parse and validate request body
    let body: { odds?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisicao invalido' } },
        { status: 400 },
      );
    }

    const newOdds = typeof body.odds === 'number' ? body.odds : parseFloat(String(body.odds));

    if (Number.isNaN(newOdds) || !Number.isFinite(newOdds) || newOdds <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Odds deve ser um numero positivo' } },
        { status: 400 },
      );
    }

    // Fetch current bet
    const { data: current, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id, odds, deep_link, bet_status, promovida_manual')
      .eq('id', betId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Skip if odds didn't change
    if (Math.abs((current.odds ?? 0) - newOdds) < 0.001) {
      return NextResponse.json({
        success: true,
        data: {
          bet: current,
          promoted: false,
          old_odds: current.odds,
          new_odds: newOdds,
        },
      });
    }

    const oldOdds = current.odds;
    const newStatus = determineStatus(
      current.bet_status as BetStatus,
      newOdds,
      current.deep_link,
      current.promovida_manual,
    );
    const shouldUpdateStatus = newStatus !== current.bet_status && current.bet_status !== 'posted';

    const updatePayload: { odds: number; bet_status?: BetStatus } = { odds: newOdds };
    if (shouldUpdateStatus) {
      updatePayload.bet_status = newStatus;
    }

    // Update odds (and status when needed) in a single query
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update(updatePayload)
      .eq('id', betId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao atualizar odds' } },
        { status: 500 },
      );
    }

    // Register history (best-effort)
    await supabase.from('odds_update_history').insert({
      bet_id: betId,
      update_type: 'odds_change',
      old_value: oldOdds,
      new_value: newOdds,
      job_name: 'manual_admin',
    });

    const promoted = shouldUpdateStatus && newStatus === 'ready';

    // Fetch updated bet for response
    const { data: updatedBet } = await supabase
      .from('suggested_bets')
      .select('*')
      .eq('id', betId)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        bet: updatedBet ?? current,
        promoted,
        old_odds: oldOdds,
        new_odds: newOdds,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);

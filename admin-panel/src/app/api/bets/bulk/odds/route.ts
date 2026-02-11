import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import type { BetStatus } from '@/types/database';

const MIN_ODDS = 1.60;
const MAX_BULK_ITEMS = 50;

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

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase } = context;

    // Parse and validate request body
    let body: { updates?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisicao invalido' } },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Lista de updates vazia ou invalida' } },
        { status: 400 },
      );
    }

    if (body.updates.length > MAX_BULK_ITEMS) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Maximo de ${MAX_BULK_ITEMS} itens por request` } },
        { status: 400 },
      );
    }

    // Validate each item
    for (const item of body.updates) {
      if (!item || typeof item !== 'object') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Item invalido na lista de updates' } },
          { status: 400 },
        );
      }
      const odds = typeof item.odds === 'number' ? item.odds : parseFloat(String(item.odds));
      if (!Number.isInteger(item.id) || item.id <= 0) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `ID invalido: ${item.id}` } },
          { status: 400 },
        );
      }
      if (Number.isNaN(odds) || !Number.isFinite(odds) || odds <= 0) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Odds invalido para bet ${item.id}` } },
          { status: 400 },
        );
      }
    }

    const results = { updated: 0, promoted: 0, skipped: 0, failed: 0, errors: [] as Array<{ id: number; error: string }> };

    // Process sequentially to avoid race conditions
    for (const item of body.updates as Array<{ id: number; odds: number }>) {
      // Fetch current bet
      const { data: current, error: fetchError } = await supabase
        .from('suggested_bets')
        .select('odds, deep_link, bet_status, promovida_manual')
        .eq('id', item.id)
        .single();

      if (fetchError || !current) {
        results.failed++;
        results.errors.push({ id: item.id, error: 'NOT_FOUND' });
        continue;
      }

      // Skip if odds didn't change
      if (Math.abs((current.odds ?? 0) - item.odds) < 0.001) {
        results.skipped++;
        continue;
      }

      const newStatus = determineStatus(
        current.bet_status as BetStatus,
        item.odds,
        current.deep_link,
        current.promovida_manual,
      );
      const shouldUpdateStatus = newStatus !== current.bet_status && current.bet_status !== 'posted';

      const updatePayload: { odds: number; bet_status?: BetStatus } = { odds: item.odds };
      if (shouldUpdateStatus) {
        updatePayload.bet_status = newStatus;
      }

      // Update odds (and status when needed) in a single query
      const { error: updateError } = await supabase
        .from('suggested_bets')
        .update(updatePayload)
        .eq('id', item.id);

      if (updateError) {
        results.failed++;
        results.errors.push({ id: item.id, error: updateError.message });
        continue;
      }

      // Register history (best-effort)
      await supabase.from('odds_update_history').insert({
        bet_id: item.id,
        update_type: 'odds_change',
        old_value: current.odds,
        new_value: item.odds,
        job_name: 'manual_admin_bulk',
      });

      if (shouldUpdateStatus && newStatus === 'ready') {
        results.promoted++;
      }

      results.updated++;
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  },
  { allowedRoles: ['super_admin'] },
);

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

/**
 * GET /api/bets/post-now/status?bet_ids=1,2,3&group_id=uuid
 * Polling endpoint: checks if bets were posted by the bot.
 * Also checks if the bot already processed the request (flag cleared)
 * to distinguish "bot processed but posted 0" from "bot offline".
 */
export const GET = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

    const url = new URL(req.url);
    const betIdsParam = url.searchParams.get('bet_ids');
    const groupId = url.searchParams.get('group_id') || groupFilter;

    if (!betIdsParam) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'bet_ids is required' } },
        { status: 400 },
      );
    }

    const betIds = betIdsParam.split(',').map(Number).filter(n => !isNaN(n));

    if (betIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid bet_ids' } },
        { status: 400 },
      );
    }

    const { data: bets, error } = await supabase
      .from('suggested_bets')
      .select('id, bet_status')
      .in('id', betIds);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    const posted = (bets || []).filter(b => b.bet_status === 'posted').map(b => b.id);
    const pending = (bets || []).filter(b => b.bet_status !== 'posted').map(b => b.id);

    // Check if bot already cleared the flag (processed but maybe posted 0)
    let botProcessed = false;
    if (groupId && pending.length > 0) {
      const { data: group } = await supabase
        .from('groups')
        .select('post_now_requested_at')
        .eq('id', groupId)
        .single();

      // Flag cleared = bot processed the request
      if (group && !group.post_now_requested_at) {
        botProcessed = true;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        posted,
        pending,
        allPosted: pending.length === 0,
        botProcessed,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const BET_SELECT = `
  id, bet_market, bet_pick, odds, deep_link, bet_status,
  elegibilidade, promovida_manual, group_id, distributed_at,
  created_at, odds_at_post, notes,
  league_matches!inner(home_team_name, away_team_name, kickoff_time, status),
  groups(name)
`;

export const GET = createApiHandler(
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

    // Fetch bet with joins
    let query = supabase
      .from('suggested_bets')
      .select(BET_SELECT)
      .eq('id', betId);

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data: bet, error: betError } = await query.single();

    if (betError || !bet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Fetch odds history (last 20 entries)
    const { data: oddsHistory, error: historyError } = await supabase
      .from('odds_update_history')
      .select('id, bet_id, update_type, old_value, new_value, job_name, created_at')
      .eq('bet_id', betId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (historyError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar historico de odds' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        bet,
        odds_history: oddsHistory ?? [],
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

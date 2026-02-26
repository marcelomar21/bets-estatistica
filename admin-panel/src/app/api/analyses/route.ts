import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;
    const url = new URL(req.url);
    const dateFilter = url.searchParams.get('date');
    const teamFilter = url.searchParams.get('team');

    // If group admin, first get their group's match_ids via suggested_bets
    let matchIdFilter: number[] | null = null;
    if (groupFilter) {
      const { data: bets, error: betsError } = await supabase
        .from('suggested_bets')
        .select('match_id')
        .eq('group_id', groupFilter);

      if (betsError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: betsError.message } },
          { status: 500 },
        );
      }

      matchIdFilter = [...new Set((bets || []).map((b: { match_id: number }) => b.match_id))];
      if (matchIdFilter.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    let query = supabase
      .from('game_analysis')
      .select('id, match_id, pdf_storage_path, pdf_uploaded_at, created_at, updated_at, league_matches!inner(home_team_name, away_team_name, kickoff_time)');

    if (matchIdFilter) {
      query = query.in('match_id', matchIdFilter);
    }

    if (dateFilter) {
      // Filter by kickoff_time date (YYYY-MM-DD)
      query = query
        .gte('league_matches.kickoff_time', `${dateFilter}T00:00:00`)
        .lt('league_matches.kickoff_time', `${dateFilter}T23:59:59`);
    }

    if (teamFilter) {
      // Filter by team name (case-insensitive partial match)
      query = query.or(
        `home_team_name.ilike.%${teamFilter}%,away_team_name.ilike.%${teamFilter}%`,
        { referencedTable: 'league_matches' },
      );
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  },
);

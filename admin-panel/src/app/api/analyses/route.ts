import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;
    const url = new URL(req.url);
    const dateFilter = url.searchParams.get('date');
    const teamFilter = url.searchParams.get('team');

    // If group admin, filter by their group's enabled leagues
    let leagueNameFilter: string[] | null = null;
    if (groupFilter) {
      // Get explicitly disabled leagues for this group
      const { data: disabledPrefs, error: prefsError } = await supabase
        .from('group_league_preferences')
        .select('league_name')
        .eq('group_id', groupFilter)
        .eq('enabled', false);

      if (prefsError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: prefsError.message } },
          { status: 500 },
        );
      }

      // Only apply filter if there are disabled leagues
      if (disabledPrefs && disabledPrefs.length > 0) {
        const disabledNames = new Set(disabledPrefs.map((p: { league_name: string }) => p.league_name));

        // Get all active league names, excluding disabled ones
        const { data: activeLeagues, error: leaguesError } = await supabase
          .from('league_seasons')
          .select('league_name')
          .eq('active', true);

        if (leaguesError) {
          return NextResponse.json(
            { success: false, error: { code: 'DB_ERROR', message: leaguesError.message } },
            { status: 500 },
          );
        }

        const enabledNames = [...new Set(
          (activeLeagues || [])
            .map((l: { league_name: string }) => l.league_name)
            .filter((name: string) => !disabledNames.has(name)),
        )];

        if (enabledNames.length === 0) {
          return NextResponse.json({ success: true, data: [] });
        }

        leagueNameFilter = enabledNames;
      }
      // If no disabled leagues → show all analyses (default: all enabled)
    }

    let query = supabase
      .from('game_analysis')
      .select(`
        id, match_id, pdf_storage_path, pdf_uploaded_at, created_at, updated_at,
        league_matches!inner(
          home_team_name, away_team_name, kickoff_time,
          league_seasons!inner(league_name)
        )
      `);

    if (leagueNameFilter) {
      query = query.in('league_matches.league_seasons.league_name', leagueNameFilter);
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

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

const putTiersSchema = z.object({
  leagues: z.array(
    z.object({
      league_name: z.string().min(1, 'league_name is required'),
      tier: z.enum(['standard', 'extra']),
    }),
  ).min(1, 'At least one league must be provided'),
});

/**
 * GET /api/leagues/tiers
 * Returns all active leagues with their tier classification.
 * Deduplicated by league_name (multiple seasons per league possible).
 */
export const GET = createApiHandler(
  async (_req: NextRequest, context) => {
    const { supabase } = context;

    const { data: leagueSeasons, error } = await supabase
      .from('league_seasons')
      .select('league_name, country, tier')
      .eq('active', true);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    // Deduplicate by league_name (keep first occurrence)
    const leagueMap = new Map<string, { league_name: string; country: string; tier: string }>();
    for (const ls of leagueSeasons || []) {
      if (!leagueMap.has(ls.league_name)) {
        leagueMap.set(ls.league_name, {
          league_name: ls.league_name,
          country: ls.country,
          tier: ls.tier,
        });
      }
    }

    const leagues = Array.from(leagueMap.values());

    // Sort by country then league_name
    leagues.sort((a, b) =>
      a.country.localeCompare(b.country) || a.league_name.localeCompare(b.league_name),
    );

    return NextResponse.json({
      success: true,
      data: { leagues },
    });
  },
  { allowedRoles: ['super_admin'] },
);

/**
 * PUT /api/leagues/tiers
 * Updates tier classification for specified leagues.
 * Updates all league_seasons rows matching each league_name.
 */
export const PUT = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase } = context;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = putTiersSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    let totalUpdated = 0;

    for (const league of parsed.data.leagues) {
      const { count, error } = await supabase
        .from('league_seasons')
        .update({ tier: league.tier }, { count: 'exact' })
        .eq('league_name', league.league_name);

      if (error) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: error.message } },
          { status: 500 },
        );
      }

      totalUpdated += count ?? 0;
    }

    return NextResponse.json({
      success: true,
      data: { updated: totalUpdated },
    });
  },
  { allowedRoles: ['super_admin'] },
);

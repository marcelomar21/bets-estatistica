import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

const putPricingSchema = z.object({
  prices: z.array(
    z.object({
      league_name: z.string().min(1, 'league_name is required'),
      monthly_price: z.number().positive('monthly_price must be greater than 0'),
    }),
  ).min(1, 'At least one price must be provided'),
});

/**
 * GET /api/leagues/pricing
 * Returns pricing for all extra leagues.
 * Leagues without a league_pricing row default to R$200.00.
 */
export const GET = createApiHandler(
  async (_req: NextRequest, context) => {
    const { supabase } = context;

    // Fetch all active extra leagues (deduplicated)
    const { data: leagueSeasons, error: leagueError } = await supabase
      .from('league_seasons')
      .select('league_name, country')
      .eq('active', true)
      .eq('tier', 'extra');

    if (leagueError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: leagueError.message } },
        { status: 500 },
      );
    }

    // Deduplicate by league_name
    const leagueMap = new Map<string, string>();
    for (const ls of leagueSeasons || []) {
      if (!leagueMap.has(ls.league_name)) {
        leagueMap.set(ls.league_name, ls.country);
      }
    }

    const leagueNames = Array.from(leagueMap.keys());

    // Fetch pricing for these leagues
    let pricingMap = new Map<string, number>();
    if (leagueNames.length > 0) {
      const { data: pricingRows, error: pricingError } = await supabase
        .from('league_pricing')
        .select('league_name, monthly_price')
        .in('league_name', leagueNames);

      if (pricingError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: pricingError.message } },
          { status: 500 },
        );
      }

      pricingMap = new Map(
        (pricingRows || []).map((p) => [p.league_name, Number(p.monthly_price)]),
      );
    }

    // Merge: default monthly_price = 200.00 if no row in league_pricing
    const leagues = Array.from(leagueMap.entries()).map(([league_name, country]) => ({
      league_name,
      country,
      monthly_price: pricingMap.get(league_name) ?? 200.00,
    }));

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
 * PUT /api/leagues/pricing
 * Upserts pricing for specified leagues.
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

    const parsed = putPricingSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const rows = parsed.data.prices.map((p) => ({
      league_name: p.league_name,
      monthly_price: p.monthly_price,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('league_pricing')
      .upsert(rows, { onConflict: 'league_name' });

    if (upsertError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: upsertError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { updated: rows.length },
    });
  },
  { allowedRoles: ['super_admin'] },
);

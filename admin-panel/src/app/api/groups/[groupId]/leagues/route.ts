import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

type LeagueRouteContext = { params: Promise<{ groupId: string }> };

const putLeaguesSchema = z.object({
  leagues: z.array(
    z.object({
      league_name: z.string().min(1, 'league_name é obrigatório'),
      enabled: z.boolean(),
    }),
  ).min(1, 'Ao menos uma liga deve ser enviada'),
});

/**
 * GET /api/groups/[groupId]/leagues
 * Returns all active leagues merged with group preferences.
 * If no preference exists for a league, it defaults to enabled=true.
 */
export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as LeagueRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only access their own group
    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    // 1. Fetch all active leagues from league_seasons (deduplicated by league_name)
    const { data: leagueSeasons, error: leagueError } = await supabase
      .from('league_seasons')
      .select('league_name, country')
      .eq('active', true);

    if (leagueError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: leagueError.message } },
        { status: 500 },
      );
    }

    // Deduplicate by league_name (multiple seasons per league possible)
    const leagueMap = new Map<string, string>();
    for (const ls of leagueSeasons || []) {
      if (!leagueMap.has(ls.league_name)) {
        leagueMap.set(ls.league_name, ls.country);
      }
    }

    // 2. Fetch group preferences
    const { data: preferences, error: prefError } = await supabase
      .from('group_league_preferences')
      .select('league_name, enabled')
      .eq('group_id', groupId);

    if (prefError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: prefError.message } },
        { status: 500 },
      );
    }

    // Build preference lookup
    const prefMap = new Map<string, boolean>();
    for (const p of preferences || []) {
      prefMap.set(p.league_name, p.enabled);
    }

    // 3. Merge: default enabled=true if no preference exists
    const leagues = Array.from(leagueMap.entries()).map(([league_name, country]) => ({
      league_name,
      country,
      enabled: prefMap.has(league_name) ? prefMap.get(league_name)! : true,
    }));

    // Sort by country then league_name for consistent ordering
    leagues.sort((a, b) => a.country.localeCompare(b.country) || a.league_name.localeCompare(b.league_name));

    return NextResponse.json({
      success: true,
      data: { leagues },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

/**
 * PUT /api/groups/[groupId]/leagues
 * Upsert league preferences for a group.
 */
export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as LeagueRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only edit their own group
    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = putLeaguesSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Verify group exists
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    // Upsert each preference using context.supabase (RLS enforced)
    const rows = parsed.data.leagues.map((l) => ({
      group_id: groupId,
      league_name: l.league_name,
      enabled: l.enabled,
    }));

    const { error: upsertError } = await supabase
      .from('group_league_preferences')
      .upsert(rows, { onConflict: 'group_id,league_name' });

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
  { allowedRoles: ['super_admin', 'group_admin'] },
);

import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { fetchPairStats, enrichWithHitRate } from '@/lib/pair-stats';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const VALID_BET_STATUSES = new Set(['generated', 'pending_link', 'pending_odds', 'ready', 'posted']);
const VALID_ELEGIBILIDADE = new Set(['elegivel', 'removida', 'expirada']);
const VALID_SORT_FIELDS = new Set(['kickoff_time', 'odds', 'created_at', 'bet_status', 'bet_market', 'bet_pick', 'deep_link', 'group_id', 'distributed_at']);
const VALID_SORT_DIRS = new Set(['asc', 'desc']);

function parsePositiveInt(rawValue: string | null, fallback: number): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function dbErrorResponse() {
  return NextResponse.json(
    { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar apostas' } },
    { status: 500 },
  );
}

const BET_SELECT = `
  id, bet_market, bet_pick, odds, deep_link, bet_status,
  elegibilidade, promovida_manual, group_id, distributed_at,
  created_at, odds_at_post, notes,
  league_matches!inner(home_team_name, away_team_name, kickoff_time, status, league_seasons!inner(league_name, country)),
  groups(name),
  bet_group_assignments(id, group_id, posting_status, post_at, telegram_posted_at, groups(name))
`;

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;

    const url = new URL(req.url);

    // Parse query params
    const page = parsePositiveInt(url.searchParams.get('page'), DEFAULT_PAGE);
    const perPageRaw = parsePositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE);
    const perPage = Math.min(perPageRaw, MAX_PER_PAGE);
    const from = (page - 1) * perPage;

    const statusFilter = url.searchParams.get('status')?.trim().toLowerCase() || null;
    const elegibilidadeFilter = url.searchParams.get('elegibilidade')?.trim().toLowerCase() || null;
    const groupIdParam = url.searchParams.get('group_id')?.trim() || null;
    const hasOdds = url.searchParams.get('has_odds')?.trim().toLowerCase() || null;
    const hasLink = url.searchParams.get('has_link')?.trim().toLowerCase() || null;
    const search = url.searchParams.get('search')?.trim() || null;
    const sortBy = url.searchParams.get('sort_by')?.trim().toLowerCase() || 'kickoff_time';
    const sortDir = url.searchParams.get('sort_dir')?.trim().toLowerCase() || 'desc';

    const championship = url.searchParams.get('championship')?.trim() || null;

    // Date filters (Story 5.6)
    const futureOnly = url.searchParams.get('future_only')?.trim().toLowerCase() ?? 'true';
    const dateFrom = url.searchParams.get('date_from')?.trim() || null;
    const dateTo = url.searchParams.get('date_to')?.trim() || null;

    // Validate filters
    if (statusFilter && !VALID_BET_STATUSES.has(statusFilter)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Filtro de status invalido' } },
        { status: 400 },
      );
    }
    if (elegibilidadeFilter && !VALID_ELEGIBILIDADE.has(elegibilidadeFilter)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Filtro de elegibilidade invalido' } },
        { status: 400 },
      );
    }
    if (!groupFilter && groupIdParam && groupIdParam !== '__pool__' && !UUID_PATTERN.test(groupIdParam)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id invalido' } },
        { status: 400 },
      );
    }
    if (!VALID_SORT_FIELDS.has(sortBy)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Campo de ordenacao invalido' } },
        { status: 400 },
      );
    }
    if (!VALID_SORT_DIRS.has(sortDir)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Direcao de ordenacao invalida' } },
        { status: 400 },
      );
    }
    if (dateFrom && !ISO_DATE_PATTERN.test(dateFrom)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'date_from invalido (esperado YYYY-MM-DD)' } },
        { status: 400 },
      );
    }
    if (dateTo && !ISO_DATE_PATTERN.test(dateTo)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'date_to invalido (esperado YYYY-MM-DD)' } },
        { status: 400 },
      );
    }

    // Pre-fetch assigned bet IDs from junction table (needed for pool filter/counter and group_admin scoping)
    const allAssignedPromise = supabase
      .from('bet_group_assignments')
      .select('bet_id');
    const groupAssignedPromise = groupFilter
      ? supabase.from('bet_group_assignments').select('bet_id').eq('group_id', groupFilter)
      : null;

    const [{ data: allAssigned }, groupAssignedResult] = await Promise.all([
      allAssignedPromise,
      groupAssignedPromise ?? Promise.resolve({ data: null } as { data: null }),
    ]);

    const allAssignedBetIds = [...new Set((allAssigned ?? []).map((a: { bet_id: number }) => a.bet_id))];
    const groupBetIds = groupAssignedResult?.data
      ? [...new Set(groupAssignedResult.data.map((a: { bet_id: number }) => a.bet_id))]
      : null;

    // Build main query
    let query = supabase
      .from('suggested_bets')
      .select(BET_SELECT, { count: 'exact' });

    // Multi-tenant filter (uses junction table instead of suggested_bets.group_id)
    if (groupFilter) {
      // group_admin: only bets assigned to their group
      if (groupBetIds && groupBetIds.length > 0) {
        query = query.in('id', groupBetIds);
      } else if (groupFilter) {
        // No bets assigned to this group — return empty
        query = query.in('id', [0]);
      }
    } else if (groupIdParam === '__pool__') {
      // Pool: bets with zero assignments
      if (allAssignedBetIds.length > 0) {
        query = query.not('id', 'in', `(${allAssignedBetIds.join(',')})`);
      }
    } else if (groupIdParam) {
      // Super admin filtering by specific group via junction table
      query = query.eq('bet_group_assignments.group_id', groupIdParam);
    }

    // Apply filters
    if (statusFilter) {
      query = query.eq('bet_status', statusFilter);
    }
    if (elegibilidadeFilter) {
      query = query.eq('elegibilidade', elegibilidadeFilter);
    }
    if (hasOdds === 'true') {
      query = query.not('odds', 'is', null);
    } else if (hasOdds === 'false') {
      query = query.is('odds', null);
    }
    if (hasLink === 'true') {
      query = query.not('deep_link', 'is', null);
    } else if (hasLink === 'false') {
      query = query.is('deep_link', null);
    }
    if (search) {
      // PostgREST does not support mixing foreign table and parent table columns
      // in a single .or(). Use referencedTable for team name search on league_matches.
      query = query.or(
        `home_team_name.ilike.%${search}%,away_team_name.ilike.%${search}%`,
        { referencedTable: 'league_matches' },
      );
    }
    if (championship) {
      query = query.eq('league_matches.league_seasons.league_name', championship);
    }

    // Date filters (Story 5.6)
    // Use BRT offset (-03:00) so "today" matches the Brazilian calendar day
    const BRT_OFFSET = '-03:00';
    if (dateFrom || dateTo) {
      // Explicit date range takes priority over future_only
      if (dateFrom) {
        query = query.gte('league_matches.kickoff_time', `${dateFrom}T00:00:00.000${BRT_OFFSET}`);
      }
      if (dateTo) {
        query = query.lte('league_matches.kickoff_time', `${dateTo}T23:59:59.999${BRT_OFFSET}`);
      }
    } else if (futureOnly === 'true') {
      // Default: only future games
      query = query.gte('league_matches.kickoff_time', new Date().toISOString());
    }

    // Apply sorting
    const ascending = sortDir === 'asc';
    if (sortBy === 'kickoff_time') {
      query = query.order('league_matches(kickoff_time)', { ascending });
    } else {
      query = query.order(sortBy, { ascending });
    }

    // Counter queries — scoped by tenant via junction table
    let readyQuery = supabase.from('suggested_bets').select('*', { count: 'exact', head: true }).eq('bet_status', 'ready');
    let pendingLinkQuery = supabase.from('suggested_bets').select('*', { count: 'exact', head: true }).eq('bet_status', 'pending_link');
    let pendingOddsQuery = supabase.from('suggested_bets').select('*', { count: 'exact', head: true }).eq('bet_status', 'pending_odds');
    let semOddsQuery = supabase.from('suggested_bets').select('*', { count: 'exact', head: true }).is('odds', null);
    let semLinkQuery = supabase.from('suggested_bets').select('*', { count: 'exact', head: true }).is('deep_link', null);

    // Scope suggested_bets counters for group_admin (uses junction table bet IDs)
    if (groupBetIds) {
      const betIdScope = groupBetIds.length > 0 ? groupBetIds : [0];
      readyQuery = readyQuery.in('id', betIdScope);
      pendingLinkQuery = pendingLinkQuery.in('id', betIdScope);
      pendingOddsQuery = pendingOddsQuery.in('id', betIdScope);
      semOddsQuery = semOddsQuery.in('id', betIdScope);
      semLinkQuery = semLinkQuery.in('id', betIdScope);
    }

    // Pool counter: bets with elegibilidade='elegivel' and ZERO assignments
    let poolQuery = supabase.from('suggested_bets').select('*', { count: 'exact', head: true }).eq('elegibilidade', 'elegivel');
    if (allAssignedBetIds.length > 0) {
      poolQuery = poolQuery.not('id', 'in', `(${allAssignedBetIds.join(',')})`);
    }

    // Distributed/Posted counters: from bet_group_assignments junction table
    let distributedQuery = supabase.from('bet_group_assignments').select('*', { count: 'exact', head: true }).eq('posting_status', 'ready');
    let postedAssignmentsQuery = supabase.from('bet_group_assignments').select('*', { count: 'exact', head: true }).eq('posting_status', 'posted');

    if (groupFilter) {
      distributedQuery = distributedQuery.eq('group_id', groupFilter);
      postedAssignmentsQuery = postedAssignmentsQuery.eq('group_id', groupFilter);
    }

    // Run all queries in parallel (including pair stats)
    const [mainResult, readyResult, pendingLinkResult, pendingOddsResult, semOddsResult, semLinkResult, poolResult, distributedResult, postedAssignmentsResult, pairStats] =
      await Promise.all([
        query.range(from, from + perPage - 1),
        readyQuery,
        pendingLinkQuery,
        pendingOddsQuery,
        semOddsQuery,
        semLinkQuery,
        poolQuery,
        distributedQuery,
        postedAssignmentsQuery,
        fetchPairStats(supabase),
      ]);

    if (
      mainResult.error ||
      readyResult.error ||
      pendingLinkResult.error ||
      pendingOddsResult.error ||
      semOddsResult.error ||
      semLinkResult.error ||
      poolResult.error ||
      distributedResult.error ||
      postedAssignmentsResult.error
    ) {
      return dbErrorResponse();
    }

    // Enrich items with hit_rate from pair stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedItems = (mainResult.data ?? []).map((item: any) => ({
      ...item,
      hit_rate: enrichWithHitRate(item, pairStats),
    }));

    const total = mainResult.count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

    return NextResponse.json({
      success: true,
      data: {
        items: enrichedItems,
        pagination: {
          page,
          per_page: perPage,
          total,
          total_pages: totalPages,
        },
        counters: {
          total: mainResult.count ?? 0,
          ready: readyResult.count ?? 0,
          posted: postedAssignmentsResult.count ?? 0,
          pending_link: pendingLinkResult.count ?? 0,
          pending_odds: pendingOddsResult.count ?? 0,
          sem_odds: semOddsResult.count ?? 0,
          sem_link: semLinkResult.count ?? 0,
          pool: poolResult.count ?? 0,
          distributed: distributedResult.count ?? 0,
        },
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

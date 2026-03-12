import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_SORT_FIELDS = new Set(['telegram_posted_at', 'kickoff_time', 'odds_at_post', 'created_at', 'bet_result']);
const VALID_SORT_DIRS = new Set(['asc', 'desc']);
const VALID_BET_RESULTS = new Set(['success', 'failure', 'unknown', 'cancelled', 'pending']);

function parsePositiveInt(rawValue: string | null, fallback: number): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const HISTORY_SELECT = `
  id, bet_market, bet_pick, odds, odds_at_post, bet_status,
  telegram_posted_at, telegram_message_id, group_id,
  historico_postagens, created_at,
  bet_result, result_reason, result_source, result_confidence, result_updated_at,
  league_matches!inner(home_team_name, away_team_name, kickoff_time, league_seasons(league_name, country)),
  groups(name)
`;

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;

    const url = new URL(req.url);

    const page = parsePositiveInt(url.searchParams.get('page'), DEFAULT_PAGE);
    const perPageRaw = parsePositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE);
    const perPage = Math.min(perPageRaw, MAX_PER_PAGE);
    const from = (page - 1) * perPage;

    const groupIdParam = url.searchParams.get('group_id')?.trim() || null;
    const sortBy = url.searchParams.get('sort_by')?.trim().toLowerCase() || 'telegram_posted_at';
    const sortDir = url.searchParams.get('sort_dir')?.trim().toLowerCase() || 'desc';

    // Filter params
    const betResultParam = url.searchParams.get('bet_result')?.trim().toLowerCase() || null;
    const championshipParam = url.searchParams.get('championship')?.trim() || null;
    const marketParam = url.searchParams.get('market')?.trim() || null;
    const dateFromParam = url.searchParams.get('date_from')?.trim() || null;
    const dateToParam = url.searchParams.get('date_to')?.trim() || null;

    // Validate
    if (!groupFilter && groupIdParam && !UUID_PATTERN.test(groupIdParam)) {
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
    if (betResultParam && !VALID_BET_RESULTS.has(betResultParam)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Filtro de resultado invalido' } },
        { status: 400 },
      );
    }

    // Build query: only bets that were actually posted
    let query = supabase
      .from('suggested_bets')
      .select(HISTORY_SELECT, { count: 'exact' })
      .not('group_id', 'is', null)
      .eq('bet_status', 'posted');

    // Multi-tenant filter
    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    } else if (groupIdParam) {
      query = query.eq('group_id', groupIdParam);
    }

    // Result filter
    if (betResultParam === 'pending') {
      query = query.is('bet_result', null);
    } else if (betResultParam) {
      query = query.eq('bet_result', betResultParam);
    }

    // Championship filter (case-insensitive partial match via league_seasons)
    if (championshipParam) {
      query = query.ilike('league_matches.league_seasons.league_name', `%${championshipParam}%`);
    }

    // Market filter (case-insensitive partial match)
    if (marketParam) {
      query = query.ilike('bet_market', `%${marketParam}%`);
    }

    // Date range filter (on kickoff_time)
    if (dateFromParam) {
      query = query.gte('league_matches.kickoff_time', `${dateFromParam}T00:00:00Z`);
    }
    if (dateToParam) {
      query = query.lte('league_matches.kickoff_time', `${dateToParam}T23:59:59Z`);
    }

    // Sorting
    const ascending = sortDir === 'asc';
    if (sortBy === 'kickoff_time') {
      query = query.order('league_matches(kickoff_time)', { ascending });
    } else if (sortBy === 'telegram_posted_at') {
      query = query.order('telegram_posted_at', { ascending, nullsFirst: false });
    } else {
      query = query.order(sortBy, { ascending });
    }

    // Counter queries
    const tenantCol = groupFilter || groupIdParam;

    let successQuery = supabase.from('suggested_bets')
      .select('*', { count: 'exact', head: true })
      .eq('bet_result', 'success')
      .eq('bet_status', 'posted')
      .not('group_id', 'is', null);

    let failureQuery = supabase.from('suggested_bets')
      .select('*', { count: 'exact', head: true })
      .eq('bet_result', 'failure')
      .eq('bet_status', 'posted')
      .not('group_id', 'is', null);

    let postedQuery = supabase.from('suggested_bets')
      .select('*', { count: 'exact', head: true })
      .eq('bet_status', 'posted')
      .not('group_id', 'is', null);

    if (tenantCol) {
      successQuery = successQuery.eq('group_id', tenantCol);
      failureQuery = failureQuery.eq('group_id', tenantCol);
      postedQuery = postedQuery.eq('group_id', tenantCol);
    }

    const [mainResult, successResult, failureResult, postedResult] = await Promise.all([
      query.range(from, from + perPage - 1),
      successQuery,
      failureQuery,
      postedQuery,
    ]);

    if (mainResult.error || successResult.error || failureResult.error || postedResult.error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar historico de postagens' } },
        { status: 500 },
      );
    }

    const total = mainResult.count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
    const successCount = successResult.count ?? 0;
    const failureCount = failureResult.count ?? 0;
    const postedCount = postedResult.count ?? 0;
    const evaluated = successCount + failureCount;
    const hitRate = evaluated > 0 ? Math.round((successCount / evaluated) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        items: mainResult.data ?? [],
        pagination: {
          page,
          per_page: perPage,
          total,
          total_pages: totalPages,
        },
        counters: {
          total: postedCount,
          success: successCount,
          failure: failureCount,
          hit_rate: hitRate,
        },
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

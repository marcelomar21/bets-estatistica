import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_SORT_FIELDS = new Set(['telegram_posted_at', 'kickoff_time', 'odds_at_post', 'created_at']);
const VALID_SORT_DIRS = new Set(['asc', 'desc']);

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
  league_matches!inner(home_team_name, away_team_name, kickoff_time, league_seasons!inner(league_name, country)),
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

    // Build query: bets assigned to a group (posted OR ready)
    let query = supabase
      .from('suggested_bets')
      .select(HISTORY_SELECT, { count: 'exact' })
      .not('group_id', 'is', null)
      .in('bet_status', ['posted', 'ready']);

    // Multi-tenant filter
    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    } else if (groupIdParam) {
      query = query.eq('group_id', groupIdParam);
    }

    // Sorting
    const ascending = sortDir === 'asc';
    if (sortBy === 'kickoff_time') {
      query = query.order('league_matches(kickoff_time)', { ascending });
    } else if (sortBy === 'telegram_posted_at') {
      // Posted first (DESC NULLS LAST), then by kickoff_time
      query = query.order('telegram_posted_at', { ascending, nullsFirst: false });
    } else {
      query = query.order(sortBy, { ascending });
    }

    // Counter queries
    const tenantCol = groupFilter || groupIdParam;

    let postedQuery = supabase.from('suggested_bets')
      .select('*', { count: 'exact', head: true })
      .eq('bet_status', 'posted')
      .not('group_id', 'is', null);

    let pendingQuery = supabase.from('suggested_bets')
      .select('*', { count: 'exact', head: true })
      .eq('bet_status', 'ready')
      .not('group_id', 'is', null);

    if (tenantCol) {
      postedQuery = postedQuery.eq('group_id', tenantCol);
      pendingQuery = pendingQuery.eq('group_id', tenantCol);
    }

    const [mainResult, postedResult, pendingResult] = await Promise.all([
      query.range(from, from + perPage - 1),
      postedQuery,
      pendingQuery,
    ]);

    if (mainResult.error || postedResult.error || pendingResult.error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar historico de postagens' } },
        { status: 500 },
      );
    }

    const total = mainResult.count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
    const postedCount = postedResult.count ?? 0;
    const pendingCount = pendingResult.count ?? 0;

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
          total,
          posted: postedCount,
          pending: pendingCount,
          success_rate: total > 0 ? Math.round((postedCount / total) * 100) : 100,
        },
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

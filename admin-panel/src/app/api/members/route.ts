import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SIMPLE_STATUS_FILTERS = new Set(['trial', 'ativo', 'inadimplente', 'removido', 'cancelado']);
const VALID_CHANNELS = new Set(['telegram', 'whatsapp']);

function parsePositiveInt(rawValue: string | null, fallback: number): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function dbErrorResponse() {
  return NextResponse.json(
    { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar membros' } },
    { status: 500 },
  );
}

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, role, groupFilter } = context;

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status')?.trim().toLowerCase() ?? 'todos';
    const search = url.searchParams.get('search')?.trim() ?? '';
    const groupIdParam = url.searchParams.get('group_id')?.trim() || null;
    if (!groupFilter && groupIdParam && !UUID_PATTERN.test(groupIdParam)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id invalido' } },
        { status: 400 },
      );
    }

    const channelFilter = url.searchParams.get('channel')?.trim().toLowerCase() || null;
    if (channelFilter && !VALID_CHANNELS.has(channelFilter)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Filtro de canal invalido' } },
        { status: 400 },
      );
    }

    const page = parsePositiveInt(url.searchParams.get('page'), DEFAULT_PAGE);
    const perPageRaw = parsePositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE);
    const perPage = Math.min(perPageRaw, MAX_PER_PAGE);
    const from = (page - 1) * perPage;

    const nowIso = new Date().toISOString();
    const sevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const baseCols = 'id, telegram_id, telegram_username, channel, channel_user_id, status, subscription_ends_at, created_at, group_id, is_admin';
    const cancelCols = statusFilter === 'cancelado' ? ', cancellation_reason, cancelled_by, kicked_at' : '';
    const groupCols = role === 'super_admin' ? ', groups(name)' : '';
    const select = baseCols + cancelCols + groupCols;

    let query = supabase
      .from('members')
      .select(select, { count: 'exact' });

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    } else if (groupIdParam) {
      query = query.eq('group_id', groupIdParam);
    }

    if (channelFilter) {
      query = query.eq('channel', channelFilter);
    }

    if (statusFilter !== 'todos') {
      if (statusFilter === 'vencendo') {
        query = query
          .eq('status', 'ativo')
          .gte('subscription_ends_at', nowIso)
          .lte('subscription_ends_at', sevenDaysIso);
      } else if (statusFilter === 'expirado') {
        query = query
          .eq('status', 'ativo')
          .lt('subscription_ends_at', nowIso);
      } else if (SIMPLE_STATUS_FILTERS.has(statusFilter)) {
        query = query.eq('status', statusFilter);
      } else {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Filtro de status invalido' } },
          { status: 400 },
        );
      }
    }

    if (search) {
      query = query.or(`telegram_username.ilike.%${search}%,channel_user_id.ilike.%${search}%`);
    }

    // Counter queries — run in parallel with main query for global totals
    // Exclude is_admin members from counters (admins counted separately)
    let trialQuery = supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'trial').eq('is_admin', false);
    let ativoQuery = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .eq('is_admin', false)
      .or(`subscription_ends_at.is.null,subscription_ends_at.gt.${sevenDaysIso}`);
    let vencendoQuery = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .eq('is_admin', false)
      .gte('subscription_ends_at', nowIso)
      .lte('subscription_ends_at', sevenDaysIso);
    let adminsQuery = supabase.from('members').select('*', { count: 'exact', head: true }).eq('is_admin', true);

    if (groupFilter) {
      trialQuery = trialQuery.eq('group_id', groupFilter);
      ativoQuery = ativoQuery.eq('group_id', groupFilter);
      vencendoQuery = vencendoQuery.eq('group_id', groupFilter);
      adminsQuery = adminsQuery.eq('group_id', groupFilter);
    } else if (groupIdParam) {
      trialQuery = trialQuery.eq('group_id', groupIdParam);
      ativoQuery = ativoQuery.eq('group_id', groupIdParam);
      vencendoQuery = vencendoQuery.eq('group_id', groupIdParam);
      adminsQuery = adminsQuery.eq('group_id', groupIdParam);
    }

    if (channelFilter) {
      trialQuery = trialQuery.eq('channel', channelFilter);
      ativoQuery = ativoQuery.eq('channel', channelFilter);
      vencendoQuery = vencendoQuery.eq('channel', channelFilter);
      adminsQuery = adminsQuery.eq('channel', channelFilter);
    }

    const [mainResult, trialResult, ativoResult, vencendoResult, adminsResult] = await Promise.all([
      query.order('created_at', { ascending: false }).range(from, from + perPage - 1),
      trialQuery,
      ativoQuery,
      vencendoQuery,
      adminsQuery,
    ]);

    if (mainResult.error || trialResult.error || ativoResult.error || vencendoResult.error || adminsResult.error) {
      return dbErrorResponse();
    }

    const total = mainResult.count ?? 0;
    const adminsCount = adminsResult.count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

    // Resolve cancelled_by UUIDs to emails when filtering by cancelado
    let items: unknown[] = mainResult.data ?? [];
    if (statusFilter === 'cancelado' && items.length > 0) {
      const rawItems = items as Array<Record<string, unknown>>;
      const cancelledByIds = [...new Set(
        rawItems
          .map((m) => m.cancelled_by as string | null)
          .filter((id): id is string => !!id),
      )];
      let emailMap = new Map<string, string>();
      if (cancelledByIds.length > 0) {
        const { data: admins } = await supabase
          .from('admin_users')
          .select('id, email')
          .in('id', cancelledByIds);
        emailMap = new Map((admins ?? []).map((a: { id: string; email: string }) => [a.id, a.email]));
      }
      items = rawItems.map((m) => {
        const { cancelled_by, ...rest } = m;
        return {
          ...rest,
          cancelled_by_email: emailMap.get(cancelled_by as string) ?? null,
        };
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          per_page: perPage,
          total,
          total_pages: totalPages,
        },
        counters: {
          total: total - adminsCount,
          trial: trialResult.count ?? 0,
          ativo: ativoResult.count ?? 0,
          vencendo: vencendoResult.count ?? 0,
          admins: adminsCount,
        },
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

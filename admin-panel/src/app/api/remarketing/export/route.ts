import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EXPORT_ROWS = 5000;

const VALID_SEGMENTS = new Set([
  'trial_expired',
  'trial_expiring',
  'subscription_expiring',
  'subscription_expired',
  'inadimplente',
  'cancelled_recent',
  'cancelled_old',
]);

function csvEscape(val: string): string {
  // Prevent CSV formula injection: prefix with single quote if cell starts with =, +, -, @
  const sanitized = /^[=+\-@]/.test(val) ? `'${val}` : val;
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;

    const url = new URL(req.url);
    const segment = url.searchParams.get('segment')?.trim() || null;
    const groupIdParam = url.searchParams.get('group_id')?.trim() || null;

    if (!segment || !VALID_SEGMENTS.has(segment)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Segmento invalido' } },
        { status: 400 },
      );
    }

    if (!groupFilter && groupIdParam && !UUID_PATTERN.test(groupIdParam)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id invalido' } },
        { status: 400 },
      );
    }

    const effectiveGroupId = groupFilter ?? groupIdParam;

    const nowIso = new Date().toISOString();
    const threeDaysIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const select = 'telegram_id, telegram_username, channel, channel_user_id, status, trial_ends_at, subscription_ends_at, last_payment_at, created_at, groups(name)';

    let query = supabase.from('members').select(select, { count: 'exact' });

    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    switch (segment) {
      case 'trial_expired':
        query = query.eq('status', 'trial').lt('trial_ends_at', nowIso);
        break;
      case 'trial_expiring':
        query = query.eq('status', 'trial').gte('trial_ends_at', nowIso).lte('trial_ends_at', threeDaysIso);
        break;
      case 'subscription_expiring':
        query = query.eq('status', 'ativo').gte('subscription_ends_at', nowIso).lte('subscription_ends_at', sevenDaysIso);
        break;
      case 'subscription_expired':
        query = query.eq('status', 'ativo').lt('subscription_ends_at', nowIso);
        break;
      case 'inadimplente':
        query = query.eq('status', 'inadimplente');
        break;
      case 'cancelled_recent':
        query = query.eq('status', 'cancelado').gt('kicked_at', thirtyDaysAgoIso);
        break;
      case 'cancelled_old':
        query = query.eq('status', 'cancelado').or(`kicked_at.is.null,kicked_at.lte.${thirtyDaysAgoIso}`);
        break;
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao exportar segmento' } },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    const BOM = '\uFEFF';
    const header = 'telegram_id,telegram_username,channel,channel_user_id,status,trial_ends_at,subscription_ends_at,last_payment_at,created_at,group_name';
    const csvLines = rows.map((r) => {
      const groupName = (r.groups as { name: string } | null)?.name ?? '';
      return [
        String(r.telegram_id ?? ''),
        csvEscape(String(r.telegram_username ?? '')),
        String(r.channel ?? ''),
        csvEscape(String(r.channel_user_id ?? '')),
        String(r.status ?? ''),
        String(r.trial_ends_at ?? ''),
        String(r.subscription_ends_at ?? ''),
        String(r.last_payment_at ?? ''),
        String(r.created_at ?? ''),
        csvEscape(groupName),
      ].join(',');
    });

    const csv = BOM + header + '\n' + csvLines.join('\n');
    const exceeded = count !== null && count > MAX_EXPORT_ROWS;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="remarketing-${segment}-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...(exceeded ? { 'X-Export-Truncated': 'true', 'X-Export-Total': String(count) } : {}),
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

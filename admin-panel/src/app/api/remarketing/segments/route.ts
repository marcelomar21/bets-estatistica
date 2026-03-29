import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Segment {
  key: string;
  label: string;
  description: string;
  count: number;
  membersLink: string | null;
}

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;

    const url = new URL(req.url);
    const groupIdParam = url.searchParams.get('group_id')?.trim() || null;
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

    function applyGroup<T extends { eq: (col: string, val: string) => T }>(q: T): T {
      return effectiveGroupId ? q.eq('group_id', effectiveGroupId) : q;
    }

    // 1. Trial expirado: status = 'trial' AND trial_ends_at < NOW
    let trialExpiredQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'trial').lt('trial_ends_at', nowIso);
    trialExpiredQ = applyGroup(trialExpiredQ);

    // 2. Trial expirando (3d): status = 'trial' AND trial_ends_at BETWEEN NOW AND NOW+3d
    let trialExpiringQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'trial').gte('trial_ends_at', nowIso).lte('trial_ends_at', threeDaysIso);
    trialExpiringQ = applyGroup(trialExpiringQ);

    // 3. Assinatura vencendo (7d): status = 'ativo' AND subscription_ends_at BETWEEN NOW AND NOW+7d
    let subExpiringQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'ativo').gte('subscription_ends_at', nowIso).lte('subscription_ends_at', sevenDaysIso);
    subExpiringQ = applyGroup(subExpiringQ);

    // 4. Assinatura expirada: status = 'ativo' AND subscription_ends_at < NOW
    let subExpiredQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'ativo').lt('subscription_ends_at', nowIso);
    subExpiredQ = applyGroup(subExpiredQ);

    // 5. Inadimplentes: status = 'inadimplente'
    let inadimplenteQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'inadimplente');
    inadimplenteQ = applyGroup(inadimplenteQ);

    // 6. Cancelados recentes (30d): status = 'cancelado' AND kicked_at > NOW-30d
    let cancelledRecentQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'cancelado').gt('kicked_at', thirtyDaysAgoIso);
    cancelledRecentQ = applyGroup(cancelledRecentQ);

    // 7. Cancelados antigos (30d+): status = 'cancelado' AND (kicked_at IS NULL OR kicked_at <= NOW-30d)
    let cancelledOldQ = supabase.from('members').select('*', { count: 'exact', head: true })
      .eq('status', 'cancelado').or(`kicked_at.is.null,kicked_at.lte.${thirtyDaysAgoIso}`);
    cancelledOldQ = applyGroup(cancelledOldQ);

    const [
      trialExpiredR,
      trialExpiringR,
      subExpiringR,
      subExpiredR,
      inadimplenteR,
      cancelledRecentR,
      cancelledOldR,
    ] = await Promise.all([
      trialExpiredQ,
      trialExpiringQ,
      subExpiringQ,
      subExpiredQ,
      inadimplenteQ,
      cancelledRecentQ,
      cancelledOldQ,
    ]);

    const anyError = [
      trialExpiredR, trialExpiringR, subExpiringR, subExpiredR,
      inadimplenteR, cancelledRecentR, cancelledOldR,
    ].find((r) => r.error);

    if (anyError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar segmentos' } },
        { status: 500 },
      );
    }

    const segments: Segment[] = [
      {
        key: 'trial_expired',
        label: 'Trial expirado',
        description: 'Oferta de conversao',
        count: trialExpiredR.count ?? 0,
        membersLink: null,
      },
      {
        key: 'trial_expiring',
        label: 'Trial expirando (3d)',
        description: 'Lembrete urgente',
        count: trialExpiringR.count ?? 0,
        membersLink: null,
      },
      {
        key: 'subscription_expiring',
        label: 'Assinatura vencendo (7d)',
        description: 'Renovacao antecipada',
        count: subExpiringR.count ?? 0,
        membersLink: null,
      },
      {
        key: 'subscription_expired',
        label: 'Assinatura expirada',
        description: 'Reativacao',
        count: subExpiredR.count ?? 0,
        membersLink: null,
      },
      {
        key: 'inadimplente',
        label: 'Inadimplentes',
        description: 'Recuperacao de pagamento',
        count: inadimplenteR.count ?? 0,
        membersLink: null,
      },
      {
        key: 'cancelled_recent',
        label: 'Cancelados recentes (30d)',
        description: 'Win-back rapido',
        count: cancelledRecentR.count ?? 0,
        membersLink: null,
      },
      {
        key: 'cancelled_old',
        label: 'Cancelados antigos',
        description: 'Win-back frio',
        count: cancelledOldR.count ?? 0,
        membersLink: null,
      },
    ];

    return NextResponse.json({ success: true, data: { segments } });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

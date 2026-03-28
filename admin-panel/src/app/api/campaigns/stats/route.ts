import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

const VALID_PERIODS = new Set(['7d', '30d', '90d', 'all']);

const PERIOD_DAYS: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  'all': null,
};

export const GET = createApiHandler(async (req: NextRequest, context) => {
  const { supabase, groupFilter } = context;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || '30d';

  if (!VALID_PERIODS.has(period)) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid period. Valid values: 7d, 30d, 90d, all' } },
      { status: 400 },
    );
  }

  const days = PERIOD_DAYS[period];
  const sinceDate = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Fetch affiliate stats using the database function
  const { data: affiliates, error: affiliatesError } = await supabase.rpc(
    'get_affiliate_stats',
    {
      p_group_id: groupFilter ?? null,
      p_since: sinceDate,
    },
  );

  if (affiliatesError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: affiliatesError.message } },
      { status: 500 },
    );
  }

  const affiliateRows = (affiliates ?? []) as Array<{
    code: string;
    clicks: number;
    unique_members: number;
    trials: number;
    active_members: number;
    cancelled: number;
    last_click_at: string;
  }>;

  // Compute summary from the affiliate rows
  const totalClicks = affiliateRows.reduce((sum, a) => sum + Number(a.clicks), 0);
  const totalMembers = affiliateRows.reduce((sum, a) => sum + Number(a.unique_members), 0);
  const totalActive = affiliateRows.reduce((sum, a) => sum + Number(a.active_members), 0);
  const globalConversionRate = totalMembers > 0
    ? Math.round((totalActive / totalMembers) * 1000) / 10
    : 0;

  // Count active affiliates (those with a click in last 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const activeAffiliates = affiliateRows.filter(
    (a) => a.last_click_at && new Date(a.last_click_at) >= fourteenDaysAgo,
  ).length;

  const data = {
    summary: {
      totalAffiliates: affiliateRows.length,
      activeAffiliates,
      totalClicks,
      globalConversionRate,
    },
    affiliates: affiliateRows.map((a) => ({
      code: a.code,
      clicks: Number(a.clicks),
      uniqueMembers: Number(a.unique_members),
      trials: Number(a.trials),
      active: Number(a.active_members),
      cancelled: Number(a.cancelled),
      conversionRate:
        Number(a.unique_members) > 0
          ? Math.round((Number(a.active_members) / Number(a.unique_members)) * 1000) / 10
          : 0,
      lastClickAt: a.last_click_at,
    })),
  };

  return NextResponse.json({ success: true, data });
});

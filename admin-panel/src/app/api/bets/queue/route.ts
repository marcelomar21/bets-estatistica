import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { fetchPairStats, enrichWithHitRate } from '@/lib/pair-stats';

/**
 * GET /api/bets/queue
 * Story 5.5: Returns posting queue status for the admin's group
 *
 * Response:
 * - readyCount: bets ready to post
 * - pendingLinkCount: bets missing deep_link
 * - pendingOddsCount: bets missing odds
 * - nextPostTime: calculated from group's posting_schedule
 * - postingSchedule: { enabled, times } from group config
 */
export const GET = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

    // Determine group ID: group_admin uses their own, super_admin can filter
    const url = new URL(req.url);
    const queryGroupId = url.searchParams.get('group_id');
    const effectiveGroupId = groupFilter || queryGroupId;

    if (!effectiveGroupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id is required for super_admin' } },
        { status: 400 },
      );
    }

    // Fetch group's posting schedule
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('posting_schedule')
      .eq('id', effectiveGroupId)
      .single();

    if (groupError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: groupError.message } },
        { status: 500 },
      );
    }

    const postingSchedule = group?.posting_schedule || { enabled: true, times: ['10:00', '15:00', '22:00'] };

    // Query bets in active posting states for this group (include league_seasons for hit_rate)
    const [betsResult, pairStats] = await Promise.all([
      supabase
        .from('suggested_bets')
        .select(`
          id,
          bet_status,
          bet_market,
          bet_pick,
          odds,
          deep_link,
          league_matches!inner (
            home_team_name,
            away_team_name,
            kickoff_time,
            league_seasons!inner (league_name, country)
          )
        `)
        .eq('group_id', effectiveGroupId)
        .eq('elegibilidade', 'elegivel')
        .in('bet_status', ['generated', 'pending_link', 'pending_odds', 'ready'])
        .gt('league_matches.kickoff_time', new Date().toISOString())
        .order('league_matches(kickoff_time)', { ascending: true }),
      fetchPairStats(supabase),
    ]);

    if (betsResult.error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: betsResult.error.message } },
        { status: 500 },
      );
    }

    const queueBets = betsResult.data || [];
    const readyCount = queueBets.filter(b => b.bet_status === 'ready').length;
    const pendingLinkCount = queueBets.filter(b => b.bet_status === 'pending_link').length;
    const pendingOddsCount = queueBets.filter(b => b.bet_status === 'pending_odds' || b.bet_status === 'generated').length;

    // Calculate next post time from posting_schedule.times
    const nextPostTime = calcNextPostTime(postingSchedule.times);

    return NextResponse.json({
      success: true,
      data: {
        readyCount,
        pendingLinkCount,
        pendingOddsCount,
        totalQueue: queueBets.length,
        nextPostTime,
        postingSchedule,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bets: queueBets.map((b: any) => ({
          id: b.id,
          bet_market: b.bet_market,
          bet_pick: b.bet_pick,
          bet_status: b.bet_status,
          odds: b.odds,
          has_link: !!b.deep_link,
          deep_link: b.deep_link,
          hit_rate: enrichWithHitRate(b, pairStats),
          match: {
            home_team_name: b.league_matches.home_team_name,
            away_team_name: b.league_matches.away_team_name,
            kickoff_time: b.league_matches.kickoff_time,
          },
        })),
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

function calcNextPostTime(times: string[]): { time: string; diff: string } {
  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const parsed = times
    .map(t => {
      const [h, m] = t.split(':').map(Number);
      return { hours: h, minutes: m, total: h * 60 + m };
    })
    .sort((a, b) => a.total - b.total);

  for (const pt of parsed) {
    if (pt.total > currentMin) {
      const diffMin = pt.total - currentMin;
      const timeStr = `${String(pt.hours).padStart(2, '0')}:${String(pt.minutes).padStart(2, '0')}`;
      if (diffMin < 60) return { time: timeStr, diff: `${diffMin}min` };
      return { time: timeStr, diff: `${Math.floor(diffMin / 60)}h` };
    }
  }

  const first = parsed[0];
  const firstStr = `${String(first.hours).padStart(2, '0')}:${String(first.minutes).padStart(2, '0')}`;
  const diffMin = (24 * 60 - currentMin) + first.total;
  return { time: `${firstStr} (amanha)`, diff: `${Math.floor(diffMin / 60)}h` };
}

import type { SupabaseClient } from '@supabase/supabase-js';

interface PostingSchedule {
  enabled?: boolean;
  times?: string[];
}

interface PickPostTimeContext {
  availableTimes: string[];
  timeCounts: Record<string, number>;
}

/**
 * Build context for pickPostTime: computes available time slots and current counts.
 * Queries bet_group_assignments (source of truth) for already-scheduled bets.
 */
export async function buildPostTimeContext(
  supabase: SupabaseClient,
  groupId: string,
  schedule: PostingSchedule | null,
): Promise<PickPostTimeContext> {
  if (!schedule?.times || schedule.times.length === 0) {
    return { availableTimes: [], timeCounts: {} };
  }

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

  const timeCounts: Record<string, number> = {};
  for (const t of availableTimes) timeCounts[t] = 0;

  // Query bet_group_assignments (new source of truth) instead of suggested_bets
  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .not('post_at', 'is', null)
    .neq('posting_status', 'posted');

  for (const s of (scheduled || [])) {
    if (s.post_at && timeCounts[s.post_at] !== undefined) timeCounts[s.post_at]++;
  }

  return { availableTimes, timeCounts };
}

/**
 * Pick the time slot with fewest scheduled bets. Increments the counter after selection
 * so consecutive calls spread bets evenly.
 */
export function pickPostTime(ctx: PickPostTimeContext): string | null {
  if (ctx.availableTimes.length === 0) return null;

  let minTime = ctx.availableTimes[0];
  let minCount = ctx.timeCounts[minTime] ?? 0;

  for (const t of ctx.availableTimes) {
    if ((ctx.timeCounts[t] ?? 0) < minCount) {
      minTime = t;
      minCount = ctx.timeCounts[t] ?? 0;
    }
  }

  ctx.timeCounts[minTime] = (ctx.timeCounts[minTime] ?? 0) + 1;
  return minTime;
}

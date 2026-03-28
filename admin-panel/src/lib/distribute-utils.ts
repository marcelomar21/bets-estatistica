import type { SupabaseClient } from '@supabase/supabase-js';

interface PostingSchedule {
  enabled?: boolean;
  times?: string[];
}

/**
 * Pick the posting time slot with the fewest scheduled bets.
 * Mutates `timeCounts` to increment the chosen slot's count (for batched calls).
 */
export function pickPostTime(
  availableTimes: string[],
  timeCounts: Record<string, number>,
): string | null {
  if (availableTimes.length === 0) return null;

  let minTime = availableTimes[0];
  let minCount = timeCounts[minTime] ?? 0;

  for (const t of availableTimes) {
    const count = timeCounts[t] ?? 0;
    if (count < minCount) {
      minTime = t;
      minCount = count;
    }
  }

  timeCounts[minTime] = (timeCounts[minTime] ?? 0) + 1;
  return minTime;
}

/**
 * Get future posting times for a group based on its schedule.
 * Falls back to all schedule times if none are in the future.
 */
export function getFuturePostingTimes(schedule: PostingSchedule | null): string[] {
  if (!schedule?.times || schedule.times.length === 0) return [];

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });

  return futureTimes.length > 0 ? futureTimes : schedule.times;
}

/**
 * Build a map of time-slot -> count of already-scheduled bets for a group.
 * Queries `bet_group_assignments` (source of truth for multi-group).
 */
export async function getScheduledCountsPerTime(
  supabase: SupabaseClient,
  groupId: string,
  availableTimes: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of availableTimes) counts[t] = 0;

  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .eq('posting_status', 'ready')
    .not('post_at', 'is', null);

  for (const s of (scheduled || [])) {
    if (s.post_at && counts[s.post_at] !== undefined) counts[s.post_at]++;
  }

  return counts;
}

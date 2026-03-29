import type { SupabaseClient } from '@supabase/supabase-js';

interface PostingSchedule {
  enabled?: boolean;
  times?: string[];
}

/**
 * Pick the best post_at time for a group based on its posting_schedule.
 * Selects the future time slot with the fewest already-scheduled bets (load-balancing).
 * Counts from bet_group_assignments (source of truth for multi-group).
 */
export async function pickPostTime(
  supabase: SupabaseClient,
  groupId: string,
  schedule: PostingSchedule | null,
): Promise<string | null> {
  if (!schedule?.times || schedule.times.length === 0) return null;

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

  // Count already-scheduled assignments per time slot (bet_group_assignments is source of truth)
  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .eq('posting_status', 'ready');

  const counts: Record<string, number> = {};
  for (const t of availableTimes) counts[t] = 0;
  for (const s of scheduled || []) {
    if (s.post_at && counts[s.post_at] !== undefined) counts[s.post_at]++;
  }

  let minTime = availableTimes[0];
  let minCount = counts[minTime] ?? 0;
  for (const t of availableTimes) {
    if ((counts[t] ?? 0) < minCount) {
      minTime = t;
      minCount = counts[t] ?? 0;
    }
  }

  return minTime;
}

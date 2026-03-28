import type { SupabaseClient } from '@supabase/supabase-js';

type PostingSchedule = { enabled?: boolean; times?: string[] } | null;

/**
 * Pick the posting time slot with the fewest already-scheduled bets for a group.
 * Uses bet_group_assignments as the source of truth for scheduled counts.
 *
 * Returns the chosen time string (e.g. "14:30") or null if no schedule configured.
 */
export async function pickPostTime(
  supabase: SupabaseClient,
  groupId: string,
  schedule: PostingSchedule,
): Promise<string | null> {
  if (!schedule?.times || schedule.times.length === 0) return null;

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

  // Count already-scheduled bets per time slot from bet_group_assignments
  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .eq('posting_status', 'ready')
    .not('post_at', 'is', null);

  const counts: Record<string, number> = {};
  for (const t of availableTimes) counts[t] = 0;
  for (const s of scheduled || []) {
    if (s.post_at && counts[s.post_at] !== undefined) counts[s.post_at]++;
  }

  // Pick time with fewest bets
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

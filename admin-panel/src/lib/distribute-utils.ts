import type { SupabaseClient } from '@supabase/supabase-js';

interface PostingSchedule {
  enabled?: boolean;
  times?: string[];
}

/**
 * Build a time-slot picker that load-balances bets across available posting times.
 * Queries bet_group_assignments (source of truth) for existing counts,
 * then returns a `pick()` function that selects the least-loaded slot
 * and increments the local counter to stay balanced within a batch.
 */
export async function buildPostTimePicker(
  supabase: SupabaseClient,
  groupId: string,
  schedule: PostingSchedule | null,
): Promise<{ pick: () => string | null }> {
  if (!schedule?.times || schedule.times.length === 0) {
    return { pick: () => null };
  }

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

  // Count already-scheduled assignments per time slot (new source of truth)
  const counts: Record<string, number> = {};
  for (const t of availableTimes) counts[t] = 0;

  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .not('post_at', 'is', null)
    .neq('posting_status', 'posted');

  for (const s of scheduled || []) {
    if (s.post_at && counts[s.post_at] !== undefined) counts[s.post_at]++;
  }

  return {
    pick(): string | null {
      if (availableTimes.length === 0) return null;
      let minTime = availableTimes[0];
      let minCount = counts[minTime] ?? 0;
      for (const t of availableTimes) {
        if ((counts[t] ?? 0) < minCount) {
          minTime = t;
          minCount = counts[t] ?? 0;
        }
      }
      counts[minTime] = (counts[minTime] ?? 0) + 1;
      return minTime;
    },
  };
}

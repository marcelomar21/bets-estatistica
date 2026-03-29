import type { SupabaseClient } from '@supabase/supabase-js';

type PostingSchedule = { enabled?: boolean; times?: string[] } | null;

/**
 * Build a context map of { timeSlot -> betCount } for a group's posting schedule.
 * Queries bet_group_assignments (source of truth) instead of suggested_bets.
 * Only future time slots are returned (falls back to all slots if none are in the future).
 */
export async function buildPostTimeContext(
  supabase: SupabaseClient,
  groupId: string,
  schedule: PostingSchedule,
): Promise<Record<string, number>> {
  const times = schedule?.times;
  if (!times || times.length === 0) return {};

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : times;

  // Count already-scheduled bets per time slot from bet_group_assignments (source of truth)
  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .not('post_at', 'is', null)
    .neq('posting_status', 'posted');

  const counts: Record<string, number> = {};
  for (const t of availableTimes) counts[t] = 0;
  for (const s of (scheduled || [])) {
    if (s.post_at && counts[s.post_at] !== undefined) counts[s.post_at]++;
  }

  return counts;
}

/**
 * Pick the time slot with the fewest already-scheduled bets.
 * Returns null if the context is empty (no schedule configured).
 */
export function pickPostTime(
  context: Record<string, number>,
  times: string[],
): string | null {
  if (times.length === 0) return null;

  let minTime = times[0];
  let minCount = context[minTime] ?? 0;
  for (const t of times) {
    if ((context[t] ?? 0) < minCount) {
      minTime = t;
      minCount = context[t] ?? 0;
    }
  }
  return minTime;
}

import type { TenantContext } from '@/middleware/tenant';

type PostingSchedule = { enabled?: boolean; times?: string[] } | null;

/**
 * Pre-compute available posting times for a group and count already-scheduled bets.
 * Returns a pickPostTime() function that selects the least-loaded time slot.
 */
export async function createPostTimePicker(
  supabase: TenantContext['supabase'],
  groupId: string,
  schedule: PostingSchedule,
): Promise<() => string | null> {
  if (!schedule?.times || schedule.times.length === 0) {
    return () => null;
  }

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;

  const timeCounts: Record<string, number> = {};
  for (const t of availableTimes) timeCounts[t] = 0;

  // Count already-scheduled bets per time slot (from bet_group_assignments)
  const { data: scheduled } = await supabase
    .from('bet_group_assignments')
    .select('post_at')
    .eq('group_id', groupId)
    .not('post_at', 'is', null)
    .neq('posting_status', 'posted');

  for (const s of scheduled || []) {
    if (s.post_at && timeCounts[s.post_at] !== undefined) timeCounts[s.post_at]++;
  }

  return function pickPostTime(): string | null {
    let minTime = availableTimes[0];
    let minCount = timeCounts[minTime] ?? 0;
    for (const t of availableTimes) {
      if ((timeCounts[t] ?? 0) < minCount) {
        minTime = t;
        minCount = timeCounts[t] ?? 0;
      }
    }
    timeCounts[minTime] = (timeCounts[minTime] ?? 0) + 1;
    return minTime;
  };
}

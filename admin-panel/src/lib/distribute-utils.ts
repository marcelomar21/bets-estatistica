/**
 * Shared utilities for bet distribution (GURU-42, GURU-43).
 * Extracted from the individual distribute route to avoid duplication.
 */

type GroupSchedule = { enabled?: boolean; times?: string[] } | null;

interface PickPostTimeContext {
  availableTimes: string[];
  timeCounts: Record<string, number>;
}

/**
 * Build the context needed for pickPostTime: filters schedule times to future-only
 * (falls back to all times if none are in the future), and initialises slot counts
 * from existing assignments in `bet_group_assignments`.
 */
export async function buildPostTimeContext(
  supabase: { from: (table: string) => unknown },
  groupId: string,
  schedule: GroupSchedule,
): Promise<PickPostTimeContext> {
  const empty: PickPostTimeContext = { availableTimes: [], timeCounts: {} };
  if (!schedule?.times || schedule.times.length === 0) return empty;

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

  // Count already-scheduled assignments per time slot (new source of truth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = supabase.from('bet_group_assignments') as any;
  const { data: scheduled } = await query
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
 * Pick the time slot with the fewest scheduled bets.
 * Mutates `ctx.timeCounts` to reflect the new assignment.
 * Returns null if no schedule is configured.
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

  // Increment so next call picks a different slot if counts are equal
  ctx.timeCounts[minTime] = (ctx.timeCounts[minTime] ?? 0) + 1;
  return minTime;
}

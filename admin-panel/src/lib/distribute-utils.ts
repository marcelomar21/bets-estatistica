/**
 * Shared post-time scheduling logic for bet distribution.
 * Used by both individual (/api/bets/[id]/distribute) and bulk (/api/bets/bulk/distribute) routes.
 */

interface PostingSchedule {
  enabled?: boolean;
  times?: string[];
}

export interface PostTimeContext {
  availableTimes: string[];
  timeCounts: Record<string, number>;
}

/**
 * Build a PostTimeContext for a group: resolves available time slots
 * and counts already-scheduled assignments so pickPostTime can
 * round-robin across slots.
 */
export async function buildPostTimeContext(
  supabase: { from: (table: string) => unknown },
  groupId: string,
  schedule: PostingSchedule | null,
): Promise<PostTimeContext> {
  const ctx: PostTimeContext = { availableTimes: [], timeCounts: {} };

  if (!schedule?.times || schedule.times.length === 0) return ctx;

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = schedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });

  ctx.availableTimes = futureTimes.length > 0 ? futureTimes : schedule.times;
  for (const t of ctx.availableTimes) ctx.timeCounts[t] = 0;

  // Count already-scheduled assignments from junction table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = supabase.from('bet_group_assignments') as any;
  const { data: scheduled } = await query
    .select('post_at')
    .eq('group_id', groupId)
    .not('post_at', 'is', null)
    .neq('posting_status', 'posted');

  for (const s of (scheduled || [])) {
    if (s.post_at && ctx.timeCounts[s.post_at] !== undefined) {
      ctx.timeCounts[s.post_at]++;
    }
  }

  return ctx;
}

/**
 * Pick the time slot with the fewest scheduled bets (round-robin).
 * Mutates ctx.timeCounts to track the new assignment.
 */
export function pickPostTime(ctx: PostTimeContext): string | null {
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

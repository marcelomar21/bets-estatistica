/**
 * Shared utilities for bet distribution (GURU-42, GURU-43).
 */

interface ScheduledRow {
  post_at: string | null;
}

/**
 * Pick the posting time slot with fewest scheduled bets for a given group.
 *
 * @param postingSchedule - Group's posting_schedule JSON
 * @param scheduledBets  - Rows already scheduled (with post_at) for this group
 * @returns The HH:MM time string or null if no schedule configured
 */
export function pickPostTime(
  postingSchedule: { enabled?: boolean; times?: string[] } | null,
  scheduledBets: ScheduledRow[],
): string | null {
  if (!postingSchedule?.times || postingSchedule.times.length === 0) {
    return null;
  }

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = postingSchedule.times.filter((t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m > currentMin;
  });
  const availableTimes = futureTimes.length > 0 ? futureTimes : postingSchedule.times;

  // Count already-scheduled bets per time slot
  const counts: Record<string, number> = {};
  for (const t of availableTimes) counts[t] = 0;
  for (const s of scheduledBets) {
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

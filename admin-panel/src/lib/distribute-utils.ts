/**
 * Shared utilities for bet distribution across groups.
 * Used by both individual (/api/bets/[id]/distribute) and bulk (/api/bets/bulk/distribute) routes.
 */

export interface PostingSchedule {
  enabled?: boolean;
  times?: string[];
}

/**
 * Computes available posting times for a group, filtering past times (BR timezone).
 * Falls back to full schedule if no future times remain today.
 */
export function computeAvailableTimes(schedule: PostingSchedule | null): string[] {
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
 * Creates a pickPostTime function that load-balances across available time slots.
 * Each call increments the internal counter for the chosen slot.
 */
export function createPostTimePicker(
  availableTimes: string[],
  existingCounts: Record<string, number>,
): () => string | null {
  const timeCounts: Record<string, number> = {};
  for (const t of availableTimes) timeCounts[t] = existingCounts[t] ?? 0;

  return function pickPostTime(): string | null {
    if (availableTimes.length === 0) return null;
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

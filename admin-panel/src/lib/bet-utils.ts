import type { BetStatus } from '@/types/database';

export const MIN_ODDS = 1.60;

export function determineStatus(
  currentStatus: BetStatus,
  odds: number | null,
  deepLink: string | null,
  promovidaManual: boolean,
): BetStatus {
  if (currentStatus === 'posted') return 'posted';
  const hasOdds = odds != null && (odds >= MIN_ODDS || promovidaManual);
  const hasLink = !!deepLink;
  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}

export function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 2048) return false;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function normalizeLink(link: string | null | undefined): string | null {
  if (link == null) return null;
  const trimmed = link.trim();
  return trimmed.length === 0 ? null : trimmed;
}

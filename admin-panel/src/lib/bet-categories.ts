/**
 * Categorize bet market into aggregate category.
 * Categories: Gols, Escanteios, Cartões, BTTS, Outros
 *
 * IMPORTANT: This is a TypeScript port of bot/services/metricsService.js:categorizeMarket()
 * Keep both in sync.
 */
export function categorizeMarket(market: string): string {
  const m = (market || '').toLowerCase();
  if (m.includes('escanteio') || m.includes('corner')) return 'Escanteios';
  if (m.includes('cartõ') || m.includes('cartao') || m.includes('cartoe') || m.includes('card')) return 'Cartões';
  if (m.includes('ambas') || m.includes('btts')) return 'BTTS';
  if (m.includes('gol') || m.includes('goal')) return 'Gols';
  return 'Outros';
}

export type MarketCategory = 'Gols' | 'Escanteios' | 'Cartões' | 'BTTS' | 'Outros';

export const CATEGORY_STYLES: Record<string, string> = {
  'Gols': 'bg-blue-100 text-blue-800',
  'Escanteios': 'bg-purple-100 text-purple-800',
  'Cartões': 'bg-yellow-100 text-yellow-800',
  'BTTS': 'bg-green-100 text-green-800',
  'Outros': 'bg-gray-100 text-gray-700',
};

export interface HitRate {
  rate: number;
  wins: number;
  total: number;
}

/**
 * Format pick display combining bet_market and bet_pick.
 * If they are identical, show only bet_pick to avoid duplication.
 */
export function formatPickDisplay(betMarket: string, betPick: string): string {
  if (!betMarket || !betPick) return betPick || betMarket || '-';
  if (betMarket.trim().toLowerCase() === betPick.trim().toLowerCase()) return betPick;
  return `${betMarket} - ${betPick}`;
}

import { categorizeMarket } from '@/lib/bet-categories';

const MIN_PAIR_STATS_BETS = 3;

export interface PairStatsEntry {
  rate: number;
  wins: number;
  total: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchPairStats(supabase: any): Promise<Record<string, PairStatsEntry>> {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      bet_market,
      bet_result,
      league_matches!inner (
        league_seasons!inner (league_name, country)
      )
    `)
    .in('bet_result', ['success', 'failure']);

  if (error || !data) return {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pairs: Record<string, { wins: number; total: number }> = {};
  for (const bet of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueInfo = (bet as any).league_matches?.league_seasons;
    if (!leagueInfo?.country || !leagueInfo?.league_name) continue;

    const league = `${leagueInfo.country} - ${leagueInfo.league_name}`;
    const category = categorizeMarket(bet.bet_market);
    const key = `${league}|${category}`;

    if (!pairs[key]) pairs[key] = { wins: 0, total: 0 };
    pairs[key].total++;
    if (bet.bet_result === 'success') pairs[key].wins++;
  }

  const stats: Record<string, PairStatsEntry> = {};
  for (const [key, v] of Object.entries(pairs)) {
    if (v.total >= MIN_PAIR_STATS_BETS) {
      stats[key] = {
        rate: (v.wins / v.total) * 100,
        wins: v.wins,
        total: v.total,
      };
    }
  }
  return stats;
}

export function enrichWithHitRate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  pairStats: Record<string, PairStatsEntry>,
): PairStatsEntry | null {
  const leagueInfo = item.league_matches?.league_seasons;
  if (!leagueInfo?.country || !leagueInfo?.league_name) return null;

  const league = `${leagueInfo.country} - ${leagueInfo.league_name}`;
  const category = categorizeMarket(item.bet_market);
  const key = `${league}|${category}`;
  return pairStats[key] || null;
}

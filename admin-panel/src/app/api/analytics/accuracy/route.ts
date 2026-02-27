import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { categorizeMarket } from '@/lib/bet-categories';

const MIN_BETS_DISPLAY = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RawBet {
  bet_market: string;
  bet_result: string;
  bet_status: string;
  result_updated_at: string | null;
  group_id: string | null;
  league_matches: {
    league_seasons: {
      league_name: string;
      country: string;
    } | null;
  } | null;
  groups: { name: string } | null;
}

interface AccuracyBucket {
  wins: number;
  losses: number;
  total: number;
}

function calcRate(bucket: AccuracyBucket) {
  return bucket.total === 0 ? 0 : Math.round((bucket.wins / bucket.total) * 1000) / 10;
}

/**
 * GET /api/analytics/accuracy
 * Returns hit rate analytics with multiple breakdowns and filters.
 */
export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, role, groupFilter } = context;

    const url = new URL(req.url);
    const groupIdParam = url.searchParams.get('group_id')?.trim() || null;
    const marketParam = url.searchParams.get('market')?.trim() || null;
    const championshipParam = url.searchParams.get('championship')?.trim() || null;
    const dateFrom = url.searchParams.get('date_from')?.trim() || null;
    const dateTo = url.searchParams.get('date_to')?.trim() || null;

    // Build query: fetch all bets with resolved results (regardless of posting status)
    let query = supabase
      .from('suggested_bets')
      .select(`
        bet_market,
        bet_result,
        bet_status,
        result_updated_at,
        group_id,
        league_matches(league_seasons(league_name, country)),
        groups(name)
      `)
      .in('bet_result', ['success', 'failure']);

    // Validate group_id param if provided
    if (groupIdParam && !UUID_PATTERN.test(groupIdParam)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_PARAM', message: 'group_id inválido' } },
        { status: 400 },
      );
    }

    // RLS: group admin can only see own group
    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    } else if (groupIdParam) {
      query = query.eq('group_id', groupIdParam);
    }

    // Date filters on result_updated_at
    if (dateFrom) {
      query = query.gte('result_updated_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('result_updated_at', `${dateTo}T23:59:59`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao consultar analytics' } },
        { status: 500 },
      );
    }

    const bets = (data ?? []) as unknown as RawBet[];

    // Filter by market category if requested
    const filteredBets = marketParam
      ? bets.filter((b) => categorizeMarket(b.bet_market) === marketParam)
      : bets;

    // Filter by championship if requested
    const finalBets = championshipParam
      ? filteredBets.filter((b) => b.league_matches?.league_seasons?.league_name === championshipParam)
      : filteredBets;

    // === Aggregations ===
    const now = Date.now();
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    const total: AccuracyBucket = { wins: 0, losses: 0, total: 0 };
    const postedOnly: AccuracyBucket = { wins: 0, losses: 0, total: 0 };
    const notPosted: AccuracyBucket = { wins: 0, losses: 0, total: 0 };
    const last7d: AccuracyBucket = { wins: 0, losses: 0, total: 0 };
    const last30d: AccuracyBucket = { wins: 0, losses: 0, total: 0 };

    const groupBuckets = new Map<string, AccuracyBucket & { group_name: string }>();
    const marketBuckets = new Map<string, AccuracyBucket & { market: string }>();
    const champBuckets = new Map<string, AccuracyBucket & { league_name: string; country: string }>();

    for (const bet of finalBets) {
      const isWin = bet.bet_result === 'success';
      const isPosted = bet.bet_status === 'posted';
      total.total++;
      if (isWin) total.wins++;
      else total.losses++;

      // Posted / not-posted buckets
      const statusBucket = isPosted ? postedOnly : notPosted;
      statusBucket.total++;
      if (isWin) statusBucket.wins++;
      else statusBucket.losses++;

      // Period buckets
      if (bet.result_updated_at) {
        const updatedAt = new Date(bet.result_updated_at).getTime();
        const age = now - updatedAt;
        if (age <= ms7d) {
          last7d.total++;
          if (isWin) last7d.wins++;
          else last7d.losses++;
        }
        if (age <= ms30d) {
          last30d.total++;
          if (isWin) last30d.wins++;
          else last30d.losses++;
        }
      }

      // Group buckets
      if (bet.group_id) {
        if (!groupBuckets.has(bet.group_id)) {
          groupBuckets.set(bet.group_id, {
            group_name: bet.groups?.name ?? 'Desconhecido',
            wins: 0, losses: 0, total: 0,
          });
        }
        const gb = groupBuckets.get(bet.group_id)!;
        gb.total++;
        if (isWin) gb.wins++;
        else gb.losses++;
      }

      // Market buckets
      const category = categorizeMarket(bet.bet_market);
      if (!marketBuckets.has(category)) {
        marketBuckets.set(category, { market: category, wins: 0, losses: 0, total: 0 });
      }
      const mb = marketBuckets.get(category)!;
      mb.total++;
      if (isWin) mb.wins++;
      else mb.losses++;

      // Championship buckets
      const leagueInfo = bet.league_matches?.league_seasons;
      if (leagueInfo?.league_name) {
        const champKey = `${leagueInfo.country}|${leagueInfo.league_name}`;
        if (!champBuckets.has(champKey)) {
          champBuckets.set(champKey, {
            league_name: leagueInfo.league_name,
            country: leagueInfo.country,
            wins: 0, losses: 0, total: 0,
          });
        }
        const cb = champBuckets.get(champKey)!;
        cb.total++;
        if (isWin) cb.wins++;
        else cb.losses++;
      }
    }

    // Build response arrays (filtered by min bets threshold)
    const byGroup = role === 'super_admin'
      ? [...groupBuckets.entries()]
          .filter(([, v]) => v.total >= MIN_BETS_DISPLAY)
          .map(([group_id, v]) => ({
            group_id,
            group_name: v.group_name,
            rate: calcRate(v),
            wins: v.wins,
            losses: v.losses,
            total: v.total,
          }))
          .sort((a, b) => b.rate - a.rate)
      : [];

    const byMarket = [...marketBuckets.values()]
      .filter((v) => v.total >= MIN_BETS_DISPLAY)
      .map((v) => ({
        market: v.market,
        category: v.market,
        rate: calcRate(v),
        wins: v.wins,
        losses: v.losses,
        total: v.total,
      }))
      .sort((a, b) => b.rate - a.rate);

    const byChampionship = [...champBuckets.values()]
      .filter((v) => v.total >= MIN_BETS_DISPLAY)
      .map((v) => ({
        league_name: v.league_name,
        country: v.country,
        rate: calcRate(v),
        wins: v.wins,
        losses: v.losses,
        total: v.total,
      }))
      .sort((a, b) => b.rate - a.rate);

    return NextResponse.json({
      success: true,
      data: {
        total: {
          rate: calcRate(total),
          wins: total.wins,
          losses: total.losses,
          total: total.total,
        },
        postedOnly: {
          rate: calcRate(postedOnly),
          wins: postedOnly.wins,
          losses: postedOnly.losses,
          total: postedOnly.total,
        },
        notPosted: {
          rate: calcRate(notPosted),
          wins: notPosted.wins,
          losses: notPosted.losses,
          total: notPosted.total,
        },
        byGroup,
        byMarket,
        byChampionship,
        periods: {
          last7d: { rate: calcRate(last7d), wins: last7d.wins, total: last7d.total },
          last30d: { rate: calcRate(last30d), wins: last30d.wins, total: last30d.total },
          allTime: { rate: calcRate(total), wins: total.wins, total: total.total },
        },
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

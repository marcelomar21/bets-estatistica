/**
 * Audit job for bet results (runs as scheduled cron or CLI).
 *
 * 1. Re-evaluates bets with deterministic results using the CURRENT code.
 * 2. Finds pending bets with completed matches and evaluates them deterministically.
 * 3. Rescues unknown bets whose matches now have raw_match data (deterministic + LLM).
 * 4. Updates incorrect/missing results in the database.
 */
const { supabase } = require('../../lib/supabase');
const { evaluateDeterministic, extractMatchData, evaluateBetsWithLLM } = require('../services/resultEvaluator');
const logger = require('../../lib/logger');

const COMPLETED_STATUSES = ['complete', 'finished', 'ft', 'aet', 'pen'];
const PENDING_BET_STATUSES = ['posted', 'ready', 'generated', 'pending_link', 'pending_odds'];
const PAGE_SIZE = 1000;

async function fetchAll(buildQuery) {
  let allData = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const query = buildQuery().range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase query error: ${error.message}`);
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    hasMore = data.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return allData;
}

async function getMatchData(matchCache, matchId) {
  if (matchCache.has(matchId)) return matchCache.get(matchId);

  const { data, error } = await supabase
    .from('league_matches')
    .select('match_id, home_team_name, away_team_name, status, raw_match')
    .eq('match_id', matchId)
    .single();

  if (error || !data) {
    matchCache.set(matchId, null);
    return null;
  }
  matchCache.set(matchId, data);
  return data;
}

async function auditDeterministicResults(matchCache) {
  const bets = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select('id, match_id, bet_market, bet_pick, bet_result, result_reason')
      .ilike('result_reason', '%deterministic%')
      .in('bet_result', ['success', 'failure', 'unknown'])
  );

  if (bets.length === 0) return { checked: 0, discrepancies: 0, fixed: 0 };

  let discrepancies = 0;
  let fixedCount = 0;

  for (const bet of bets) {
    const match = await getMatchData(matchCache, bet.match_id);
    if (!match || !match.raw_match) continue;

    const matchData = extractMatchData(match.raw_match);
    const reEval = evaluateDeterministic(
      { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
      matchData,
      match.home_team_name,
      match.away_team_name,
    );

    if (!reEval || reEval.result === bet.bet_result) continue;

    discrepancies++;
    const { error } = await supabase
      .from('suggested_bets')
      .update({
        bet_result: reEval.result,
        result_reason: `[audit-fix] ${reEval.reason}`,
        result_updated_at: new Date().toISOString(),
      })
      .eq('id', bet.id);

    if (!error) fixedCount++;
    else logger.warn('[audit] Error fixing bet', { betId: bet.id, error: error.message });
  }

  return { checked: bets.length, discrepancies, fixed: fixedCount };
}

async function evaluatePendingBets(matchCache) {
  const allPending = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select(`
        id, match_id, bet_market, bet_pick, bet_status,
        league_matches!inner (status)
      `)
      .eq('bet_result', 'pending')
      .in('bet_status', PENDING_BET_STATUSES)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  );

  const bets = allPending.filter(b =>
    b.league_matches && COMPLETED_STATUSES.includes(b.league_matches.status?.toLowerCase())
  );

  if (bets.length === 0) return { found: 0, evaluated: 0, needsLlm: 0, fixed: 0, successCount: 0, failureCount: 0 };

  let evaluatedCount = 0;
  let fixedCount = 0;
  let needsLlmCount = 0;
  let successCount = 0;
  let failureCount = 0;

  for (const bet of bets) {
    const match = await getMatchData(matchCache, bet.match_id);
    if (!match || !match.raw_match) continue;

    const matchData = extractMatchData(match.raw_match);
    const evalResult = evaluateDeterministic(
      { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
      matchData,
      match.home_team_name,
      match.away_team_name,
    );

    if (!evalResult) {
      needsLlmCount++;
      continue;
    }

    evaluatedCount++;
    if (evalResult.result === 'success') successCount++;
    else if (evalResult.result === 'failure') failureCount++;

    const { error } = await supabase
      .from('suggested_bets')
      .update({
        bet_result: evalResult.result,
        result_reason: `[audit-eval] ${evalResult.reason}`,
        result_updated_at: new Date().toISOString(),
      })
      .eq('id', bet.id);

    if (!error) fixedCount++;
    else logger.warn('[audit] Error updating bet', { betId: bet.id, error: error.message });
  }

  return { found: bets.length, evaluated: evaluatedCount, needsLlm: needsLlmCount, fixed: fixedCount, successCount, failureCount };
}

/**
 * Rescue unknown bets whose matches now have raw_match data.
 * Uses deterministic evaluation first, then LLM for complex markets.
 */
async function rescueUnknownBets(matchCache) {
  const allUnknown = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select(`
        id, match_id, bet_market, bet_pick, bet_status,
        league_matches!inner (status)
      `)
      .eq('bet_result', 'unknown')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  );

  const bets = allUnknown.filter(b =>
    b.league_matches && COMPLETED_STATUSES.includes(b.league_matches.status?.toLowerCase())
  );

  if (bets.length === 0) return { found: 0, deterministic: 0, llm: 0, fixed: 0, successCount: 0, failureCount: 0, stillUnknown: 0 };

  let deterministicCount = 0;
  let llmCount = 0;
  let fixedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let stillUnknown = 0;

  // Group by match for batch LLM evaluation
  const byMatch = new Map();
  for (const bet of bets) {
    if (!byMatch.has(bet.match_id)) byMatch.set(bet.match_id, []);
    byMatch.get(bet.match_id).push(bet);
  }

  for (const [matchId, matchBets] of byMatch) {
    const match = await getMatchData(matchCache, matchId);
    if (!match || !match.raw_match) continue;

    const matchData = extractMatchData(match.raw_match);
    const needsLlm = [];

    // Phase 1: deterministic
    for (const bet of matchBets) {
      const evalResult = evaluateDeterministic(
        { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
        matchData, match.home_team_name, match.away_team_name,
      );

      if (evalResult) {
        deterministicCount++;
        if (evalResult.result === 'success') successCount++;
        else if (evalResult.result === 'failure') failureCount++;

        const { error } = await supabase
          .from('suggested_bets')
          .update({
            bet_result: evalResult.result,
            result_reason: `[audit-rescue] ${evalResult.reason}`,
            result_updated_at: new Date().toISOString(),
          })
          .eq('id', bet.id);
        if (!error) fixedCount++;
      } else {
        needsLlm.push(bet);
      }
    }

    // Phase 2: LLM for remaining bets
    if (needsLlm.length > 0) {
      const betsForEval = needsLlm.map(b => ({
        id: b.id, betMarket: b.bet_market, betPick: b.bet_pick,
      }));

      const evalResult = await evaluateBetsWithLLM(
        { matchId, homeTeamName: match.home_team_name, awayTeamName: match.away_team_name, rawMatch: match.raw_match },
        betsForEval
      );

      if (evalResult.success) {
        for (const r of evalResult.data) {
          llmCount++;
          if (r.result === 'success') successCount++;
          else if (r.result === 'failure') failureCount++;
          else stillUnknown++;

          const { error } = await supabase
            .from('suggested_bets')
            .update({
              bet_result: r.result,
              result_reason: `[audit-rescue] ${r.reason}`,
              result_updated_at: new Date().toISOString(),
            })
            .eq('id', r.id);
          if (!error) fixedCount++;
        }
      } else {
        logger.warn('[audit] LLM rescue failed for match', { matchId, error: evalResult.error });
      }
    }
  }

  return { found: bets.length, deterministic: deterministicCount, llm: llmCount, fixed: fixedCount, successCount, failureCount, stillUnknown };
}

async function runAuditResults() {
  const matchCache = new Map();

  const audit = await auditDeterministicResults(matchCache);
  const pending = await evaluatePendingBets(matchCache);
  const rescued = await rescueUnknownBets(matchCache);

  const hitRate = pending.evaluated > 0
    ? Math.round((pending.successCount / pending.evaluated) * 1000) / 10
    : null;

  const summary = {
    audit: { checked: audit.checked, discrepancies: audit.discrepancies, fixed: audit.fixed },
    pending: { found: pending.found, evaluated: pending.evaluated, needsLlm: pending.needsLlm, fixed: pending.fixed },
    rescued: { found: rescued.found, deterministic: rescued.deterministic, llm: rescued.llm, fixed: rescued.fixed, successCount: rescued.successCount, failureCount: rescued.failureCount, stillUnknown: rescued.stillUnknown },
    hitRate,
    totalUpdates: audit.fixed + pending.fixed + rescued.fixed,
  };

  logger.info('[audit] Results audit complete', summary);
  return summary;
}

module.exports = { runAuditResults };

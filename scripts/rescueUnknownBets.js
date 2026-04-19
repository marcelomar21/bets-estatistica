#!/usr/bin/env node
/**
 * Rescue Unknown Bets
 *
 * One-time script to re-evaluate bets stuck as 'unknown' whose matches
 * now have complete raw_match data in the database.
 *
 * Uses the same evaluator pipeline as trackResults:
 * 1. Deterministic evaluation first (no LLM, instant)
 * 2. LLM consensus evaluation for complex markets
 *
 * Usage: node scripts/rescueUnknownBets.js [--dry-run]
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { evaluateBetsWithLLM, extractMatchData, evaluateDeterministic } = require('../bot/services/resultEvaluator');

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;
const COMPLETED_STATUSES = ['complete', 'finished', 'ft', 'aet', 'pen'];

async function fetchAllUnknownBets() {
  let allData = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id, match_id, bet_market, bet_pick, bet_result, result_reason,
        league_matches!inner (match_id, status, home_team_name, away_team_name, raw_match)
      `)
      .eq('bet_result', 'unknown')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Query error: ${error.message}`);
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Filter to only completed matches with raw_match
  return allData.filter(b => {
    const m = b.league_matches;
    return m && COMPLETED_STATUSES.includes(m.status?.toLowerCase()) && m.raw_match;
  });
}

async function updateBetResult(betId, result, reason) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would update bet ${betId}: ${result} — ${reason}`);
    return true;
  }

  const { error } = await supabase
    .from('suggested_bets')
    .update({
      bet_result: result,
      result_reason: `[rescue] ${reason}`,
      result_updated_at: new Date().toISOString(),
    })
    .eq('id', betId);

  if (error) {
    console.error(`  ERROR updating bet ${betId}: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  console.log(`\n=== Rescue Unknown Bets ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const bets = await fetchAllUnknownBets();
  console.log(`Found ${bets.length} unknown bets with completed matches\n`);

  if (bets.length === 0) {
    console.log('Nothing to rescue.');
    return;
  }

  // Group by match
  const byMatch = new Map();
  for (const bet of bets) {
    const matchId = bet.match_id;
    if (!byMatch.has(matchId)) {
      byMatch.set(matchId, { match: bet.league_matches, bets: [] });
    }
    byMatch.get(matchId).bets.push(bet);
  }

  console.log(`Grouped into ${byMatch.size} matches\n`);

  let totalDeterministic = 0;
  let totalLlm = 0;
  let totalSuccess = 0;
  let totalFailure = 0;
  let totalStillUnknown = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const [matchId, { match, bets: matchBets }] of byMatch) {
    const matchData = extractMatchData(match.raw_match);
    const matchLabel = `${match.home_team_name} vs ${match.away_team_name}`;

    console.log(`\n📌 Match ${matchId}: ${matchLabel} (${matchBets.length} bets)`);
    console.log(`   Score: ${matchData.homeScore}-${matchData.awayScore} | Corners: ${matchData.totalCorners ?? 'N/D'} | Cards: ${matchData.totalCards ?? 'N/D'}`);

    // Phase 1: Deterministic evaluation
    const deterministicResults = [];
    const needsLlm = [];

    for (const bet of matchBets) {
      const evalResult = evaluateDeterministic(
        { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
        matchData,
        match.home_team_name,
        match.away_team_name,
      );

      if (evalResult) {
        deterministicResults.push({ id: bet.id, ...evalResult });
        totalDeterministic++;
      } else {
        needsLlm.push(bet);
      }
    }

    // Update deterministic results
    for (const r of deterministicResults) {
      const ok = await updateBetResult(r.id, r.result, r.reason);
      if (ok) {
        totalUpdated++;
        if (r.result === 'success') totalSuccess++;
        else if (r.result === 'failure') totalFailure++;
        console.log(`   ✅ Bet ${r.id}: ${r.result} (deterministic) — ${r.reason}`);
      } else {
        totalErrors++;
      }
    }

    // Phase 2: LLM evaluation for remaining bets
    if (needsLlm.length > 0) {
      console.log(`   🤖 ${needsLlm.length} bets need LLM evaluation...`);

      if (DRY_RUN) {
        for (const bet of needsLlm) {
          console.log(`   [DRY-RUN] Bet ${bet.id} (${bet.bet_market}) needs LLM`);
          totalLlm++;
        }
      } else {
        const betsForEval = needsLlm.map(b => ({
          id: b.id,
          betMarket: b.bet_market,
          betPick: b.bet_pick,
        }));

        const evalResult = await evaluateBetsWithLLM(
          {
            matchId,
            homeTeamName: match.home_team_name,
            awayTeamName: match.away_team_name,
            rawMatch: match.raw_match,
          },
          betsForEval
        );

        if (evalResult.success) {
          for (const r of evalResult.data) {
            const ok = await updateBetResult(r.id, r.result, r.reason);
            if (ok) {
              totalUpdated++;
              totalLlm++;
              if (r.result === 'success') totalSuccess++;
              else if (r.result === 'failure') totalFailure++;
              else totalStillUnknown++;
              console.log(`   🤖 Bet ${r.id}: ${r.result} (llm) — ${r.reason}`);
            } else {
              totalErrors++;
            }
          }
        } else {
          console.error(`   ❌ LLM evaluation failed: ${evalResult.error?.message}`);
          totalErrors += needsLlm.length;
        }
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESCUE SUMMARY ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Total bets processed: ${bets.length}`);
  console.log(`  Deterministic: ${totalDeterministic}`);
  console.log(`  LLM: ${totalLlm}`);
  console.log(`  Updated: ${totalUpdated}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`Results:`);
  console.log(`  ✅ Success: ${totalSuccess}`);
  console.log(`  ❌ Failure: ${totalFailure}`);
  console.log(`  ❓ Still unknown: ${totalStillUnknown}`);
  console.log(`${'='.repeat(50)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });

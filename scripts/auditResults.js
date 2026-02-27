#!/usr/bin/env node
/**
 * Audit script for bet results evaluated deterministically.
 *
 * What it does:
 *   1. Fetches all bets whose result was determined by the deterministic evaluator
 *      (result_source = 'deterministic' OR result_reason contains 'deterministic').
 *   2. Re-evaluates each bet using the CURRENT evaluateDeterministic() function.
 *   3. Reports any discrepancy between the stored result and the re-evaluated result.
 *   4. With --fix: updates incorrect results in the database.
 *   5. Finds pending bets (bet_result='pending') with completed matches and evaluates them.
 *
 * Usage:
 *   node scripts/auditResults.js            # dry-run (report only)
 *   node scripts/auditResults.js --fix      # fix discrepancies + evaluate pending
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { evaluateDeterministic, extractMatchData } = require('../bot/services/resultEvaluator');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const fixMode = args.includes('--fix');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COMPLETED_STATUSES = ['complete', 'finished', 'ft', 'aet', 'pen'];
const PENDING_BET_STATUSES = ['posted', 'ready', 'generated', 'pending_link', 'pending_odds'];
const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Paginated fetch from Supabase (handles the 1000-row limit).
 */
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

// ---------------------------------------------------------------------------
// Part 1 — Audit existing deterministic results
// ---------------------------------------------------------------------------
async function auditDeterministicResults() {
  console.log('\n=== PART 1: Auditing existing deterministic results ===\n');

  // Fetch bets with deterministic results
  const bets = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        bet_result,
        result_reason,
        result_source,
        league_matches!inner (
          home_team_name,
          away_team_name,
          status,
          raw_match
        )
      `)
      .or('result_source.eq.deterministic,result_reason.ilike.%deterministic%')
      .in('bet_result', ['success', 'failure', 'unknown'])
  );

  console.log(`Found ${bets.length} bets with deterministic results to audit.\n`);

  if (bets.length === 0) return { checked: 0, discrepancies: [], fixed: 0 };

  const discrepancies = [];
  let fixedCount = 0;

  for (const bet of bets) {
    const match = bet.league_matches;
    if (!match || !match.raw_match) continue;

    const matchData = extractMatchData(match.raw_match);

    const reEval = evaluateDeterministic(
      { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
      matchData,
      match.home_team_name,
      match.away_team_name,
    );

    // If the current evaluator can no longer evaluate this market deterministically,
    // note it but do not count as a fix-able discrepancy.
    if (!reEval) {
      discrepancies.push({
        betId: bet.id,
        market: bet.bet_market,
        pick: bet.bet_pick,
        storedResult: bet.bet_result,
        reEvalResult: 'N/A (no longer deterministic)',
        reEvalReason: 'Current evaluator returns null — market may have changed',
        match: `${match.home_team_name} vs ${match.away_team_name}`,
        fixable: false,
      });
      continue;
    }

    if (reEval.result !== bet.bet_result) {
      const disc = {
        betId: bet.id,
        market: bet.bet_market,
        pick: bet.bet_pick,
        storedResult: bet.bet_result,
        reEvalResult: reEval.result,
        reEvalReason: reEval.reason,
        match: `${match.home_team_name} vs ${match.away_team_name}`,
        fixable: true,
      };
      discrepancies.push(disc);

      if (fixMode) {
        const { error } = await supabase
          .from('suggested_bets')
          .update({
            bet_result: reEval.result,
            result_reason: `[audit-fix] ${reEval.reason}`,
            result_source: 'deterministic',
            result_updated_at: new Date().toISOString(),
          })
          .eq('id', bet.id);

        if (error) {
          console.log(`  ERROR fixing bet ${bet.id}: ${error.message}`);
        } else {
          fixedCount++;
        }
      }
    }
  }

  // Display discrepancies
  if (discrepancies.length > 0) {
    console.log(`Found ${discrepancies.length} discrepancies:\n`);

    const tableRows = discrepancies.map(d => ({
      'Bet ID': d.betId,
      'Match': d.match.substring(0, 40),
      'Market': d.market,
      'Pick': d.pick,
      'Stored': d.storedResult,
      'Re-eval': d.reEvalResult,
      'Fixable': d.fixable ? 'Yes' : 'No',
    }));
    console.table(tableRows);

    // Detailed output
    for (const d of discrepancies) {
      console.log(`\n  Bet #${d.betId} | ${d.match}`);
      console.log(`    Market: ${d.market} | Pick: ${d.pick}`);
      console.log(`    Stored result:  ${d.storedResult}`);
      console.log(`    Re-eval result: ${d.reEvalResult}`);
      console.log(`    Reason: ${d.reEvalReason}`);
    }
  } else {
    console.log('No discrepancies found. All deterministic results are consistent.');
  }

  return { checked: bets.length, discrepancies, fixed: fixedCount };
}

// ---------------------------------------------------------------------------
// Part 2 — Find and evaluate pending bets with completed matches
// ---------------------------------------------------------------------------
async function evaluatePendingBets() {
  console.log('\n=== PART 2: Evaluating pending bets with completed matches ===\n');

  const bets = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        bet_status,
        bet_result,
        league_matches!inner (
          home_team_name,
          away_team_name,
          status,
          raw_match
        )
      `)
      .eq('bet_result', 'pending')
      .in('bet_status', PENDING_BET_STATUSES)
      .in('league_matches.status', COMPLETED_STATUSES)
  );

  console.log(`Found ${bets.length} pending bets with completed matches.\n`);

  if (bets.length === 0) return { found: 0, evaluated: 0, fixed: 0 };

  let evaluatedCount = 0;
  let fixedCount = 0;
  const results = [];

  for (const bet of bets) {
    const match = bet.league_matches;
    if (!match || !match.raw_match) continue;

    const matchData = extractMatchData(match.raw_match);

    const evalResult = evaluateDeterministic(
      { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
      matchData,
      match.home_team_name,
      match.away_team_name,
    );

    if (!evalResult) {
      results.push({
        betId: bet.id,
        match: `${match.home_team_name} vs ${match.away_team_name}`,
        market: bet.bet_market,
        pick: bet.bet_pick,
        status: bet.bet_status,
        result: 'needs-llm',
        reason: 'Cannot be evaluated deterministically — requires LLM',
      });
      continue;
    }

    evaluatedCount++;
    results.push({
      betId: bet.id,
      match: `${match.home_team_name} vs ${match.away_team_name}`,
      market: bet.bet_market,
      pick: bet.bet_pick,
      status: bet.bet_status,
      result: evalResult.result,
      reason: evalResult.reason,
    });

    if (fixMode) {
      const { error } = await supabase
        .from('suggested_bets')
        .update({
          bet_result: evalResult.result,
          result_reason: `[audit-eval] ${evalResult.reason}`,
          result_source: 'deterministic',
          result_updated_at: new Date().toISOString(),
        })
        .eq('id', bet.id);

      if (error) {
        console.log(`  ERROR updating bet ${bet.id}: ${error.message}`);
      } else {
        fixedCount++;
      }
    }
  }

  // Display results
  if (results.length > 0) {
    const tableRows = results.map(r => ({
      'Bet ID': r.betId,
      'Match': r.match.substring(0, 40),
      'Market': r.market,
      'Pick': r.pick,
      'Bet Status': r.status,
      'Eval Result': r.result,
    }));
    console.table(tableRows);

    // Detailed output for evaluated ones
    const evaluated = results.filter(r => r.result !== 'needs-llm');
    if (evaluated.length > 0) {
      console.log(`\nDetailed evaluation results:`);
      for (const r of evaluated) {
        console.log(`\n  Bet #${r.betId} | ${r.match}`);
        console.log(`    Market: ${r.market} | Pick: ${r.pick}`);
        console.log(`    Result: ${r.result}`);
        console.log(`    Reason: ${r.reason}`);
      }
    }

    const needsLlm = results.filter(r => r.result === 'needs-llm');
    if (needsLlm.length > 0) {
      console.log(`\n${needsLlm.length} bet(s) need LLM evaluation (not handled by this audit script).`);
    }
  }

  return { found: bets.length, evaluated: evaluatedCount, fixed: fixedCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('========================================');
  console.log('  Bet Results Audit Script');
  console.log(`  Mode: ${fixMode ? 'FIX (will update database)' : 'DRY-RUN (report only)'}`);
  console.log('========================================');

  const auditResult = await auditDeterministicResults();
  const pendingResult = await evaluatePendingBets();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================\n');

  console.log('Part 1 — Deterministic result audit:');
  console.log(`  Bets checked:           ${auditResult.checked}`);
  console.log(`  Discrepancies found:    ${auditResult.discrepancies.length}`);
  const fixable = auditResult.discrepancies.filter(d => d.fixable).length;
  const notFixable = auditResult.discrepancies.filter(d => !d.fixable).length;
  console.log(`    Fixable:              ${fixable}`);
  console.log(`    Not fixable (N/A):    ${notFixable}`);
  if (fixMode) {
    console.log(`  Fixed:                  ${auditResult.fixed}`);
  }

  console.log('');
  console.log('Part 2 — Pending bets with completed matches:');
  console.log(`  Pending bets found:     ${pendingResult.found}`);
  console.log(`  Deterministic evals:    ${pendingResult.evaluated}`);
  console.log(`  Needs LLM:             ${pendingResult.found - pendingResult.evaluated}`);
  if (fixMode) {
    console.log(`  Updated in DB:          ${pendingResult.fixed}`);
  }

  console.log('');
  if (!fixMode && (fixable > 0 || pendingResult.evaluated > 0)) {
    console.log('Run with --fix to apply corrections to the database.');
  } else if (fixMode) {
    console.log(`Total database updates: ${auditResult.fixed + pendingResult.fixed}`);
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

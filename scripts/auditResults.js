#!/usr/bin/env node
/**
 * Audit script for bet results.
 *
 * What it does:
 *   1. Re-evaluates bets with deterministic results using the CURRENT code.
 *   2. Finds pending bets with completed matches and evaluates them deterministically.
 *   3. With --fix: updates incorrect/missing results in the database.
 *
 * Usage:
 *   node scripts/auditResults.js            # dry-run (report only)
 *   node scripts/auditResults.js --fix      # fix discrepancies + evaluate pending
 */
const path = require('path');

// Load admin-panel env first (has production Supabase URL), then root .env as fallback
require('dotenv').config({ path: path.resolve(__dirname, '../admin-panel/.env.local'), override: true });
require('dotenv').config({ override: false });

// Map Next.js env names → bot env names (must happen before any require that reads config)
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
}
// Skip config validation (Telegram vars not needed for audit)
process.env.SKIP_CONFIG_VALIDATION = 'true';

const { createClient } = require('@supabase/supabase-js');
const { evaluateDeterministic, extractMatchData } = require('../bot/services/resultEvaluator');

// Build Supabase client directly (avoid using lib/supabase which may point to wrong instance)
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

console.log(`Connecting to: ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

/**
 * Cache of match raw data by match_id to avoid repeated fetches.
 */
const matchCache = new Map();

async function getMatchData(matchId) {
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

// ---------------------------------------------------------------------------
// Part 1 — Audit existing deterministic results
// ---------------------------------------------------------------------------
async function auditDeterministicResults() {
  console.log('\n=== PART 1: Auditing existing deterministic results ===\n');

  // Fetch bets with deterministic results (lightweight — no raw_match)
  const bets = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        bet_result,
        result_reason
      `)
      .ilike('result_reason', '%deterministic%')
      .in('bet_result', ['success', 'failure', 'unknown'])
  );

  console.log(`Found ${bets.length} bets with deterministic results to audit.\n`);

  if (bets.length === 0) return { checked: 0, discrepancies: [], fixed: 0 };

  const discrepancies = [];
  let fixedCount = 0;

  for (const bet of bets) {
    const match = await getMatchData(bet.match_id);
    if (!match || !match.raw_match) continue;

    const matchData = extractMatchData(match.raw_match);

    const reEval = evaluateDeterministic(
      { id: bet.id, betMarket: bet.bet_market, betPick: bet.bet_pick },
      matchData,
      match.home_team_name,
      match.away_team_name,
    );

    if (!reEval) {
      discrepancies.push({
        betId: bet.id,
        market: bet.bet_market,
        pick: bet.bet_pick,
        storedResult: bet.bet_result,
        reEvalResult: 'N/A',
        reEvalReason: 'Current evaluator returns null',
        match: `${match.home_team_name} vs ${match.away_team_name}`,
        fixable: false,
      });
      continue;
    }

    if (reEval.result !== bet.bet_result) {
      discrepancies.push({
        betId: bet.id,
        market: bet.bet_market,
        pick: bet.bet_pick,
        storedResult: bet.bet_result,
        reEvalResult: reEval.result,
        reEvalReason: reEval.reason,
        match: `${match.home_team_name} vs ${match.away_team_name}`,
        fixable: true,
      });

      if (fixMode) {
        const { error } = await supabase
          .from('suggested_bets')
          .update({
            bet_result: reEval.result,
            result_reason: `[audit-fix] ${reEval.reason}`,
            result_updated_at: new Date().toISOString(),
          })
          .eq('id', bet.id);

        if (!error) fixedCount++;
        else console.log(`  ERROR fixing bet ${bet.id}: ${error.message}`);
      }
    }
  }

  if (discrepancies.length > 0) {
    console.log(`Found ${discrepancies.length} discrepancies:\n`);
    console.table(discrepancies.map(d => ({
      'Bet ID': d.betId,
      'Match': d.match.substring(0, 40),
      'Stored': d.storedResult,
      'Re-eval': d.reEvalResult,
      'Fixable': d.fixable ? 'Yes' : 'No',
    })));
  } else {
    console.log('No discrepancies found.');
  }

  return { checked: bets.length, discrepancies, fixed: fixedCount };
}

// ---------------------------------------------------------------------------
// Part 2 — Find and evaluate pending bets with completed matches
// ---------------------------------------------------------------------------
async function evaluatePendingBets() {
  console.log('\n=== PART 2: Evaluating pending bets with completed matches ===\n');

  // Step 1: Fetch pending bet IDs + lightweight fields (NO raw_match — too large)
  const allPending = await fetchAll(() =>
    supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        bet_status,
        league_matches!inner (
          status
        )
      `)
      .eq('bet_result', 'pending')
      .in('bet_status', PENDING_BET_STATUSES)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  );

  // Filter to completed matches in JS
  const bets = allPending.filter(b =>
    b.league_matches && COMPLETED_STATUSES.includes(b.league_matches.status?.toLowerCase())
  );

  console.log(`Found ${allPending.length} pending bets (last 30d), ${bets.length} with completed matches.\n`);

  if (bets.length === 0) return { found: 0, evaluated: 0, needsLlm: 0, fixed: 0 };

  let evaluatedCount = 0;
  let fixedCount = 0;
  let needsLlmCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let processed = 0;

  // Step 2: For each bet, fetch match data (cached) and evaluate
  for (const bet of bets) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processing ${processed}/${bets.length}...`);
    }

    const match = await getMatchData(bet.match_id);
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

    if (fixMode) {
      const { error } = await supabase
        .from('suggested_bets')
        .update({
          bet_result: evalResult.result,
          result_reason: `[audit-eval] ${evalResult.reason}`,
          result_updated_at: new Date().toISOString(),
        })
        .eq('id', bet.id);

      if (!error) fixedCount++;
      else console.log(`  ERROR updating bet ${bet.id}: ${error.message}`);
    }
  }

  console.log(`\nEvaluation complete:`);
  console.log(`  Deterministic: ${evaluatedCount} (${successCount} success, ${failureCount} failure)`);
  console.log(`  Needs LLM:    ${needsLlmCount}`);
  if (evaluatedCount > 0) {
    const rate = Math.round((successCount / evaluatedCount) * 1000) / 10;
    console.log(`  Hit rate:     ${rate}%`);
  }

  return { found: bets.length, evaluated: evaluatedCount, needsLlm: needsLlmCount, fixed: fixedCount };
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

  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================\n');

  console.log('Part 1 — Deterministic result audit:');
  console.log(`  Bets checked:           ${auditResult.checked}`);
  console.log(`  Discrepancies found:    ${auditResult.discrepancies.length}`);
  if (fixMode) console.log(`  Fixed:                  ${auditResult.fixed}`);

  console.log('');
  console.log('Part 2 — Pending bets with completed matches:');
  console.log(`  Pending bets found:     ${pendingResult.found}`);
  console.log(`  Deterministic evals:    ${pendingResult.evaluated}`);
  console.log(`  Needs LLM:             ${pendingResult.needsLlm}`);
  if (fixMode) console.log(`  Updated in DB:          ${pendingResult.fixed}`);

  console.log('');
  const totalFixable = auditResult.discrepancies.filter(d => d.fixable).length + pendingResult.evaluated;
  if (!fixMode && totalFixable > 0) {
    console.log(`Run with --fix to apply ${totalFixable} corrections to the database.`);
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

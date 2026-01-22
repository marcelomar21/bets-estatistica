/**
 * Metrics Validation Script
 * Story 11.4: Validar Cálculo de Métricas
 *
 * Validates that getSuccessRateStats() and getDetailedStats() calculations match
 * manual calculations from raw database data.
 *
 * Usage: npm run validate-metrics
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { getSuccessRateStats, getDetailedStats } = require('../bot/services/metricsService');

/**
 * Calculate metrics manually from raw data
 * @param {Array} bets - Raw bet data from database
 * @returns {object} Manual calculations
 */
function calculateManualMetrics(bets) {
  // All-time calculations
  const success = bets.filter(b => b.bet_status === 'success').length;
  const failure = bets.filter(b => b.bet_status === 'failure').length;
  const total = success + failure;
  const rate = total > 0 ? (success / total) * 100 : null;

  // Last 30 days calculations
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentBets = bets.filter(b => {
    if (!['success', 'failure'].includes(b.bet_status)) return false;
    if (!b.result_updated_at) return false;
    return new Date(b.result_updated_at) >= thirtyDaysAgo;
  });

  const recentSuccess = recentBets.filter(b => b.bet_status === 'success').length;
  const recentTotal = recentBets.length;
  const recentRate = recentTotal > 0 ? (recentSuccess / recentTotal) * 100 : null;

  // By market calculations
  const byMarket = {};
  bets
    .filter(b => ['success', 'failure'].includes(b.bet_status))
    .forEach(b => {
      const market = b.bet_market || 'unknown';
      if (!byMarket[market]) {
        byMarket[market] = { success: 0, failure: 0 };
      }
      byMarket[market][b.bet_status]++;
    });

  // Total posted
  const totalPosted = bets.filter(b => b.telegram_posted_at).length;

  // Average odds (completed bets only)
  const completedBets = bets.filter(b => ['success', 'failure'].includes(b.bet_status));
  const avgOdds = completedBets.length > 0
    ? completedBets.reduce((sum, b) => sum + (b.odds_at_post || 0), 0) / completedBets.length
    : null;

  return {
    allTime: { success, total, rate },
    last30Days: { success: recentSuccess, total: recentTotal, rate: recentRate },
    byMarket,
    totalPosted,
    totalCompleted: completedBets.length,
    averageOdds: avgOdds,
  };
}

/**
 * Compare two values and report discrepancy
 * Handles edge cases: null vs 0 are treated as equivalent for "no data" scenarios
 */
function compare(label, expected, actual, tolerance = 0) {
  // Both null/undefined = pass (no data)
  if ((expected === null || expected === undefined) &&
      (actual === null || actual === undefined)) {
    return { pass: true, label, expected, actual };
  }

  // null/0 equivalence for "no data" edge case
  const isExpectedEmpty = expected === null || expected === undefined || expected === 0;
  const isActualEmpty = actual === null || actual === undefined || actual === 0;
  if (isExpectedEmpty && isActualEmpty) {
    return { pass: true, label, expected, actual, note: 'both empty/zero' };
  }

  // Numeric comparison with tolerance
  if (typeof expected === 'number' && typeof actual === 'number') {
    const diff = Math.abs(expected - actual);
    const pass = diff <= tolerance;
    return { pass, label, expected, actual, diff };
  }

  // Strict equality for other types
  const pass = expected === actual;
  return { pass, label, expected, actual };
}

/**
 * Run full metrics validation
 */
async function validateMetrics() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  METRICS VALIDATION - Story 11.4');
  console.log('='.repeat(60));
  console.log('');

  // 1. Fetch raw data from database
  console.log('1. Fetching raw data from database...');
  const { data: bets, error } = await supabase
    .from('suggested_bets')
    .select('id, bet_status, bet_market, result_updated_at, telegram_posted_at, odds_at_post');

  if (error) {
    console.error('ERROR: Failed to fetch bets:', error.message);
    return false;
  }

  if (!bets || bets.length === 0) {
    console.log('   Found 0 bets - database may be empty\n');
    console.log('   Skipping validation (no data to compare)');
    return true; // Not a failure, just no data
  }

  console.log(`   Found ${bets.length} total bets\n`);

  // 2. Calculate manually
  console.log('2. Calculating metrics manually...');
  const manual = calculateManualMetrics(bets);
  console.log(`   All-time: ${manual.allTime.success}/${manual.allTime.total} = ${manual.allTime.rate?.toFixed(2) || 'N/A'}%`);
  console.log(`   30 days:  ${manual.last30Days.success}/${manual.last30Days.total} = ${manual.last30Days.rate?.toFixed(2) || 'N/A'}%`);
  console.log(`   Posted:   ${manual.totalPosted}`);
  console.log(`   Completed: ${manual.totalCompleted}`);
  console.log(`   Avg odds: ${manual.averageOdds?.toFixed(2) || 'N/A'}\n`);

  // 3. Get system metrics
  console.log('3. Getting metrics from system...');
  const rateResult = await getSuccessRateStats();
  const detailsResult = await getDetailedStats();

  if (!rateResult.success) {
    console.error('ERROR: getSuccessRateStats failed:', rateResult.error);
    return false;
  }

  if (!detailsResult.success) {
    console.error('ERROR: getDetailedStats failed:', detailsResult.error);
    return false;
  }

  const system = rateResult.data;
  const details = detailsResult.data;

  console.log(`   All-time: ${system.allTime.success}/${system.allTime.total} = ${system.allTime.rate?.toFixed(2) || 'N/A'}%`);
  console.log(`   30 days:  ${system.last30Days.success}/${system.last30Days.total} = ${system.last30Days.rate?.toFixed(2) || 'N/A'}%`);
  console.log(`   Posted:   ${details.totalPosted}`);
  console.log(`   Completed: ${details.totalCompleted}`);
  console.log(`   Avg odds: ${details.averageOdds?.toFixed(2) || 'N/A'}\n`);

  // 4. Compare values
  console.log('4. Comparing values...');
  console.log('-'.repeat(60));

  const comparisons = [
    compare('All-time success', manual.allTime.success, system.allTime.success),
    compare('All-time total', manual.allTime.total, system.allTime.total),
    compare('All-time rate', manual.allTime.rate, system.allTime.rate, 0.01),
    compare('30d success', manual.last30Days.success, system.last30Days.success),
    compare('30d total', manual.last30Days.total, system.last30Days.total),
    compare('30d rate', manual.last30Days.rate, system.last30Days.rate, 0.01),
    compare('Total posted', manual.totalPosted, details.totalPosted),
    compare('Total completed', manual.totalCompleted, details.totalCompleted),
    compare('Average odds', manual.averageOdds, details.averageOdds, 0.01),
  ];

  let allPassed = true;
  for (const result of comparisons) {
    const icon = result.pass ? '✅' : '❌';
    const extra = result.diff !== undefined ? ` (diff: ${result.diff.toFixed(4)})` : '';
    console.log(`   ${icon} ${result.label}: expected ${result.expected}, got ${result.actual}${extra}`);
    if (!result.pass) allPassed = false;
  }

  // 5. Validate by-market breakdown
  console.log('\n5. Validating by-market breakdown...');
  console.log('-'.repeat(60));

  const systemMarkets = details.byMarket || {};
  const manualMarkets = manual.byMarket;

  // Get all unique markets
  const allMarkets = new Set([
    ...Object.keys(manualMarkets),
    ...Object.keys(systemMarkets),
  ]);

  for (const market of allMarkets) {
    const manualData = manualMarkets[market] || { success: 0, failure: 0 };
    const systemData = systemMarkets[market] || { success: 0, failure: 0 };

    const successMatch = manualData.success === systemData.success;
    const failureMatch = manualData.failure === systemData.failure;
    const pass = successMatch && failureMatch;
    const icon = pass ? '✅' : '❌';

    console.log(`   ${icon} ${market}: manual (${manualData.success}/${manualData.success + manualData.failure}), system (${systemData.success}/${systemData.success + systemData.failure})`);

    if (!pass) allPassed = false;
  }

  // 6. Summary
  console.log('');
  console.log('='.repeat(60));
  if (allPassed) {
    console.log('  ✅ VALIDATION PASSED - All metrics match!');
  } else {
    console.log('  ❌ VALIDATION FAILED - Discrepancies found!');
  }
  console.log('='.repeat(60));
  console.log('');

  return allPassed;
}

/**
 * Run edge case tests
 */
async function testEdgeCases() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  EDGE CASE TESTS');
  console.log('='.repeat(60));
  console.log('');

  // Test formatStatsMessage with various inputs
  const { formatStatsMessage } = require('../bot/services/metricsService');

  const testCases = [
    {
      input: null,
      name: 'null input',
      expectedContains: 'não disponíveis',
    },
    {
      input: undefined,
      name: 'undefined input',
      expectedContains: 'não disponíveis',
    },
    {
      input: {
        allTime: { success: 0, total: 0, rate: null },
        last30Days: { success: 0, total: 0, rate: null },
      },
      name: '0 bets (empty)',
      expectedContains: 'não há resultados',
    },
    {
      input: {
        allTime: { success: 5, total: 5, rate: 100 },
        last30Days: { success: 5, total: 5, rate: 100 },
      },
      name: '100% success rate',
      expectedContains: '100.0%',
    },
    {
      input: {
        allTime: { success: 0, total: 5, rate: 0 },
        last30Days: { success: 0, total: 5, rate: 0 },
      },
      name: '0% success rate',
      expectedContains: '0.0%',
    },
    {
      input: {
        allTime: { success: 7, total: 10, rate: 70 },
        last30Days: { success: 3, total: 4, rate: 75 },
      },
      name: 'Normal data',
      expectedContains: '70.0%',
    },
  ];

  let allPassed = true;

  for (const tc of testCases) {
    try {
      const result = formatStatsMessage(tc.input);
      const hasResult = typeof result === 'string' && result.length > 0;
      const containsExpected = tc.expectedContains
        ? result.includes(tc.expectedContains)
        : true;
      const pass = hasResult && containsExpected;
      const icon = pass ? '✅' : '❌';

      console.log(`${icon} ${tc.name}: ${pass ? 'OK' : 'FAIL'}`);
      if (!containsExpected) {
        console.log(`   Expected to contain: "${tc.expectedContains}"`);
        console.log(`   Got: "${result.substring(0, 80)}..."`);
      } else if (tc.input !== null && tc.input !== undefined) {
        console.log(`   Output: ${result.substring(0, 60)}...`);
      }
      if (!pass) allPassed = false;
    } catch (err) {
      console.log(`❌ ${tc.name}: ERROR - ${err.message}`);
      allPassed = false;
    }
  }

  console.log('');
  return allPassed;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const metricsValid = await validateMetrics();
    const edgeCasesValid = await testEdgeCases();

    const allValid = metricsValid && edgeCasesValid;

    if (allValid) {
      console.log('All validations passed!');
      process.exit(0);
    } else {
      console.log('Some validations failed!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Validation script error:', err.message);
    process.exit(1);
  }
}

main();

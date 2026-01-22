/**
 * Test the complete bot flow
 * Run: node scripts/test-bot-flow.js
 */
require('dotenv').config();

const { testConnection: testSupabase } = require('../lib/supabase');
const { testConnection: testTelegram } = require('../bot/telegram');
const { getSports } = require('../bot/services/oddsService');
const { getSuccessRateForDays } = require('../../bot/services/metricsService');
const { getEligibleBets } = require('../bot/services/betService');

async function runTests() {
  console.log('🧪 Testing Bot Flow\n');
  console.log('='.repeat(50));

  const results = {
    supabase: false,
    telegram: false,
    oddsApi: false,
    betService: false,
    metrics: false,
  };

  // Test 1: Supabase
  console.log('\n1️⃣  Testing Supabase connection...');
  const supabaseResult = await testSupabase();
  results.supabase = supabaseResult.success;
  console.log(supabaseResult.success ? '   ✅ Supabase OK' : `   ❌ Supabase: ${supabaseResult.error?.message}`);

  // Test 2: Telegram
  console.log('\n2️⃣  Testing Telegram connection...');
  const telegramResult = await testTelegram();
  results.telegram = telegramResult.success;
  console.log(telegramResult.success ? `   ✅ Telegram OK (@${telegramResult.data?.username})` : `   ❌ Telegram: ${telegramResult.error?.message}`);

  // Test 3: The Odds API
  console.log('\n3️⃣  Testing The Odds API...');
  try {
    const oddsResult = await getSports();
    results.oddsApi = oddsResult.success;
    if (oddsResult.success) {
      console.log(`   ✅ Odds API OK (${oddsResult.data?.length} soccer leagues found)`);
    } else {
      console.log(`   ❌ Odds API: ${oddsResult.error?.message}`);
    }
  } catch (err) {
    console.log(`   ❌ Odds API: ${err.message}`);
  }

  // Test 4: Bet Service
  console.log('\n4️⃣  Testing Bet Service...');
  try {
    const betsResult = await getEligibleBets(5);
    results.betService = betsResult.success;
    if (betsResult.success) {
      console.log(`   ✅ Bet Service OK (${betsResult.data?.length} eligible bets)`);
    } else {
      console.log(`   ❌ Bet Service: ${betsResult.error?.message}`);
    }
  } catch (err) {
    console.log(`   ❌ Bet Service: ${err.message}`);
  }

  // Test 5: Metrics Service
  console.log('\n5️⃣  Testing Metrics Service...');
  try {
    const metricsResult = await getSuccessRateForDays(30);
    results.metrics = metricsResult.success;
    if (metricsResult.success) {
      const rate = metricsResult.data?.rate;
      console.log(`   ✅ Metrics OK (30-day rate: ${rate !== null ? rate.toFixed(1) + '%' : 'N/A'})`);
    } else {
      console.log(`   ❌ Metrics: ${metricsResult.error?.message}`);
    }
  } catch (err) {
    console.log(`   ❌ Metrics: ${err.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:\n');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([name, success]) => {
    console.log(`   ${success ? '✅' : '❌'} ${name}`);
  });

  console.log(`\n   Total: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n🎉 All systems operational!\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check configuration.\n');
  }

  return results;
}

// Run tests
runTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });

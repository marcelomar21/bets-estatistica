/**
 * Test The Odds API directly
 * Run: node scripts/test-odds-api.js
 */
require('dotenv').config();

const API_KEY = process.env.THE_ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

async function testApi() {
  console.log('🧪 Testing The Odds API\n');
  console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 8)}...` : '❌ NOT SET');
  
  if (!API_KEY) {
    console.error('❌ THE_ODDS_API_KEY not found in .env');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));

  // 1. Test sports endpoint
  console.log('\n📋 Step 1: Fetching available soccer sports...\n');
  
  const sportsUrl = `${BASE_URL}/sports?apiKey=${API_KEY}`;
  const sportsRes = await fetch(sportsUrl);
  
  console.log('Status:', sportsRes.status);
  console.log('Remaining requests:', sportsRes.headers.get('x-requests-remaining'));
  console.log('Used requests:', sportsRes.headers.get('x-requests-used'));
  
  if (!sportsRes.ok) {
    const error = await sportsRes.text();
    console.error('❌ Error:', error);
    process.exit(1);
  }

  const sports = await sportsRes.json();
  const soccerSports = sports.filter(s => s.group === 'Soccer' && s.active);
  
  console.log(`\n✅ Found ${soccerSports.length} active soccer competitions:`);
  soccerSports.slice(0, 10).forEach(s => {
    console.log(`   - ${s.key}: ${s.title}`);
  });
  if (soccerSports.length > 10) {
    console.log(`   ... and ${soccerSports.length - 10} more`);
  }

  console.log('\n' + '='.repeat(80));

  // 2. Test events for a popular league
  const testSport = soccerSports.find(s => s.key.includes('champions_league')) 
    || soccerSports.find(s => s.key.includes('england_epl'))
    || soccerSports[0];
  
  if (!testSport) {
    console.log('❌ No soccer sport found to test');
    process.exit(1);
  }

  console.log(`\n📅 Step 2: Fetching events for ${testSport.title}...\n`);
  
  const eventsUrl = `${BASE_URL}/sports/${testSport.key}/events?apiKey=${API_KEY}`;
  const eventsRes = await fetch(eventsUrl);
  
  console.log('Status:', eventsRes.status);
  console.log('Remaining requests:', eventsRes.headers.get('x-requests-remaining'));
  
  if (!eventsRes.ok) {
    const error = await eventsRes.text();
    console.error('❌ Error:', error);
    process.exit(1);
  }

  const events = await eventsRes.json();
  
  console.log(`\n✅ Found ${events.length} upcoming events:`);
  events.slice(0, 5).forEach(e => {
    const date = new Date(e.commence_time).toLocaleString('pt-BR');
    console.log(`   - ${e.home_team} vs ${e.away_team} (${date})`);
    console.log(`     ID: ${e.id}`);
  });

  if (events.length === 0) {
    console.log('⚠️ No events found for this competition');
    process.exit(0);
  }

  console.log('\n' + '='.repeat(80));

  // 3. Test odds for an event
  const testEvent = events[0];
  console.log(`\n💰 Step 3: Fetching odds for ${testEvent.home_team} vs ${testEvent.away_team}...\n`);

  // Test multiple markets
  const markets = ['h2h', 'totals', 'btts'];
  
  for (const market of markets) {
    console.log(`\n📊 Market: ${market.toUpperCase()}`);
    
    const oddsUrl = `${BASE_URL}/sports/${testSport.key}/events/${testEvent.id}/odds?apiKey=${API_KEY}&regions=eu&markets=${market}`;
    const oddsRes = await fetch(oddsUrl);
    
    console.log('   Status:', oddsRes.status);
    console.log('   Remaining:', oddsRes.headers.get('x-requests-remaining'));
    
    if (!oddsRes.ok) {
      const error = await oddsRes.text();
      console.log('   ❌ Error:', error);
      continue;
    }

    const oddsData = await oddsRes.json();
    
    if (!oddsData.bookmakers || oddsData.bookmakers.length === 0) {
      console.log('   ⚠️ No bookmakers with odds for this market');
      continue;
    }

    console.log(`   ✅ Found ${oddsData.bookmakers.length} bookmakers:`);
    
    for (const bm of oddsData.bookmakers.slice(0, 3)) {
      console.log(`\n   📖 ${bm.title} (${bm.key}):`);
      for (const mkt of bm.markets || []) {
        console.log(`      Market: ${mkt.key}`);
        for (const outcome of mkt.outcomes || []) {
          const line = outcome.point !== undefined ? ` (${outcome.point})` : '';
          console.log(`         ${outcome.name}${line}: ${outcome.price}`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ API test complete!\n');

  // Summary
  console.log('📊 Summary:');
  console.log(`   - API Key: Working`);
  console.log(`   - Soccer competitions: ${soccerSports.length}`);
  console.log(`   - Events in ${testSport.title}: ${events.length}`);
  console.log(`   - Remaining API calls: ${eventsRes.headers.get('x-requests-remaining')}`);
}

testApi().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});

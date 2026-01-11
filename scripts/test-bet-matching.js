/**
 * Test bet matching with The Odds API
 * Verifies if our bets can find matching events
 * 
 * Run: node scripts/test-bet-matching.js
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');
const { getSports, getUpcomingEvents, findEventByTeams, getEventOdds, findBestOdds } = require('../bot/services/oddsService');
const { interpretMarket } = require('../bot/services/marketInterpreter');

async function testMatching() {
  console.log('🧪 Testing Bet Matching with Odds API\n');

  // 1. Get bets from database
  const { data: bets, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      bet_market,
      bet_pick,
      odds,
      bet_status,
      eligible,
      league_matches!inner (
        home_team_name,
        away_team_name,
        kickoff_time,
        status
      )
    `)
    .eq('eligible', true)
    .eq('bet_category', 'SAFE')
    .neq('league_matches.status', 'complete')
    .limit(10);

  if (error) {
    console.error('❌ Failed to fetch bets:', error.message);
    process.exit(1);
  }

  console.log(`📊 Found ${bets.length} eligible bets to test\n`);
  console.log('='.repeat(80));

  // 2. Get all soccer sports
  console.log('\n📋 Fetching soccer sports from Odds API...');
  const sportsResult = await getSports();
  
  if (!sportsResult.success) {
    console.error('❌ Failed to fetch sports:', sportsResult.error);
    process.exit(1);
  }

  console.log(`✅ Found ${sportsResult.data.length} soccer competitions\n`);

  // 3. Cache all events (prioritize major leagues and Champions League)
  console.log('📅 Fetching all upcoming events (this may take a moment)...\n');
  
  // Priority sports first
  const prioritySports = [
    'soccer_uefa_champs_league',
    'soccer_uefa_europa_league',
    'soccer_epl',
    'soccer_brazil_campeonato',
    'soccer_spain_la_liga',
    'soccer_germany_bundesliga',
    'soccer_italy_serie_a',
    'soccer_france_ligue_one',
  ];
  
  const allEvents = [];
  const fetchedSports = new Set();
  
  // Fetch priority sports first
  for (const sportKey of prioritySports) {
    const eventsResult = await getUpcomingEvents(sportKey);
    fetchedSports.add(sportKey);
    if (eventsResult.success && eventsResult.data.length > 0) {
      for (const event of eventsResult.data) {
        allEvents.push({ ...event, sportKey });
      }
    }
  }
  
  // Then fetch remaining sports (up to 30 total)
  for (const sport of sportsResult.data) {
    if (fetchedSports.size >= 30) break;
    if (fetchedSports.has(sport.key)) continue;
    
    const eventsResult = await getUpcomingEvents(sport.key);
    fetchedSports.add(sport.key);
    if (eventsResult.success && eventsResult.data.length > 0) {
      for (const event of eventsResult.data) {
        allEvents.push({ ...event, sportKey: sport.key });
      }
    }
  }

  console.log(`✅ Cached ${allEvents.length} upcoming events\n`);
  console.log('='.repeat(80));

  // 4. Try to match each bet
  let matched = 0;
  let unmatched = 0;

  for (const bet of bets) {
    const homeTeam = bet.league_matches.home_team_name;
    const awayTeam = bet.league_matches.away_team_name;
    const kickoff = new Date(bet.league_matches.kickoff_time).toLocaleString('pt-BR');

    console.log(`\n🏟️ Bet #${bet.id}: ${homeTeam} vs ${awayTeam}`);
    console.log(`   📅 ${kickoff}`);
    console.log(`   📊 Market: ${bet.bet_market}`);

    // Interpret market
    const interpretation = await interpretMarket(bet.bet_market);
    console.log(`   🤖 Interpreted: ${JSON.stringify(interpretation)}`);

    if (!interpretation.supported) {
      console.log(`   ⚠️ Market not supported by API - needs admin odds`);
      continue;
    }

    // Try to find matching event
    const matchedEvent = findEventByTeams(allEvents, homeTeam, awayTeam);

    if (matchedEvent) {
      matched++;
      console.log(`   ✅ MATCHED with: ${matchedEvent.home_team} vs ${matchedEvent.away_team}`);
      console.log(`   🔑 Event ID: ${matchedEvent.id}`);
      console.log(`   🏆 Sport: ${matchedEvent.sportKey}`);

      // Try to get odds
      if (interpretation.market) {
        const oddsResult = await getEventOdds(matchedEvent.sportKey, matchedEvent.id, interpretation.market);
        
        if (oddsResult.success) {
          const bestOdds = findBestOdds(oddsResult.data, interpretation.type, interpretation.line);
          if (bestOdds) {
            console.log(`   💰 Best odds: ${bestOdds.odds} @ ${bestOdds.bookmaker} (line: ${bestOdds.line})`);
          } else {
            console.log(`   ⚠️ No matching odds found for ${interpretation.type} ${interpretation.line || ''}`);
          }
        } else {
          console.log(`   ⚠️ Failed to get odds: ${oddsResult.error?.message}`);
        }
      }
    } else {
      unmatched++;
      console.log(`   ❌ NO MATCH found in Odds API`);
      
      // Show similar events
      const normalizeTeam = (name) => name?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const homeNorm = normalizeTeam(homeTeam);
      
      const similar = allEvents.filter(e => {
        const eventHome = normalizeTeam(e.home_team);
        const eventAway = normalizeTeam(e.away_team);
        return eventHome?.includes(homeNorm?.substring(0, 5)) || 
               eventAway?.includes(homeNorm?.substring(0, 5));
      });

      if (similar.length > 0) {
        console.log(`   📋 Similar events found:`);
        similar.slice(0, 3).forEach(e => {
          console.log(`      - ${e.home_team} vs ${e.away_team} (${e.sportKey})`);
        });
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Matched: ${matched}`);
  console.log(`   ❌ Unmatched: ${unmatched}`);
  console.log(`   📈 Match rate: ${((matched / (matched + unmatched)) * 100).toFixed(1)}%\n`);
}

testMatching().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});

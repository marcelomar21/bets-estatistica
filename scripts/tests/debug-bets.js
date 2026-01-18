#!/usr/bin/env node
/**
 * Debug script to check the state of bets and matches
 */
require('dotenv').config();

const { supabase } = require('../lib/supabase');

async function main() {
  console.log('🔍 Debugging bets and matches...\n');

  // 1. Count bets by status
  const { data: statusCounts, error: _statusError } = await supabase
    .from('suggested_bets')
    .select('bet_status, eligible')
    .then(({ data }) => {
      const counts = {};
      (data || []).forEach(bet => {
        const key = `${bet.bet_status} (eligible=${bet.eligible})`;
        counts[key] = (counts[key] || 0) + 1;
      });
      return { data: counts };
    });

  console.log('📊 Bets by status:');
  console.log(statusCounts);

  // 2. Get sample bets
  const { data: sampleBets } = await supabase
    .from('suggested_bets')
    .select('id, match_id, bet_market, odds, bet_status, eligible')
    .limit(10);

  console.log('\n📝 Sample bets:');
  console.table(sampleBets);

  // 3. Check if match_ids exist in league_matches
  const matchIds = [...new Set((sampleBets || []).map(b => b.match_id))];
  
  console.log('\n🔗 Checking if match_ids exist in league_matches...');
  for (const matchId of matchIds) {
    const { data } = await supabase
      .from('league_matches')
      .select('match_id, home_team_name, away_team_name, kickoff_time')
      .eq('match_id', matchId)
      .single();
    
    if (data) {
      console.log(`  ✅ ${matchId}: ${data.home_team_name} x ${data.away_team_name} @ ${data.kickoff_time}`);
    } else {
      console.log(`  ❌ ${matchId}: NOT FOUND in league_matches`);
    }
  }

  // 4. Count matches in the next 14 days
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  
  const { count } = await supabase
    .from('league_matches')
    .select('*', { count: 'exact', head: true })
    .gte('kickoff_time', now)
    .lte('kickoff_time', future);

  console.log(`\n📅 Matches in next 14 days: ${count}`);

  // 5. Check bets that SHOULD be enriched
  const { data: eligibleBets, error: eligibleError } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_status,
      odds,
      eligible,
      league_matches!inner (
        kickoff_time
      )
    `)
    .eq('eligible', true)
    .eq('bet_category', 'SAFE')
    .in('bet_status', ['generated', 'pending_link', 'ready'])
    .gte('league_matches.kickoff_time', now)
    .limit(10);

  if (eligibleError) {
    console.log('\n⚠️  Error fetching eligible bets:', eligibleError.message);
  } else {
    console.log(`\n✅ Eligible bets with valid matches: ${eligibleBets?.length || 0}`);
    if (eligibleBets?.length) {
      console.table(eligibleBets.map(b => ({
        id: b.id,
        match_id: b.match_id,
        odds: b.odds,
        status: b.bet_status,
        kickoff: b.league_matches?.kickoff_time,
      })));
    }
  }
}

main()
  .catch(err => console.error('Error:', err.message))
  .finally(() => process.exit(0));

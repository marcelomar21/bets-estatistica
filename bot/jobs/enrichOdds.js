/**
 * Job: Enrich bets with live odds from The Odds API
 * 
 * Stories covered:
 * - 4.3: Associar odds às apostas
 * - 4.4: Marcar apostas com odds < 1.60 como inelegíveis
 * 
 * Run: node bot/jobs/enrichOdds.js
 */
require('dotenv').config();

const { supabase } = require('../../lib/supabase');
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { enrichBetsWithOdds } = require('../services/oddsService');
const { markLowOddsBetsIneligible } = require('../services/betService');

/**
 * Get bets that need odds enrichment
 */
async function getBetsNeedingOdds() {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_market,
      bet_pick,
      odds,
      bet_status,
      eligible,
      league_matches!inner (
        home_team_name,
        away_team_name,
        kickoff_time
      )
    `)
    .eq('eligible', true)
    .eq('bet_category', 'SAFE')
    .in('bet_status', ['generated', 'pending_link', 'ready'])
    .gte('league_matches.kickoff_time', new Date().toISOString())
    .lte('league_matches.kickoff_time', new Date(Date.now() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    logger.error('Failed to fetch bets for odds enrichment', { error: error.message });
    return [];
  }

  return (data || []).map(bet => ({
    id: bet.id,
    matchId: bet.match_id,
    betMarket: bet.bet_market,
    betPick: bet.bet_pick,
    currentOdds: bet.odds,
    betStatus: bet.bet_status,
    homeTeamName: bet.league_matches.home_team_name,
    awayTeamName: bet.league_matches.away_team_name,
    kickoffTime: bet.league_matches.kickoff_time,
  }));
}

/**
 * Update bet odds in database
 */
async function updateBetOdds(betId, odds) {
  const { error } = await supabase
    .from('suggested_bets')
    .update({ odds })
    .eq('id', betId);

  if (error) {
    logger.error('Failed to update bet odds', { betId, error: error.message });
    return false;
  }

  return true;
}

/**
 * Main enrichment job
 */
async function runEnrichment() {
  logger.info('Starting odds enrichment job');

  // Step 1: Get bets needing odds
  const bets = await getBetsNeedingOdds();
  logger.info('Bets to enrich', { count: bets.length });

  if (bets.length === 0) {
    logger.info('No bets need odds enrichment');
    return { enriched: 0, markedIneligible: 0 };
  }

  // Step 2: Enrich with live odds
  const enrichedBets = await enrichBetsWithOdds(bets);

  // Step 3: Update odds in database
  let updated = 0;
  for (const bet of enrichedBets) {
    if (bet.odds && bet.odds !== bet.currentOdds) {
      const success = await updateBetOdds(bet.id, bet.odds);
      if (success) updated++;
    }
  }
  logger.info('Updated bet odds', { count: updated });

  // Step 4: Mark low odds bets as ineligible (Story 4.4)
  const markResult = await markLowOddsBetsIneligible();
  const markedIneligible = markResult.success ? markResult.data?.markedCount || 0 : 0;

  logger.info('Odds enrichment complete', { 
    totalBets: bets.length,
    enriched: updated,
    markedIneligible,
  });

  return { enriched: updated, markedIneligible };
}

// Run if called directly
if (require.main === module) {
  runEnrichment()
    .then(result => {
      console.log('✅ Enrichment complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Enrichment failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runEnrichment };

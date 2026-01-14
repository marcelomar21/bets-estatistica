/**
 * Job: Enrich bets with live odds from The Odds API
 *
 * Logic:
 * 1. Always enrich odds for ACTIVE bets (already posted)
 * 2. If active bets < 3, enrich odds for games in next 2 days
 * 3. If no games in next 2 days, remove time restriction
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
const {
  markLowOddsBetsIneligible,
  updateBetOdds,
  setBetPendingWithNote,
} = require('../services/betService');
const { interpretMarket } = require('../services/marketInterpreter');
const { alertAdmin } = require('../telegram');

const MAX_ACTIVE_BETS = config.betting.maxActiveBets; // 3

/**
 * Request odds from admins for bets with unsupported markets
 * (corners, cards, etc. that The Odds API doesn't support)
 */
async function requestAdminOdds(bets) {
  if (!bets.length) return;

  // Group by match to avoid spamming
  const byMatch = new Map();
  for (const bet of bets) {
    const matchKey = `${bet.homeTeamName} vs ${bet.awayTeamName}`;
    if (!byMatch.has(matchKey)) {
      byMatch.set(matchKey, {
        matchKey,
        kickoffTime: bet.kickoffTime,
        bets: [],
      });
    }
    byMatch.get(matchKey).bets.push(bet);
  }

  // Send one message per match
  for (const [matchKey, data] of byMatch) {
    const kickoff = data.kickoffTime
      ? new Date(data.kickoffTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : 'A definir';

    let message = `⚠️ *ODDS NECESSÁRIAS*\n\n`;
    message += `🏟️ *${matchKey}*\n`;
    message += `📅 ${kickoff}\n\n`;
    message += `As seguintes apostas precisam de odds (mercados não disponíveis na API):\n\n`;

    for (const bet of data.bets) {
      message += `📊 ${bet.betMarket}\n`;
      message += `   → Responda: \`/odds ${bet.id} [valor]\`\n\n`;

      // Update bet status using betService
      await setBetPendingWithNote(
        bet.id,
        'Aguardando odds manual do admin (mercado não suportado pela API)'
      );
    }

    message += `\n_Sem resposta, essas apostas não serão postadas._`;

    await alertAdmin('INFO', 'Odds Manual Necessária', message);

    logger.info('Requested admin odds', {
      match: matchKey,
      betsCount: data.bets.length
    });
  }
}

/**
 * Get active posted bets (need to keep odds updated)
 * Note: This is a specialized query for enrichment that filters by match status
 */
async function getActiveBets() {
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
        kickoff_time,
        status
      )
    `)
    .eq('bet_status', 'posted')
    .neq('league_matches.status', 'complete')
    .order('telegram_posted_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch active bets', { error: error.message });
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
 * Get eligible bets with time filter
 * Note: This is a specialized query for enrichment with dynamic time filtering
 * @param {number|null} daysAhead - Max days ahead (null = no limit)
 */
async function getEligibleBetsForEnrichment(daysAhead = 2) {
  const now = new Date().toISOString();

  let query = supabase
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
    .gte('league_matches.kickoff_time', now)
    .order('odds', { ascending: false, nullsFirst: false })
    .limit(100);

  // Apply time filter if specified
  if (daysAhead !== null) {
    const futureLimit = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    query = query.lte('league_matches.kickoff_time', futureLimit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to fetch eligible bets', { error: error.message, daysAhead });
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
 * Main enrichment job
 *
 * Estratégia otimizada:
 * 1. Se já tem 3 bets postadas (ativas), só atualiza essas
 * 2. Só busca novas bets quando slots ficam disponíveis
 * 3. Economiza requisições da Odds API
 */
async function runEnrichment() {
  logger.info('Starting odds enrichment job');

  // Step 1: Get active bets (already posted) - ALWAYS enrich these
  const activeBets = await getActiveBets();
  const activeCount = activeBets.length;
  logger.info('Active posted bets', { count: activeCount });

  // Step 2: Check if we have enough active bets
  const slotsAvailable = MAX_ACTIVE_BETS - activeCount;

  // If we already have 3 active bets, ONLY update those (save API calls!)
  if (slotsAvailable === 0) {
    logger.info('All slots filled with active bets - only enriching those');

    // Only enrich the active bets
    const betsToEnrich = [...activeBets];

    if (betsToEnrich.length === 0) {
      logger.info('No bets to enrich');
      return { enriched: 0, markedIneligible: 0, active: activeCount };
    }

    // Enrich only active bets (no market interpretation needed - they were already validated)
    const enrichedBets = await enrichBetsWithOdds(betsToEnrich);

    let updated = 0;
    // Story 14.8: Determinar nome do job baseado no horario
    const hour = new Date().getHours().toString().padStart(2, '0');
    const jobName = `enrichOdds_${hour}h`;

    for (const bet of enrichedBets) {
      if (bet.odds && bet.odds !== bet.currentOdds) {
        // Use betService.updateBetOdds with jobName
        const result = await updateBetOdds(bet.id, bet.odds, null, jobName);
        if (result.success) {
          updated++;
          logger.debug('Updated active bet odds', {
            betId: bet.id,
            oldOdds: bet.currentOdds,
            newOdds: bet.odds
          });
        }
      }
    }

    logger.info('Active bets odds updated', { count: updated });
    return { enriched: updated, markedIneligible: 0, active: activeCount, needsAdminOdds: 0 };
  }

  // Step 3: We need more bets - get eligible ones
  logger.info('Slots available, fetching eligible bets', { slots: slotsAvailable });

  let eligibleBets = [];

  // Try games in next 2 days first
  eligibleBets = await getEligibleBetsForEnrichment(2);
  logger.info('Eligible bets (next 2 days)', { count: eligibleBets.length });

  // If no games in next 2 days, expand to 14 days
  if (eligibleBets.length === 0) {
    eligibleBets = await getEligibleBetsForEnrichment(14);
    logger.info('Eligible bets (next 14 days)', { count: eligibleBets.length });
  }

  // If still no games, remove time restriction
  if (eligibleBets.length === 0) {
    eligibleBets = await getEligibleBetsForEnrichment(null);
    logger.info('Eligible bets (no time limit)', { count: eligibleBets.length });
  }

  // Limit eligible bets to avoid too many API calls (only need enough to fill slots)
  eligibleBets = eligibleBets.slice(0, slotsAvailable * 3); // 3x for backups

  // Combine active + eligible bets (active first, then eligible)
  const betsToEnrich = [...activeBets, ...eligibleBets];

  if (betsToEnrich.length === 0) {
    logger.info('No bets to enrich');
    return { enriched: 0, markedIneligible: 0, active: activeCount };
  }

  logger.info('Bets to enrich', {
    total: betsToEnrich.length,
    active: activeCount,
    eligible: eligibleBets.length
  });

  // Step 3: Separate bets by market support
  let needsAdminCount = 0;
  const supportedBets = [];
  const needsAdminOdds = [];

  for (const bet of betsToEnrich) {
    const interpretation = await interpretMarket(bet.betMarket);

    if (!interpretation.supported) {
      needsAdminCount++;
      needsAdminOdds.push(bet);

      logger.debug('Bet market needs admin odds', {
        betId: bet.id,
        market: bet.betMarket,
        reason: interpretation.reason
      });
    } else {
      supportedBets.push({
        ...bet,
        parsedMarket: interpretation,
      });
    }
  }

  // Step 3.1: Request odds from admins for unsupported markets
  if (needsAdminOdds.length > 0) {
    await requestAdminOdds(needsAdminOdds);
    logger.info('Requested admin odds for unsupported markets', { count: needsAdminCount });
  }

  // Step 4: Enrich supported bets with live odds
  const enrichedBets = await enrichBetsWithOdds(supportedBets);

  // Step 5: Update odds in database using betService
  // Story 14.8: Determinar nome do job baseado no horario
  const hour = new Date().getHours().toString().padStart(2, '0');
  const jobName = `enrichOdds_${hour}h`;

  let updated = 0;
  for (const bet of enrichedBets) {
    if (bet.odds && bet.odds !== bet.currentOdds) {
      const result = await updateBetOdds(bet.id, bet.odds, null, jobName);
      if (result.success) {
        updated++;
        logger.debug('Updated bet odds', {
          betId: bet.id,
          oldOdds: bet.currentOdds,
          newOdds: bet.odds
        });
      }
    }
  }
  logger.info('Updated bet odds', { count: updated });

  // Step 6: Mark low odds bets as ineligible (Story 4.4)
  const markResult = await markLowOddsBetsIneligible();
  const markedIneligible = markResult.success ? markResult.data?.markedCount || 0 : 0;

  logger.info('Odds enrichment complete', {
    totalBets: betsToEnrich.length,
    supported: supportedBets.length,
    needsAdminOdds: needsAdminCount,
    enriched: updated,
    markedIneligible,
    activeBets: activeCount,
  });

  return {
    enriched: updated,
    markedIneligible,
    active: activeCount,
    needsAdminOdds: needsAdminCount,
  };
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

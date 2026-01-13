/**
 * Bet Service - CRUD operations and state management for bets
 */
const { supabase } = require('../../lib/supabase');
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');

/**
 * Get eligible bets for posting (Story 6.3: ≤2 days, eligible, odds >= 1.60)
 * @param {number} limit - Max number of bets to return
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getEligibleBets(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        confidence,
        reasoning,
        risk_level,
        bet_status,
        deep_link,
        eligible,
        created_at,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time,
          status
        )
      `)
      .eq('eligible', true)
      .eq('bet_category', 'SAFE')
      .in('bet_status', ['generated', 'pending_link', 'ready'])
      .gte('odds', config.betting.minOdds)
      .gte('league_matches.kickoff_time', new Date().toISOString())
      .lte('league_matches.kickoff_time', new Date(Date.now() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000).toISOString())
      .order('odds', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch eligible bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Flatten the response
    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      confidence: bet.confidence,
      reasoning: bet.reasoning,
      riskLevel: bet.risk_level,
      betStatus: bet.bet_status,
      deepLink: bet.deep_link,
      eligible: bet.eligible,
      createdAt: bet.created_at,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
      matchStatus: bet.league_matches.status,
    }));

    logger.info('Fetched eligible bets', { count: bets.length });
    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching eligible bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get bets ready for posting (Story 13.5: Updated selection logic)
 * Alinhado com getFilaStatus() para consistência
 * Considera: elegibilidade, promovida_manual, deep_link, kickoff_time
 * NÃO exige bet_status='ready' - usa elegibilidade como critério principal
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getBetsReadyForPosting() {
  try {
    const now = new Date();
    const maxDate = new Date(Date.now() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000);

    // Story 13.5: Query alinhada com getFilaStatus()
    // Critérios: elegibilidade='elegivel', deep_link NOT NULL, kickoff dentro de 2 dias
    // IMPORTANTE: Não filtra por bet_status='ready' - aceita qualquer status não-terminal
    // que tenha elegibilidade correta e link disponível
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        reasoning,
        deep_link,
        bet_status,
        elegibilidade,
        promovida_manual,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('elegibilidade', 'elegivel')  // Critério principal de elegibilidade
      .not('deep_link', 'is', null)     // Deve ter link
      .in('bet_status', ['generated', 'pending_link', 'ready'])  // Exclui posted, success, failure
      .gte('league_matches.kickoff_time', now.toISOString())
      .lte('league_matches.kickoff_time', maxDate.toISOString())
      .order('promovida_manual', { ascending: false })  // Promovidas primeiro
      .order('odds', { ascending: false })              // Depois por odds
      .limit(10); // Buscar mais para depois filtrar

    if (error) {
      logger.error('Failed to fetch ready bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Filtrar: odds >= minOdds OU promovida_manual = true
    const filteredBets = (data || []).filter(bet =>
      bet.promovida_manual === true || (bet.odds && bet.odds >= config.betting.minOdds)
    );

    // Limitar ao máximo de apostas ativas
    const bets = filteredBets.slice(0, config.betting.maxActiveBets).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      reasoning: bet.reasoning,
      deepLink: bet.deep_link,
      betStatus: bet.bet_status,
      promovidaManual: bet.promovida_manual,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
    }));

    logger.info('Ready bets found', {
      total: data?.length || 0,
      afterFilter: filteredBets.length,
      returned: bets.length,
      promovidas: bets.filter(b => b.promovidaManual).length
    });

    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching ready bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get bets pending links (status='pending_link')
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getBetsPendingLinks() {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        reasoning,
        created_at,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('bet_status', 'pending_link')
      .eq('eligible', true)
      .gte('league_matches.kickoff_time', new Date().toISOString())
      .order('odds', { ascending: false });

    if (error) {
      logger.error('Failed to fetch pending bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      reasoning: bet.reasoning,
      createdAt: bet.created_at,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
    }));

    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching pending bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get active posted bets (status='posted')
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getActivePostedBets() {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds_at_post,
        telegram_posted_at,
        telegram_message_id,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time,
          status,
          home_score,
          away_score
        )
      `)
      .eq('bet_status', 'posted')
      .order('telegram_posted_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch active posted bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      oddsAtPost: bet.odds_at_post,
      telegramPostedAt: bet.telegram_posted_at,
      telegramMessageId: bet.telegram_message_id,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
      matchStatus: bet.league_matches.status,
      homeScore: bet.league_matches.home_score,
      awayScore: bet.league_matches.away_score,
    }));

    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching active posted bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get active bets for reposting (status='posted', kickoff in future, within 2 days)
 * Story 7.1: Returns bets that should be reposted to Telegram
 * Bug fix: Added maxDaysAhead filter to prevent posting games > 2 days out
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getActiveBetsForRepost() {
  try {
    const now = new Date();
    const maxKickoffTime = new Date(now.getTime() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds_at_post,
        reasoning,
        deep_link,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('bet_status', 'posted')
      .gte('league_matches.kickoff_time', now.toISOString())
      .lte('league_matches.kickoff_time', maxKickoffTime.toISOString())
      .order('league_matches(kickoff_time)', { ascending: true });

    if (error) {
      logger.error('Failed to fetch active bets for repost', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds_at_post,
      reasoning: bet.reasoning,
      deepLink: bet.deep_link,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
    }));

    logger.debug('Fetched active bets for repost', { count: bets.length });
    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching active bets for repost', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get all available bets for admin listing (Story 8.1)
 * Includes all bets with future matches regardless of status
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getAvailableBets() {
  try {
    const now = new Date();
    const maxDate = new Date(now.getTime() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        odds_at_post,
        bet_status,
        deep_link,
        eligible,
        elegibilidade,
        promovida_manual,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .in('bet_status', ['generated', 'pending_link', 'ready', 'posted'])
      .gte('league_matches.kickoff_time', now.toISOString())
      .order('league_matches(kickoff_time)', { ascending: true });

    if (error) {
      logger.error('Failed to fetch available bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      oddsAtPost: bet.odds_at_post,
      betStatus: bet.bet_status,
      deepLink: bet.deep_link,
      eligible: bet.eligible,
      elegibilidade: bet.elegibilidade,
      promovidaManual: bet.promovida_manual,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
      hasLink: !!bet.deep_link,
    }));

    logger.debug('Fetched available bets for admin', { count: bets.length });
    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching available bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Update bet status
 * @param {number} betId - Bet ID
 * @param {string} status - New status
 * @param {object} extraFields - Additional fields to update
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function updateBetStatus(betId, status, extraFields = {}) {
  try {
    const updateData = {
      bet_status: status,
      ...extraFields,
    };

    const { error } = await supabase
      .from('suggested_bets')
      .update(updateData)
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet status', { betId, status, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet status updated', { betId, status });
    return { success: true };
  } catch (err) {
    logger.error('Error updating bet status', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Mark bet as posted
 * @param {number} betId - Bet ID
 * @param {number} messageId - Telegram message ID
 * @param {number} oddsAtPost - Odds at time of posting
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function markBetAsPosted(betId, messageId, oddsAtPost) {
  return updateBetStatus(betId, 'posted', {
    telegram_posted_at: new Date().toISOString(),
    telegram_message_id: messageId,
    odds_at_post: oddsAtPost,
  });
}

/**
 * Registra uma postagem no histórico da aposta (Story 13.5)
 * Adiciona timestamp ao array historico_postagens
 * A aposta continua elegível para próximos jobs
 * @param {number} betId - ID da aposta
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function registrarPostagem(betId) {
  try {
    const timestamp = new Date().toISOString();

    // Buscar histórico atual
    const { data: bet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('historico_postagens')
      .eq('id', betId)
      .single();

    if (fetchError) {
      logger.error('Erro ao buscar aposta para registro', { betId, error: fetchError.message });
      return { success: false, error: { code: 'NOT_FOUND', message: 'Aposta não encontrada' } };
    }

    // Adicionar novo timestamp ao array
    const historico = bet.historico_postagens || [];
    historico.push(timestamp);

    // Atualizar histórico
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({ historico_postagens: historico })
      .eq('id', betId);

    if (updateError) {
      logger.error('Erro ao registrar postagem', { betId, error: updateError.message });
      return { success: false, error: { code: 'UPDATE_ERROR', message: 'Erro ao atualizar' } };
    }

    logger.info('Postagem registrada no histórico', { betId, postCount: historico.length });
    return { success: true };

  } catch (err) {
    logger.error('Erro inesperado em registrarPostagem', { betId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: 'Erro interno' } };
  }
}

/**
 * Mark bet as success or failure
 * @param {number} betId - Bet ID
 * @param {boolean} won - Whether bet won
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function markBetResult(betId, won) {
  return updateBetStatus(betId, won ? 'success' : 'failure', {
    result_updated_at: new Date().toISOString(),
  });
}

/**
 * Mark bets with low odds as ineligible (Story 4.4)
 * @param {number} minOdds - Minimum odds threshold
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function markLowOddsBetsIneligible(minOdds = config.betting.minOdds) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .update({ eligible: false })
      .lt('odds', minOdds)
      .eq('eligible', true)
      .in('bet_status', ['generated', 'pending_link'])
      .select('id');

    if (error) {
      logger.error('Failed to mark low odds bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info('Marked low odds bets as ineligible', { count, minOdds });
    }
    return { success: true, data: { markedCount: count } };
  } catch (err) {
    logger.error('Error marking low odds bets', { error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Get a single bet by ID with match info
 * @param {number} betId - Bet ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getBetById(betId) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        bet_status,
        deep_link,
        eligible,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('id', betId)
      .single();

    if (error) {
      logger.error('Failed to fetch bet by ID', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (!data) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Bet ${betId} not found` } };
    }

    const bet = {
      id: data.id,
      matchId: data.match_id,
      betMarket: data.bet_market,
      betPick: data.bet_pick,
      odds: data.odds,
      betStatus: data.bet_status,
      deepLink: data.deep_link,
      eligible: data.eligible,
      homeTeamName: data.league_matches.home_team_name,
      awayTeamName: data.league_matches.away_team_name,
      kickoffTime: data.league_matches.kickoff_time,
    };

    return { success: true, data: bet };
  } catch (err) {
    logger.error('Error fetching bet by ID', { betId, error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Try to auto-promote bet to 'ready' if it has odds >= minOdds and deep_link
 * Called after updating odds or link
 * @param {number} betId - Bet ID
 * @returns {Promise<{promoted: boolean, reason?: string}>}
 */
async function tryAutoPromote(betId) {
  try {
    // Get current bet state
    const { data: bet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id, bet_status, odds, deep_link, eligible')
      .eq('id', betId)
      .single();

    if (fetchError || !bet) {
      return { promoted: false, reason: 'Bet not found' };
    }

    // Skip if already ready, posted, or terminal status
    if (['ready', 'posted', 'success', 'failure'].includes(bet.bet_status)) {
      return { promoted: false, reason: `Already ${bet.bet_status}` };
    }

    // Check if eligible
    if (!bet.eligible) {
      return { promoted: false, reason: 'Not eligible' };
    }

    // Check if has odds >= minOdds
    if (!bet.odds || bet.odds < config.betting.minOdds) {
      return { promoted: false, reason: `Odds ${bet.odds || 'null'} < ${config.betting.minOdds}` };
    }

    // Check if has deep_link
    if (!bet.deep_link) {
      return { promoted: false, reason: 'No deep_link' };
    }

    // All conditions met - promote to ready!
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({ bet_status: 'ready' })
      .eq('id', betId);

    if (updateError) {
      logger.error('Failed to auto-promote bet', { betId, error: updateError.message });
      return { promoted: false, reason: updateError.message };
    }

    logger.info('Bet auto-promoted to ready', { betId, odds: bet.odds });
    return { promoted: true };
  } catch (err) {
    logger.error('Error in auto-promote', { betId, error: err.message });
    return { promoted: false, reason: err.message };
  }
}

/**
 * Update bet with deep link and auto-promote to 'ready' if conditions met
 * @param {number} betId - Bet ID
 * @param {string} deepLink - Deep link URL
 * @returns {Promise<{success: boolean, promoted?: boolean, error?: object}>}
 */
async function updateBetLink(betId, deepLink) {
  try {
    const { error } = await supabase
      .from('suggested_bets')
      .update({ deep_link: deepLink })
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet link', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet link updated', { betId });

    // Try to auto-promote
    const promoteResult = await tryAutoPromote(betId);

    return { success: true, promoted: promoteResult.promoted };
  } catch (err) {
    logger.error('Error updating bet link', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Update bet odds (manual or from API) and auto-promote to 'ready' if conditions met
 * @param {number} betId - Bet ID
 * @param {number} odds - New odds value
 * @param {string} notes - Optional notes about the update
 * @returns {Promise<{success: boolean, promoted?: boolean, error?: object}>}
 */
async function updateBetOdds(betId, odds, notes = null) {
  try {
    const updateData = { odds };
    if (notes) {
      updateData.notes = notes;
    }

    const { error } = await supabase
      .from('suggested_bets')
      .update(updateData)
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet odds', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet odds updated', { betId, odds });

    // Try to auto-promote
    const promoteResult = await tryAutoPromote(betId);

    return { success: true, promoted: promoteResult.promoted };
  } catch (err) {
    logger.error('Error updating bet odds', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Set bet status to pending_link with a note
 * @param {number} betId - Bet ID
 * @param {string} note - Note explaining why
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function setBetPendingWithNote(betId, note) {
  try {
    const { error } = await supabase
      .from('suggested_bets')
      .update({
        bet_status: 'pending_link',
        notes: note,
      })
      .eq('id', betId);

    if (error) {
      logger.error('Failed to set bet pending', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet set to pending_link', { betId });
    return { success: true };
  } catch (err) {
    logger.error('Error setting bet pending', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Request links for top N eligible bets (changes status to pending_link)
 * @param {number} count - Number of bets to request links for
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function requestLinksForTopBets(count = config.betting.maxActiveBets) {
  // First, get top eligible bets that need links
  const result = await getEligibleBets(count);
  if (!result.success) return result;

  const betsToRequest = result.data.filter(bet => bet.betStatus === 'generated');
  
  if (betsToRequest.length === 0) {
    logger.info('No new bets need link requests');
    return { success: true, data: [] };
  }

  // Update their status to pending_link
  const ids = betsToRequest.map(b => b.id);
  const { error } = await supabase
    .from('suggested_bets')
    .update({ bet_status: 'pending_link' })
    .in('id', ids);

  if (error) {
    logger.error('Failed to update bets to pending_link', { error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  // Return the bets with updated status
  const updatedBets = betsToRequest.map(b => ({ ...b, betStatus: 'pending_link' }));
  logger.info('Requested links for bets', { count: updatedBets.length });
  return { success: true, data: updatedBets };
}

/**
 * Create a manual bet (Story 8.4)
 * @param {object} betData - Manual bet data
 * @param {string} betData.homeTeamName - Home team name
 * @param {string} betData.awayTeamName - Away team name  
 * @param {string} betData.betMarket - Market description (e.g., "Over 2.5 gols")
 * @param {number} betData.odds - Odds value
 * @param {string} [betData.deepLink] - Optional deep link
 * @param {string} [betData.kickoffTime] - Optional kickoff time
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createManualBet(betData) {
  try {
    const { homeTeamName, awayTeamName, betMarket, odds, deepLink, kickoffTime } = betData;

    // Determine status based on whether we have a link
    const betStatus = deepLink ? 'ready' : 'pending_link';

    const insertData = {
      // No match_id for manual bets
      match_id: null,
      bet_market: betMarket,
      bet_pick: betMarket, // Same as market for manual
      odds: odds,
      confidence: 0.8, // Default confidence for manual
      reasoning: `Aposta manual: ${homeTeamName} vs ${awayTeamName}`,
      risk_level: 'medium',
      bet_status: betStatus,
      bet_category: 'SAFE',
      deep_link: deepLink || null,
      eligible: true,
      source: 'manual',
      notes: `Manual bet created at ${new Date().toISOString()}`,
      // Store team names in notes since we don't have match_id
      manual_home_team: homeTeamName,
      manual_away_team: awayTeamName,
      manual_kickoff: kickoffTime || null,
    };

    const { data, error } = await supabase
      .from('suggested_bets')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to create manual bet', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Manual bet created', { 
      betId: data.id, 
      match: `${homeTeamName} vs ${awayTeamName}`,
      market: betMarket,
      odds,
      status: betStatus
    });

    return { 
      success: true, 
      data: { 
        id: data.id,
        homeTeamName,
        awayTeamName,
        betMarket,
        odds,
        betStatus,
        deepLink: deepLink || null,
      } 
    };
  } catch (err) {
    logger.error('Error creating manual bet', { error: err.message });
    return { success: false, error: { code: 'CREATE_ERROR', message: err.message } };
  }
}

/**
 * Get overview stats for admin (Story 10.3)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getOverviewStats() {
  try {
    // Get all bets with future matches (last 30 days)
    const { data: allBets, error: allError } = await supabase
      .from('suggested_bets')
      .select(`
        id, 
        odds, 
        deep_link, 
        bet_status,
        telegram_posted_at,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('eligible', true)
      .gte('league_matches.kickoff_time', new Date().toISOString())
      .order('league_matches(kickoff_time)', { ascending: true });

    if (allError) throw allError;

    // Get posted bets (actively being shown)
    const postedBets = (allBets || []).filter(b => b.bet_status === 'posted');

    // Count by status
    const statusCounts = {
      generated: (allBets || []).filter(b => b.bet_status === 'generated').length,
      pending_link: (allBets || []).filter(b => b.bet_status === 'pending_link').length,
      ready: (allBets || []).filter(b => b.bet_status === 'ready').length,
      posted: postedBets.length,
    };

    // Get bets without odds (IDs)
    const withoutOdds = (allBets || []).filter(b => (!b.odds || b.odds === 0) && !['posted', 'success', 'failure'].includes(b.bet_status));

    // Get bets without links (IDs)
    const withoutLinks = (allBets || []).filter(b => !b.deep_link && ['generated', 'pending_link', 'ready'].includes(b.bet_status));

    // Next game (first in list since ordered by kickoff)
    const nextGame = allBets && allBets.length > 0 ? {
      id: allBets[0].id,
      homeTeam: allBets[0].league_matches.home_team_name,
      awayTeam: allBets[0].league_matches.away_team_name,
      kickoff: allBets[0].league_matches.kickoff_time,
    } : null;

    // Last posting time
    const lastPosting = postedBets.length > 0
      ? postedBets.reduce((latest, bet) => {
          const postedAt = bet.telegram_posted_at ? new Date(bet.telegram_posted_at) : null;
          if (!postedAt) return latest;
          if (!latest) return postedAt;
          return postedAt > latest ? postedAt : latest;
        }, null)
      : null;

    // Get success rate (last 30 days)
    const { data: resultsBets, error: resultsError } = await supabase
      .from('suggested_bets')
      .select('id, bet_status')
      .in('bet_status', ['success', 'failure'])
      .gte('result_updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (resultsError) {
      logger.warn('Error fetching results for success rate', { error: resultsError.message });
    }

    const successCount = (resultsBets || []).filter(b => b.bet_status === 'success').length;
    const totalResults = (resultsBets || []).length;
    const successRate = totalResults > 0 ? {
      wins: successCount,
      total: totalResults,
      percentage: Math.round((successCount / totalResults) * 100),
    } : null;

    const stats = {
      totalAnalyzed: allBets?.length || 0,
      statusCounts,
      postedActive: postedBets.length,
      postedIds: postedBets.map(b => ({
        id: b.id,
        match: `${b.league_matches.home_team_name} x ${b.league_matches.away_team_name}`,
        kickoff: b.league_matches.kickoff_time,
      })),
      withoutOddsIds: withoutOdds.map(b => b.id),
      withoutLinksIds: withoutLinks.map(b => b.id),
      withoutOdds: withoutOdds.length,
      withoutLinks: withoutLinks.length,
      readyNotPosted: statusCounts.ready,
      nextGame,
      lastPosting,
      successRate,
    };

    logger.info('Overview stats fetched', { 
      total: stats.totalAnalyzed, 
      posted: stats.postedActive,
      statusCounts 
    });
    return { success: true, data: stats };
  } catch (err) {
    logger.error('Error fetching overview stats', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Calcula próximo horário de postagem (10h, 15h, 22h)
 * @returns {{time: string, diff: string}}
 */
function getNextPostTime() {
  const now = new Date();
  // Ajustar para timezone Brasil
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hours = brTime.getHours();
  const minutes = brTime.getMinutes();
  const postTimes = [10, 15, 22];

  for (const time of postTimes) {
    if (hours < time || (hours === time && minutes === 0)) {
      const diffHours = time - hours;
      const diffMins = 60 - minutes;
      if (diffHours === 0) {
        return { time: `${time}:00`, diff: `${diffMins}min` };
      }
      return { time: `${time}:00`, diff: `${diffHours}h` };
    }
  }

  // Próximo é amanhã às 10h
  const diff = 24 - hours + 10;
  return { time: '10:00 (amanhã)', diff: `${diff}h` };
}

/**
 * Obtém status da fila de postagem (Story 13.4)
 * Mostra apostas ativas (posted) + novas que serão postadas
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getFilaStatus() {
  try {
    const now = new Date();
    const twoDaysLater = new Date(now.getTime() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000);

    // 1. Buscar apostas ATIVAS (posted) - serão repostadas
    // IMPORTANTE: Também filtra por elegibilidade - apostas removidas não aparecem
    const { data: activeBets, error: activeError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_market,
        bet_pick,
        odds,
        odds_at_post,
        bet_status,
        deep_link,
        elegibilidade,
        promovida_manual,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('bet_status', 'posted')
      .eq('elegibilidade', 'elegivel')  // Respeita /remover - apostas removidas não aparecem
      .gte('league_matches.kickoff_time', now.toISOString())
      .lte('league_matches.kickoff_time', twoDaysLater.toISOString())
      .order('league_matches(kickoff_time)', { ascending: true })
      .limit(config.betting.maxActiveBets);

    if (activeError) {
      logger.error('Erro ao buscar apostas ativas', { error: activeError.message });
      return { success: false, error: { code: 'DB_ERROR', message: 'Erro ao buscar fila' } };
    }

    const ativas = (activeBets || []).map(bet => ({
      id: bet.id,
      betMarket: bet.bet_market,
      odds: bet.odds_at_post || bet.odds,
      betStatus: 'posted',
      deepLink: bet.deep_link,
      promovidaManual: bet.promovida_manual,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
    }));

    // 2. Calcular slots disponíveis
    const slotsDisponiveis = Math.max(0, config.betting.maxActiveBets - ativas.length);

    // 3. Buscar NOVAS apostas elegíveis para preencher slots
    let novas = [];
    if (slotsDisponiveis > 0) {
      const { data: eligibleBets, error: eligibleError } = await supabase
        .from('suggested_bets')
        .select(`
          id,
          bet_market,
          bet_pick,
          odds,
          bet_status,
          deep_link,
          elegibilidade,
          promovida_manual,
          league_matches!inner (
            home_team_name,
            away_team_name,
            kickoff_time
          )
        `)
        .eq('elegibilidade', 'elegivel')
        .not('deep_link', 'is', null)
        .in('bet_status', ['generated', 'pending_link', 'ready'])
        .gte('league_matches.kickoff_time', now.toISOString())
        .lte('league_matches.kickoff_time', twoDaysLater.toISOString())
        .order('promovida_manual', { ascending: false })
        .order('odds', { ascending: false })
        .limit(10);

      if (eligibleError) {
        logger.warn('Erro ao buscar novas elegíveis', { error: eligibleError.message });
      } else {
        // Filtrar: odds >= minOdds OU promovida_manual = true
        const filteredNew = (eligibleBets || []).filter(bet =>
          bet.promovida_manual === true || (bet.odds && bet.odds >= config.betting.minOdds)
        );

        novas = filteredNew.slice(0, slotsDisponiveis).map(bet => ({
          id: bet.id,
          betMarket: bet.bet_market,
          odds: bet.odds,
          betStatus: bet.bet_status,
          deepLink: bet.deep_link,
          promovidaManual: bet.promovida_manual,
          homeTeamName: bet.league_matches.home_team_name,
          awayTeamName: bet.league_matches.away_team_name,
          kickoffTime: bet.league_matches.kickoff_time,
        }));
      }
    }

    // 4. Montar fila completa: ativas primeiro, depois novas
    const filaCompleta = [...ativas, ...novas];

    // 5. Contar por elegibilidade (todas as apostas com jogos futuros)
    const { data: allBets, error: countError } = await supabase
      .from('suggested_bets')
      .select(`
        elegibilidade,
        promovida_manual,
        bet_status,
        league_matches!inner (
          kickoff_time
        )
      `)
      .gte('league_matches.kickoff_time', now.toISOString());

    if (countError) {
      logger.warn('Erro ao contar apostas', { error: countError.message });
    }

    const counts = {
      elegivel: 0,
      removida: 0,
      expirada: 0,
      promovidas: 0,
      ativas: ativas.length
    };

    (allBets || []).forEach(bet => {
      if (bet.elegibilidade === 'elegivel') counts.elegivel++;
      if (bet.elegibilidade === 'removida') counts.removida++;
      if (bet.elegibilidade === 'expirada') counts.expirada++;
      if (bet.promovida_manual === true) counts.promovidas++;
    });

    // Calcular próximo horário de postagem
    const nextPost = getNextPostTime();

    return {
      success: true,
      data: {
        filaCompleta,
        ativas,
        novas,
        counts,
        slotsDisponiveis,
        nextPost
      }
    };

  } catch (err) {
    logger.error('Erro ao obter status da fila', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: 'Erro interno' } };
  }
}

/**
 * Remove uma aposta da fila de postagem (Story 13.3)
 * Atualiza elegibilidade='removida'
 * Pode ser revertido usando promoverAposta
 * @param {number} betId - ID da aposta
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function removerAposta(betId) {
  try {
    // Buscar aposta com dados do jogo
    const { data: bet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_market,
        bet_pick,
        odds,
        bet_status,
        elegibilidade,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('id', betId)
      .single();

    if (fetchError || !bet) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Aposta #${betId} não encontrada` }
      };
    }

    // Verificar se já está removida
    if (bet.elegibilidade === 'removida') {
      return {
        success: false,
        error: { code: 'ALREADY_REMOVED', message: `Aposta #${betId} já está removida da fila` }
      };
    }

    // Atualizar elegibilidade para removida
    const { data: updated, error: updateError } = await supabase
      .from('suggested_bets')
      .update({ elegibilidade: 'removida' })
      .eq('id', betId)
      .select(`
        id,
        bet_market,
        bet_pick,
        odds,
        bet_status,
        elegibilidade,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .single();

    if (updateError) {
      logger.error('Erro ao remover aposta', { betId, error: updateError.message });
      return {
        success: false,
        error: { code: 'UPDATE_ERROR', message: 'Erro ao atualizar aposta' }
      };
    }

    logger.info('Aposta removida da fila', { betId });

    // Flatten response
    return {
      success: true,
      data: {
        id: updated.id,
        betMarket: updated.bet_market,
        betPick: updated.bet_pick,
        odds: updated.odds,
        betStatus: updated.bet_status,
        elegibilidade: updated.elegibilidade,
        homeTeamName: updated.league_matches.home_team_name,
        awayTeamName: updated.league_matches.away_team_name,
        kickoffTime: updated.league_matches.kickoff_time,
      }
    };

  } catch (err) {
    logger.error('Erro inesperado ao remover aposta', { betId, error: err.message });
    return {
      success: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Erro interno' }
    };
  }
}

/**
 * Promove uma aposta para a fila de postagem (Story 13.2)
 * Atualiza elegibilidade='elegivel' e promovida_manual=true
 * Apostas promovidas ignoram o filtro de odds >= 1.60 na seleção
 * @param {number} betId - ID da aposta
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function promoverAposta(betId) {
  try {
    // Buscar aposta com dados do jogo
    const { data: bet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_market,
        bet_pick,
        odds,
        bet_status,
        deep_link,
        elegibilidade,
        promovida_manual,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('id', betId)
      .single();

    if (fetchError || !bet) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Aposta #${betId} não encontrada` }
      };
    }

    // Verificar se já está promovida
    if (bet.promovida_manual === true) {
      return {
        success: false,
        error: { code: 'ALREADY_PROMOTED', message: `Aposta #${betId} já está promovida` }
      };
    }

    // Atualizar campos de elegibilidade
    const { data: updated, error: updateError } = await supabase
      .from('suggested_bets')
      .update({
        elegibilidade: 'elegivel',
        promovida_manual: true
      })
      .eq('id', betId)
      .select(`
        id,
        bet_market,
        bet_pick,
        odds,
        bet_status,
        deep_link,
        elegibilidade,
        promovida_manual,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .single();

    if (updateError) {
      logger.error('Erro ao promover aposta', { betId, error: updateError.message });
      return {
        success: false,
        error: { code: 'UPDATE_ERROR', message: 'Erro ao atualizar aposta' }
      };
    }

    logger.info('Aposta promovida', { betId });

    // Flatten response
    return {
      success: true,
      data: {
        id: updated.id,
        betMarket: updated.bet_market,
        betPick: updated.bet_pick,
        odds: updated.odds,
        betStatus: updated.bet_status,
        deepLink: updated.deep_link,
        elegibilidade: updated.elegibilidade,
        promovidaManual: updated.promovida_manual,
        homeTeamName: updated.league_matches.home_team_name,
        awayTeamName: updated.league_matches.away_team_name,
        kickoffTime: updated.league_matches.kickoff_time,
      }
    };

  } catch (err) {
    logger.error('Erro inesperado ao promover aposta', { betId, error: err.message });
    return {
      success: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Erro interno' }
    };
  }
}

/**
 * Swap a posted bet with another eligible bet (Story 10.3)
 * @param {number} oldBetId - ID of bet to remove from posting
 * @param {number} newBetId - ID of bet to start posting
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function swapPostedBet(oldBetId, newBetId) {
  try {
    // Get old bet
    const oldResult = await getBetById(oldBetId);
    if (!oldResult.success) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Aposta #${oldBetId} não encontrada` } };
    }
    const oldBet = oldResult.data;

    // Get new bet
    const newResult = await getBetById(newBetId);
    if (!newResult.success) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Aposta #${newBetId} não encontrada` } };
    }
    const newBet = newResult.data;

    // Validate old bet is currently posted
    if (oldBet.betStatus !== 'posted') {
      return { success: false, error: { code: 'INVALID_STATE', message: `Aposta #${oldBetId} não está postada (status: ${oldBet.betStatus})` } };
    }

    // Validate new bet has a link (must be ready)
    if (!newBet.deepLink) {
      return { success: false, error: { code: 'MISSING_LINK', message: `Aposta #${newBetId} não tem link. Adicione com /link ${newBetId} URL` } };
    }

    // Swap: set old to ready (unposts it), set new to posted
    const { error: oldError } = await supabase
      .from('suggested_bets')
      .update({ bet_status: 'ready' })
      .eq('id', oldBetId);

    if (oldError) throw oldError;

    const { error: newError } = await supabase
      .from('suggested_bets')
      .update({
        bet_status: 'posted',
        telegram_posted_at: new Date().toISOString(),
        odds_at_post: newBet.odds,
      })
      .eq('id', newBetId);

    if (newError) throw newError;

    logger.info('Swapped posted bet', { oldBetId, newBetId });
    return {
      success: true,
      data: {
        removed: { id: oldBetId, match: `${oldBet.homeTeamName} x ${oldBet.awayTeamName}` },
        added: { id: newBetId, match: `${newBet.homeTeamName} x ${newBet.awayTeamName}` },
      }
    };
  } catch (err) {
    logger.error('Error swapping posted bet', { oldBetId, newBetId, error: err.message });
    return { success: false, error: { code: 'SWAP_ERROR', message: err.message } };
  }
}

module.exports = {
  // Query functions
  getEligibleBets,
  getBetsReadyForPosting,
  getBetsPendingLinks,
  getActivePostedBets,
  getActiveBetsForRepost,
  getAvailableBets,
  getBetById,
  getOverviewStats,

  // Update functions
  updateBetStatus,
  updateBetLink,
  updateBetOdds,
  tryAutoPromote,
  setBetPendingWithNote,
  markBetAsPosted,
  registrarPostagem,
  markBetResult,
  markLowOddsBetsIneligible,
  requestLinksForTopBets,
  swapPostedBet,
  promoverAposta,
  removerAposta,
  getFilaStatus,

  // Create functions
  createManualBet,
};

/**
 * Preview Service — generates message previews using the SAME pipeline as real posting
 *
 * Reuses:
 *  - generateBetCopy()       → bot/services/copyService.js (LLM copy with tone)
 *  - formatBetMessage()      → bot/jobs/postBets.js (template assembly)
 *  - getRandomTemplate()     → bot/jobs/postBets.js
 *
 * The preview is for testing TONE, not for validating posting readiness.
 * It fetches any recent bets from the group (including past ones) as sample data.
 *
 * KEY DIFFERENCE from formatBetMessage: the preview ALWAYS calls the LLM when
 * toneConfig is present, even if the bet has no reasoning. formatBetMessage has
 * a gate `if (bet.reasoning || toneConfig?.examplePost)` that skips the LLM
 * otherwise — but for preview we need to show how the tone sounds regardless.
 */
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { generateBetCopy } = require('./copyService');
const { updateGeneratedCopy } = require('./betService');
const { formatBetMessage, getRandomTemplate, getTemplate, getOrGenerateMessage } = require('../jobs/postBets');

/**
 * Load copy_tone_config directly from DB (not from botCtx in memory)
 * so the preview always reflects the latest saved config from the admin panel.
 */
async function loadToneConfig(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('copy_tone_config')
    .eq('id', groupId)
    .single();

  if (error) {
    logger.warn('[previewService] Failed to load tone config', { groupId, error: error.message });
    return null;
  }

  return data?.copy_tone_config || null;
}

/**
 * Fetch sample bets for preview — no posting-readiness filters.
 * Prefers future bets with deep_link, but falls back to any recent bet.
 * Limit to 3 for a quick preview.
 */
async function fetchSampleBets(groupId) {
  // 1st try: future bets with deep_link (ideal preview candidates)
  const now = new Date().toISOString();
  const { data: futureBets } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
      bet_group_assignments!inner ( group_id, generated_copy ),
      league_matches!inner ( home_team_name, away_team_name, kickoff_time )
    `)
    .eq('bet_group_assignments.group_id', groupId)
    .eq('elegibilidade', 'elegivel')
    .gt('league_matches.kickoff_time', now)
    .order('league_matches(kickoff_time)', { ascending: true })
    .limit(1);

  if (futureBets && futureBets.length > 0) {
    return futureBets;
  }

  // 2nd try: any recent bets (including past) — just for tone sample
  const { data: recentBets, error } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
      bet_group_assignments!inner ( group_id, generated_copy ),
      league_matches!inner ( home_team_name, away_team_name, kickoff_time )
    `)
    .eq('bet_group_assignments.group_id', groupId)
    .eq('elegibilidade', 'elegivel')
    .order('league_matches(kickoff_time)', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('[previewService] Failed to fetch sample bets', { groupId, error: error.message });
    return [];
  }

  return recentBets || [];
}

/**
 * Map raw DB bet to the shape formatBetMessage/generateBetCopy expects
 */
function mapBet(raw) {
  const assignment = Array.isArray(raw.bet_group_assignments)
    ? raw.bet_group_assignments[0]
    : raw.bet_group_assignments;
  return {
    id: raw.id,
    betMarket: raw.bet_market,
    betPick: raw.bet_pick,
    odds: raw.odds,
    deepLink: raw.deep_link,
    reasoning: raw.reasoning,
    promovidaManual: raw.promovida_manual,
    generatedCopy: assignment?.generated_copy || null,
    homeTeamName: raw.league_matches.home_team_name,
    awayTeamName: raw.league_matches.away_team_name,
    kickoffTime: raw.league_matches.kickoff_time,
  };
}

/**
 * Generate a preview message for a single bet.
 *
 * When toneConfig has any content, ALWAYS calls the LLM (generateBetCopy)
 * to produce the copy — even if the bet has no reasoning.
 * This ensures the preview reflects the configured tone.
 *
 * When toneConfig is empty/null, falls back to formatBetMessage (static template).
 */
async function formatPreviewMessage(bet, toneConfig, { forceRegenerate = false, groupId } = {}) {
  const template = getTemplate(toneConfig, 0);
  const hasToneConfig = toneConfig && (
    toneConfig.examplePost ||
    toneConfig.examplePosts?.length > 0 ||
    toneConfig.suggestedWords?.length > 0 ||
    toneConfig.rawDescription ||
    toneConfig.persona ||
    toneConfig.tone ||
    (toneConfig.customRules && toneConfig.customRules.length > 0)
  );

  // No tone config → use the standard static template
  if (!hasToneConfig) {
    return formatBetMessage(bet, template, toneConfig);
  }

  // Tone test (forceRegenerate): clear persisted copy to force fresh LLM generation
  if (forceRegenerate) {
    await updateGeneratedCopy(bet.id, null, groupId);
    // Clear the in-memory field so getOrGenerateMessage re-generates
    bet = { ...bet, generatedCopy: null };
  }

  if (toneConfig.examplePost || toneConfig.examplePosts?.length > 0) {
    // Full-message mode: use getOrGenerateMessage (persisted or fresh)
    return getOrGenerateMessage(bet, toneConfig, 0, groupId);
  }

  // No examplePost but has tone fields: use formatBetMessage's template structure
  // but force the LLM call by injecting a synthetic reasoning if needed
  if (!bet.reasoning) {
    const enrichedBet = {
      ...bet,
      reasoning: `Jogo entre ${bet.homeTeamName} e ${bet.awayTeamName}. Mercado: ${bet.betMarket}. ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds?.toFixed?.(2) || 'N/A'}.`,
    };
    return formatBetMessage(enrichedBet, template, toneConfig);
  }

  return formatBetMessage(bet, template, toneConfig);
}

/**
 * Fetch a specific bet by ID for preview.
 * @param {string} groupId - Group UUID (for multi-tenant security)
 * @param {string|number} betId - Bet ID
 * @returns {Promise<Array>}
 */
async function fetchBetById(groupId, betId) {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
      bet_group_assignments!inner ( group_id, generated_copy ),
      league_matches!inner ( home_team_name, away_team_name, kickoff_time )
    `)
    .eq('bet_group_assignments.group_id', groupId)
    .eq('id', betId)
    .limit(1);

  if (error) {
    logger.error('[previewService] Failed to fetch bet by ID', { groupId, betId, error: error.message });
    return { data: [], error };
  }

  return { data: data || [], error: null };
}

/**
 * Generate preview messages for a group.
 * Uses the real posting pipeline but without posting-readiness filters.
 *
 * @param {string} groupId - Group UUID
 * @param {string|number|null} betId - Optional specific bet ID to preview
 * @param {number[]|null} betIds - Optional array of bet IDs to preview (from posting queue)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function generatePreview(groupId, betId = null, betIds = null) {
  // 1. Load tone config fresh from DB
  const toneConfig = await loadToneConfig(groupId);

  // 2. Fetch bets: specific IDs from queue, single bet, or sample fallback
  let rawBets;
  if (betIds && betIds.length > 0) {
    // Batch mode: fetch specific bets from the posting queue (via junction table)
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
        bet_group_assignments!inner ( group_id, generated_copy ),
        league_matches!inner ( home_team_name, away_team_name, kickoff_time )
      `)
      .eq('bet_group_assignments.group_id', groupId)
      .in('id', betIds);

    if (error) {
      return { success: false, error: { code: 'DB_ERROR', message: `Erro ao buscar apostas: ${error.message}` } };
    }
    rawBets = data || [];
    if (rawBets.length === 0) {
      return { success: false, error: { code: 'BET_NOT_FOUND', message: 'Nenhuma aposta encontrada com os IDs informados' } };
    }
  } else if (betId) {
    const result = await fetchBetById(groupId, betId);
    if (result.error) {
      return { success: false, error: { code: 'DB_ERROR', message: `Erro ao buscar aposta: ${result.error.message}` } };
    }
    rawBets = result.data;
    if (rawBets.length === 0) {
      return { success: false, error: { code: 'BET_NOT_FOUND', message: 'Aposta não encontrada' } };
    }
  } else {
    rawBets = await fetchSampleBets(groupId);
  }

  if (rawBets.length === 0) {
    return { success: false, error: { code: 'NO_BETS', message: 'Nenhuma aposta encontrada neste grupo para gerar preview' } };
  }

  const bets = rawBets.map(mapBet);

  // 3. Generate previews in parallel (LLM calls are independent)
  // forceRegenerate: true for tone test (no betIds), false for posting queue preview
  const forceRegenerate = !betIds || betIds.length === 0;
  const previews = await Promise.all(bets.map(async (bet) => {
    const betInfo = {
      homeTeam: bet.homeTeamName,
      awayTeam: bet.awayTeamName,
      market: bet.betMarket,
      pick: bet.betPick,
      odds: bet.odds,
      kickoffTime: bet.kickoffTime,
      deepLink: bet.deepLink,
    };
    try {
      const preview = await formatPreviewMessage(bet, toneConfig, { forceRegenerate, groupId });
      return { betId: bet.id, preview, betInfo };
    } catch (err) {
      logger.error('[previewService] Failed to format bet', { betId: bet.id, groupId, error: err.message });
      return {
        betId: bet.id,
        preview: `🎯 ${bet.homeTeamName} x ${bet.awayTeamName}\n📊 ${bet.betMarket}\n💰 ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds?.toFixed(2) || 'N/A'}\n🔗 ${bet.deepLink || ''}`,
        betInfo,
      };
    }
  }));

  // 4. Load group name
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single();

  return {
    success: true,
    data: {
      groupId,
      groupName: group?.name || groupId,
      bets: previews,
    },
  };
}

module.exports = { generatePreview };

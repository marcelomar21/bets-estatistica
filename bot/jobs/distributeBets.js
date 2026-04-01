/**
 * Job: Distribute bets to active groups via round-robin
 * Story 5.1: Distribuição Round-robin de Apostas entre Grupos
 * Story 2.4 (GURU-45): Refactored to use bet_group_assignments junction table
 *
 * Distributes eligible bets among active groups using a deterministic
 * round-robin algorithm. Assignments are created in bet_group_assignments
 * (junction table) as the sole source of truth for distribution.
 *
 * Must run AFTER pipeline generates bets and BEFORE postBets.js
 *
 * Run: node bot/jobs/distributeBets.js
 */
require('dotenv').config();

const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { alertAdmin } = require('../services/alertService');

/**
 * Get all active groups ordered by created_at ASC (deterministic order)
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getActiveGroups() {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, status, created_at, enabled_modules')
      .eq('status', 'active')
      .contains('enabled_modules', ['distribution'])
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('[bets:distribute] Erro ao buscar grupos ativos', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[bets:distribute] Grupos ativos encontrados', { count: (data || []).length });
    return { success: true, data: data || [] };
  } catch (err) {
    logger.error('[bets:distribute] Erro inesperado ao buscar grupos', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Calculate the distribution window: today 00:00 BRT to end of tomorrow 23:59:59 BRT
 * @returns {{ startOfToday: string, endOfTomorrow: string }}
 */
function getDistributionWindow() {
  const now = new Date();
  const brFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = brFormatter.format(now);
  const startOfToday = new Date(`${todayStr}T00:00:00-03:00`).toISOString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = brFormatter.format(tomorrow);
  const endOfTomorrow = new Date(`${tomorrowStr}T23:59:59-03:00`).toISOString();

  return { startOfToday, endOfTomorrow };
}

/**
 * Get undistributed eligible bets ordered by kickoff_time ASC
 * Uses two-step query: first get assigned bet IDs from bet_group_assignments,
 * then query suggested_bets excluding those IDs.
 * Filtered to today+tomorrow window (BRT timezone)
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getUndistributedBets() {
  try {
    const { startOfToday, endOfTomorrow } = getDistributionWindow();

    // Step 1: Get all bet IDs that already have assignments in the junction table
    const { data: assignedRows, error: assignedError } = await supabase
      .from('bet_group_assignments')
      .select('bet_id');

    if (assignedError) {
      logger.error('[bets:distribute] Erro ao buscar assignments existentes', { error: assignedError.message });
      return { success: false, error: { code: 'DB_ERROR', message: assignedError.message } };
    }

    const assignedBetIds = (assignedRows || []).map((r) => r.bet_id);

    // Step 2: Query suggested_bets excluding assigned IDs
    let query = supabase
      .from('suggested_bets')
      .select('id, match_id, elegibilidade, distributed_at, bet_status, league_matches!inner(kickoff_time, league_seasons!inner(league_name))')
      .eq('elegibilidade', 'elegivel')
      .is('distributed_at', null)
      .neq('bet_status', 'posted')
      .gte('league_matches.kickoff_time', startOfToday)
      .lte('league_matches.kickoff_time', endOfTomorrow)
      .order('kickoff_time', { referencedTable: 'league_matches', ascending: true });

    if (assignedBetIds.length > 0) {
      query = query.not('id', 'in', `(${assignedBetIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[bets:distribute] Erro ao buscar apostas não distribuídas', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[bets:distribute] Apostas não distribuídas encontradas', { count: (data || []).length });
    return { success: true, data: data || [] };
  } catch (err) {
    logger.error('[bets:distribute] Erro inesperado ao buscar apostas', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Count distributed bets per group for TODAY only (BRT timezone).
 * Round-robin balances daily — historical counts are irrelevant.
 * @returns {Promise<object>} { groupId: count }
 */
async function getGroupBetCounts() {
  const { startOfToday } = getDistributionWindow();

  const { data, error } = await supabase
    .from('bet_group_assignments')
    .select('group_id')
    .gte('created_at', startOfToday);

  if (error) {
    logger.warn('[bets:distribute] Erro ao contar apostas por grupo', { error: error.message });
    return {};
  }

  const counts = {};
  for (const row of (data || [])) {
    counts[row.group_id] = (counts[row.group_id] || 0) + 1;
  }
  return counts;
}

/**
 * Get league preferences for all active groups.
 * Returns a Map: groupId → Map<league_name, enabled>
 * Groups with no preferences will have an empty map (= accept all).
 * @param {string[]} groupIds - Array of group UUIDs
 * @returns {Promise<Map<string, Map<string, boolean>>>}
 */
async function getAllGroupLeaguePreferences(groupIds) {
  const prefsMap = new Map();
  for (const gid of groupIds) {
    prefsMap.set(gid, new Map());
  }

  if (groupIds.length === 0) return prefsMap;

  try {
    const { data, error } = await supabase
      .from('group_league_preferences')
      .select('group_id, league_name, enabled')
      .in('group_id', groupIds);

    if (error) {
      logger.warn('[bets:distribute] Erro ao carregar preferências de liga', { error: error.message });
      return prefsMap; // Fallback: no filtering
    }

    for (const row of (data || [])) {
      const groupPrefs = prefsMap.get(row.group_id);
      if (groupPrefs) {
        groupPrefs.set(row.league_name, row.enabled);
      }
    }
  } catch (err) {
    logger.warn('[bets:distribute] Erro inesperado ao carregar preferências de liga', { error: err.message });
  }

  return prefsMap;
}

/**
 * Check if a group is eligible for a bet based on league preferences.
 * - If group has no preferences → eligible (retrocompatible)
 * - If league_name not in preferences → eligible (new league default)
 * - If league_name has enabled=false → NOT eligible
 * @param {Map<string, boolean>} groupPrefs - Group's league preferences
 * @param {string|null} leagueName - The bet's league name
 * @returns {boolean}
 */
function isGroupEligibleForBet(groupPrefs, leagueName) {
  // No preferences configured → accept all
  if (groupPrefs.size === 0) return true;
  // No league name on bet → accept (edge case)
  if (!leagueName) return true;
  // League not in preferences → treat as enabled (new league)
  if (!groupPrefs.has(leagueName)) return true;
  // Explicit preference
  return groupPrefs.get(leagueName) === true;
}

/**
 * Extract league_name from a bet's nested join data
 * @param {object} bet - Bet with league_matches.league_seasons.league_name
 * @returns {string|null}
 */
function getBetLeagueName(bet) {
  return bet?.league_matches?.league_seasons?.league_name || null;
}

/**
 * Rebalance distributed bets if new groups were added.
 * Checks if all active groups have assignments in the junction table.
 * If any active group has no assignments, deletes all non-posted assignments
 * so the round-robin can redistribute them evenly.
 * @param {Array} activeGroups - Active groups
 * @returns {Promise<{rebalanced: boolean, undistributed?: number, error?: object}>}
 */
async function rebalanceIfNeeded(activeGroups) {
  const activeGroupIds = activeGroups.map((g) => g.id);
  const { startOfToday } = getDistributionWindow();

  try {
    // Query non-posted assignments from today only
    const { data: assignments, error } = await supabase
      .from('bet_group_assignments')
      .select('id, bet_id, group_id, posting_status')
      .neq('posting_status', 'posted')
      .gte('created_at', startOfToday);

    if (error) {
      logger.error('[bets:distribute] Erro ao verificar rebalanceamento', { error: error.message });
      return { rebalanced: false, error };
    }

    if (!assignments || assignments.length === 0) {
      return { rebalanced: false };
    }

    const groupsWithBets = new Set(assignments.map((a) => a.group_id));
    const groupsWithoutBets = activeGroupIds.filter((id) => !groupsWithBets.has(id));

    if (groupsWithoutBets.length === 0) {
      return { rebalanced: false };
    }

    logger.info('[bets:distribute] Rebalanceamento: grupos sem apostas detectados', {
      groupsWithoutBets,
      totalToRedistribute: assignments.length,
    });

    // Delete non-posted assignments from junction table
    const assignmentIds = assignments.map((a) => a.id);
    const { error: deleteError } = await supabase
      .from('bet_group_assignments')
      .delete()
      .in('id', assignmentIds);

    if (deleteError) {
      logger.error('[bets:distribute] Erro no rebalanceamento', { error: deleteError.message });
      return { rebalanced: false, error: deleteError };
    }

    logger.info('[bets:distribute] Rebalanceamento concluído', { undistributed: assignmentIds.length });
    return { rebalanced: true, undistributed: assignmentIds.length };
  } catch (err) {
    logger.error('[bets:distribute] Erro inesperado no rebalanceamento', { error: err.message });
    return { rebalanced: false, error: { code: 'REBALANCE_ERROR', message: err.message } };
  }
}

/**
 * Distribute bets among groups using fair round-robin algorithm.
 * Supports per-group league filtering: each bet is only assigned to groups
 * that have the bet's league enabled (or have no preferences = accept all).
 *
 * @param {Array} bets - Undistributed bets (with league_matches.league_seasons.league_name)
 * @param {Array} groups - Active groups
 * @param {object} [groupCounts={}] - Existing bet counts per group { groupId: count }
 * @param {Map<string, Map<string, boolean>>} [leaguePrefs=null] - Per-group league preferences
 * @returns {Array<{betId: string, groupId: string}>} Assignment list
 */
function distributeRoundRobin(bets, groups, groupCounts = {}, leaguePrefs = null) {
  if (!bets.length || !groups.length) return [];

  // Track running counts during assignment
  const runningCounts = {};
  for (const g of groups) {
    runningCounts[g.id] = groupCounts[g.id] || 0;
  }

  const assignments = [];
  for (const bet of bets) {
    const leagueName = getBetLeagueName(bet);

    // Filter groups eligible for this bet based on league preferences
    let eligibleGroups = groups;
    if (leaguePrefs) {
      eligibleGroups = groups.filter((g) => {
        const prefs = leaguePrefs.get(g.id) || new Map();
        return isGroupEligibleForBet(prefs, leagueName);
      });
    }

    if (eligibleGroups.length === 0) {
      // No group wants this league — skip bet (stays unassigned)
      continue;
    }

    // Find eligible group with minimum bets (round-robin)
    let minGroup = eligibleGroups[0];
    let minCount = runningCounts[minGroup.id] ?? 0;
    for (const g of eligibleGroups) {
      const count = runningCounts[g.id] ?? 0;
      if (count < minCount) {
        minGroup = g;
        minCount = count;
      }
    }

    assignments.push({ betId: bet.id, groupId: minGroup.id });
    runningCounts[minGroup.id] = (runningCounts[minGroup.id] ?? 0) + 1;
  }

  return assignments;
}

/**
 * Assign a single bet to a group via junction table (idempotent via ON CONFLICT DO NOTHING)
 * @param {string} betId - Bet UUID
 * @param {string} groupId - Group UUID
 * @param {string|null} postAt - Optional posting time (HH:MM)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function assignBetToGroup(betId, groupId, postAt = null) {
  try {
    const insertPayload = {
      bet_id: betId,
      group_id: groupId,
      posting_status: 'ready',
    };
    if (postAt) {
      insertPayload.post_at = postAt;
    }

    const { data, error } = await supabase
      .from('bet_group_assignments')
      .upsert(insertPayload, { onConflict: 'bet_id,group_id', ignoreDuplicates: true })
      .select('id, bet_id, group_id, posting_status, post_at, created_at');

    if (error) {
      logger.error('[bets:distribute] Erro ao atribuir aposta', { betId, groupId, error: error.message });
      return { success: false, error: { code: 'DISTRIBUTION_ERROR', message: error.message } };
    }

    if (!data || data.length === 0) {
      logger.warn('[bets:distribute] Aposta já distribuída para este grupo', { betId, groupId });
      return { success: true, data: { alreadyDistributed: true } };
    }

    // Also update distributed_at on suggested_bets for backward compatibility
    await supabase
      .from('suggested_bets')
      .update({ distributed_at: new Date().toISOString() })
      .eq('id', betId)
      .is('distributed_at', null);

    logger.info('[bets:distribute] Aposta atribuída', { betId, groupId });
    return { success: true, data: data[0] };
  } catch (err) {
    logger.error('[bets:distribute] Erro inesperado ao atribuir aposta', { betId, groupId, error: err.message });
    return { success: false, error: { code: 'DISTRIBUTION_ERROR', message: err.message } };
  }
}

/**
 * Load posting schedule times for a group
 * @param {string} groupId - Group UUID
 * @returns {Promise<string[]>} Array of "HH:MM" strings
 */
async function loadGroupPostingTimes(groupId) {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('posting_schedule')
      .eq('id', groupId)
      .single();

    if (error || !data?.posting_schedule?.times) {
      return [];
    }
    return data.posting_schedule.times;
  } catch {
    return [];
  }
}

/**
 * Get future posting times for today, or all times if all have passed
 * @param {string[]} times - Array of "HH:MM" strings
 * @returns {string[]} Filtered times (future today, or all if none remain)
 */
function getFuturePostingTimes(times) {
  if (!times || times.length === 0) return [];

  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentMin = brTime.getHours() * 60 + brTime.getMinutes();

  const futureTimes = times.filter(t => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > currentMin;
  });

  // If all times have passed today, use all times (for tomorrow)
  return futureTimes.length > 0 ? futureTimes : times;
}

/**
 * Count bets already scheduled per time slot for a group from the junction table
 * @param {string} groupId - Group UUID
 * @param {string[]} times - Available posting times
 * @returns {Promise<object>} { "10:00": 3, "15:00": 1, ... }
 */
async function getScheduledCountsPerTime(groupId, times) {
  const counts = {};
  for (const t of times) {
    counts[t] = 0;
  }

  try {
    const { data } = await supabase
      .from('bet_group_assignments')
      .select('post_at')
      .eq('group_id', groupId)
      .not('post_at', 'is', null)
      .neq('posting_status', 'posted');

    for (const row of (data || [])) {
      if (counts[row.post_at] !== undefined) {
        counts[row.post_at]++;
      }
    }
  } catch {
    // On error, return zero counts — distribution will still work
  }

  return counts;
}

/**
 * Pick the best posting time for a bet using round-robin among available times
 * Prioritizes times with fewer already-scheduled bets
 * @param {string[]} availableTimes - Future posting times
 * @param {object} timeCounts - { "HH:MM": count } running tally
 * @returns {string|null} The chosen time, or null if no times available
 */
function pickPostTime(availableTimes, timeCounts) {
  if (!availableTimes || availableTimes.length === 0) return null;

  let minTime = availableTimes[0];
  let minCount = timeCounts[minTime] ?? 0;

  for (const t of availableTimes) {
    const count = timeCounts[t] ?? 0;
    if (count < minCount) {
      minTime = t;
      minCount = count;
    }
  }

  // Increment running count
  timeCounts[minTime] = (timeCounts[minTime] ?? 0) + 1;
  return minTime;
}

/**
 * Main job entry point: distribute bets via round-robin
 * Uses a lock to prevent concurrent executions from multiple schedulers.
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
let isDistributionInProgress = false;

async function runDistributeBets() {
  if (isDistributionInProgress) {
    logger.info('[bets:distribute] Skipping — distribution already in progress');
    return { success: true, data: { skipped: true, reason: 'already_in_progress' } };
  }

  isDistributionInProgress = true;
  try {
    return await _runDistributeBetsInternal();
  } finally {
    isDistributionInProgress = false;
  }
}

async function _runDistributeBetsInternal() {
  const startTime = Date.now();
  logger.info('[bets:distribute] Iniciando distribuição de apostas');

  // 1. Get active groups
  const groupsResult = await getActiveGroups();
  if (!groupsResult.success) {
    return groupsResult;
  }

  const groups = groupsResult.data;

  // 1.5 Rebalance if needed (e.g. new group was added)
  if (groups.length > 0) {
    const rebalanceResult = await rebalanceIfNeeded(groups);
    if (rebalanceResult.rebalanced) {
      logger.info('[bets:distribute] Rebalanceamento executado, prosseguindo com redistribuição');
    }
  }

  // No active groups: alert admin and return
  if (groups.length === 0) {
    logger.warn('[bets:distribute] Nenhum grupo ativo para distribuição', {});
    await alertAdmin(
      'WARN',
      'Nenhum grupo ativo para distribuição de apostas',
      'Nenhum grupo ativo para distribuição de apostas. Verifique se há grupos com status "active".'
    );
    return {
      success: true,
      data: { distributed: 0, reason: 'no_active_groups', duration: Date.now() - startTime },
    };
  }

  // 2. Get undistributed bets
  const betsResult = await getUndistributedBets();
  if (!betsResult.success) {
    return betsResult;
  }

  const bets = betsResult.data;

  // No bets to distribute: log and return
  if (bets.length === 0) {
    logger.info('[bets:distribute] Nenhuma aposta para distribuir', { groupCount: groups.length });
    return {
      success: true,
      data: { distributed: 0, reason: 'no_bets_to_distribute', groupCount: groups.length, duration: Date.now() - startTime },
    };
  }

  // 3. Calculate round-robin assignments with league filtering
  const groupCounts = await getGroupBetCounts();
  logger.info('[bets:distribute] Contagem de apostas por grupo', { groupCounts });

  // Load league preferences for all groups (Story 19.2)
  const groupIds = groups.map((g) => g.id);
  const leaguePrefs = await getAllGroupLeaguePreferences(groupIds);

  const groupsWithPrefs = Array.from(leaguePrefs.entries()).filter(([, prefs]) => prefs.size > 0);
  if (groupsWithPrefs.length > 0) {
    logger.info('[bets:distribute] Preferências de liga carregadas', {
      groupsWithPrefs: groupsWithPrefs.length,
      details: Object.fromEntries(groupsWithPrefs.map(([gid, prefs]) => [gid, prefs.size])),
    });
  }

  const assignments = distributeRoundRobin(bets, groups, groupCounts, leaguePrefs);

  // Log skipped bets (no eligible group due to league preferences)
  const skippedCount = bets.length - assignments.length;
  if (skippedCount > 0) {
    logger.info('[bets:distribute] Apostas sem grupo elegível (liga desativada em todos os grupos)', {
      skippedCount,
      totalBets: bets.length,
      assignedCount: assignments.length,
    });
  }

  // 3.5. Pre-load posting times per group for auto-scheduling
  const groupTimesCache = {};
  const groupTimeCountsCache = {};
  for (const group of groups) {
    const times = await loadGroupPostingTimes(group.id);
    const availableTimes = getFuturePostingTimes(times);
    groupTimesCache[group.id] = availableTimes;
    groupTimeCountsCache[group.id] = await getScheduledCountsPerTime(group.id, availableTimes);
  }

  // 4. Execute assignments
  let successCount = 0;
  let failCount = 0;
  const perGroup = {};

  for (const { betId, groupId } of assignments) {
    // Auto-assign post_at via round-robin among available times
    const availableTimes = groupTimesCache[groupId] || [];
    const timeCounts = groupTimeCountsCache[groupId] || {};
    const postAt = pickPostTime(availableTimes, timeCounts);

    const result = await assignBetToGroup(betId, groupId, postAt);
    if (result.success && !result.data.alreadyDistributed) {
      successCount++;
      perGroup[groupId] = (perGroup[groupId] || 0) + 1;
    } else if (!result.success) {
      failCount++;
    }
    // alreadyDistributed is counted as success but not in successCount
  }

  // 5. Summary log
  const summary = {
    distributed: successCount,
    failed: failCount,
    groupCount: groups.length,
    perGroup,
    duration: Date.now() - startTime,
  };

  if (failCount > 0) {
    logger.error('[bets:distribute] Distribuição concluída com falhas', summary);
    try {
      await alertAdmin(
        'ERROR',
        'Falhas na distribuição de apostas',
        `Distribuição parcial: ${successCount} sucesso(s), ${failCount} falha(s). Verifique os logs [bets:distribute].`
      );
    } catch (alertErr) {
      logger.error('[bets:distribute] Falha ao alertar admin sobre erro de distribuição', { error: alertErr.message });
    }

    return {
      success: false,
      error: {
        code: 'PARTIAL_DISTRIBUTION_FAILURE',
        message: `Falha ao distribuir ${failCount} aposta(s)`,
      },
      data: summary,
    };
  }

  logger.info('[bets:distribute] Distribuição concluída', summary);
  return { success: true, data: summary };
}

// CLI execution
if (require.main === module) {
  runDistributeBets()
    .then((result) => {
      if (result.success) {
        logger.info('[bets:distribute] Job finalizado com sucesso', result.data);
      } else {
        logger.error('[bets:distribute] Job finalizado com erro', result.error);
        process.exit(1);
      }
    })
    .catch((err) => {
      logger.error('[bets:distribute] Erro fatal', { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  runDistributeBets,
  getActiveGroups,
  getUndistributedBets,
  getDistributionWindow,
  getGroupBetCounts,
  getAllGroupLeaguePreferences,
  isGroupEligibleForBet,
  getBetLeagueName,
  rebalanceIfNeeded,
  distributeRoundRobin,
  assignBetToGroup,
  getScheduledCountsPerTime,
};

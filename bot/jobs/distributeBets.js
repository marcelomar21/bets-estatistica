/**
 * Job: Distribute bets to active groups via round-robin
 * Story 5.1: Distribuição Round-robin de Apostas entre Grupos
 *
 * Distributes eligible bets (elegibilidade='elegivel', group_id IS NULL,
 * distributed_at IS NULL, bet_status != 'posted') among active groups
 * using a deterministic round-robin algorithm.
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
      .select('id, name, status, created_at')
      .eq('status', 'active')
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
 * Only returns bets with group_id IS NULL and distributed_at IS NULL
 * Filtered to today+tomorrow window (BRT timezone)
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getUndistributedBets() {
  try {
    const { startOfToday, endOfTomorrow } = getDistributionWindow();

    const { data, error } = await supabase
      .from('suggested_bets')
      .select('id, match_id, elegibilidade, group_id, distributed_at, bet_status, kickoff_time')
      .eq('elegibilidade', 'elegivel')
      .is('group_id', null)
      .is('distributed_at', null)
      .neq('bet_status', 'posted')
      .gte('kickoff_time', startOfToday)
      .lte('kickoff_time', endOfTomorrow)
      .order('kickoff_time', { ascending: true });

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
 * Rebalance distributed bets if new groups were added.
 * Checks if all active groups have bets in the current window.
 * If any active group has no bets, undistributes all non-posted bets
 * so the round-robin can redistribute them evenly.
 * @param {Array} activeGroups - Active groups
 * @returns {Promise<{rebalanced: boolean, undistributed?: number, error?: object}>}
 */
async function rebalanceIfNeeded(activeGroups) {
  const { startOfToday, endOfTomorrow } = getDistributionWindow();
  const activeGroupIds = activeGroups.map((g) => g.id);

  try {
    const { data: distributedBets, error } = await supabase
      .from('suggested_bets')
      .select('id, group_id')
      .eq('elegibilidade', 'elegivel')
      .not('group_id', 'is', null)
      .neq('bet_status', 'posted')
      .gte('kickoff_time', startOfToday)
      .lte('kickoff_time', endOfTomorrow);

    if (error) {
      logger.error('[bets:distribute] Erro ao verificar rebalanceamento', { error: error.message });
      return { rebalanced: false, error };
    }

    if (!distributedBets || distributedBets.length === 0) {
      return { rebalanced: false };
    }

    const groupsWithBets = new Set(distributedBets.map((b) => b.group_id));
    const groupsWithoutBets = activeGroupIds.filter((id) => !groupsWithBets.has(id));

    if (groupsWithoutBets.length === 0) {
      return { rebalanced: false };
    }

    logger.info('[bets:distribute] Rebalanceamento: grupos sem apostas detectados', {
      groupsWithoutBets,
      totalToRedistribute: distributedBets.length,
    });

    const betIds = distributedBets.map((b) => b.id);
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({ group_id: null, distributed_at: null })
      .in('id', betIds)
      .neq('bet_status', 'posted');

    if (updateError) {
      logger.error('[bets:distribute] Erro no rebalanceamento', { error: updateError.message });
      return { rebalanced: false, error: updateError };
    }

    logger.info('[bets:distribute] Rebalanceamento concluído', { undistributed: betIds.length });
    return { rebalanced: true, undistributed: betIds.length };
  } catch (err) {
    logger.error('[bets:distribute] Erro inesperado no rebalanceamento', { error: err.message });
    return { rebalanced: false, error: { code: 'REBALANCE_ERROR', message: err.message } };
  }
}

/**
 * Distribute bets among groups using round-robin algorithm
 * Pure function - deterministic and testable
 * @param {Array} bets - Undistributed bets
 * @param {Array} groups - Active groups
 * @returns {Array<{betId: string, groupId: string}>} Assignment list
 */
function distributeRoundRobin(bets, groups) {
  if (!bets.length || !groups.length) return [];

  return bets.map((bet, i) => ({
    betId: bet.id,
    groupId: groups[i % groups.length].id,
  }));
}

/**
 * Assign a single bet to a group (idempotent via group_id IS NULL check)
 * @param {string} betId - Bet UUID
 * @param {string} groupId - Group UUID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function assignBetToGroup(betId, groupId) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .update({
        group_id: groupId,
        distributed_at: new Date().toISOString(),
      })
      .eq('id', betId)
      .is('group_id', null)
      .select('id, group_id, distributed_at');

    if (error) {
      logger.error('[bets:distribute] Erro ao atribuir aposta', { betId, groupId, error: error.message });
      return { success: false, error: { code: 'DISTRIBUTION_ERROR', message: error.message } };
    }

    if (!data || data.length === 0) {
      logger.warn('[bets:distribute] Aposta já distribuída ou não encontrada', { betId });
      return { success: true, data: { alreadyDistributed: true } };
    }

    logger.info('[bets:distribute] Aposta atribuída', { betId, groupId });
    return { success: true, data: data[0] };
  } catch (err) {
    logger.error('[bets:distribute] Erro inesperado ao atribuir aposta', { betId, groupId, error: err.message });
    return { success: false, error: { code: 'DISTRIBUTION_ERROR', message: err.message } };
  }
}

/**
 * Main job entry point: distribute bets via round-robin
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function runDistributeBets() {
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

  // 3. Calculate round-robin assignments
  const assignments = distributeRoundRobin(bets, groups);

  // 4. Execute assignments
  let successCount = 0;
  let failCount = 0;
  const perGroup = {};

  for (const { betId, groupId } of assignments) {
    const result = await assignBetToGroup(betId, groupId);
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
  rebalanceIfNeeded,
  distributeRoundRobin,
  assignBetToGroup,
};

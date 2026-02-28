/**
 * Failover Service — Story 16-1
 * Orchestrates automatic failover when a WhatsApp number is banned.
 *
 * Flow:
 * 1. Ban the number (status → banned, dealloc from group)
 * 2. Promote first backup to active
 * 3. Allocate new backup from pool (if available)
 * 4. Alert admin with details
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { handleBan, checkPoolHealth } = require('../pool/numberPoolService');
const { alertAdmin } = require('../../bot/services/alertService');

/**
 * Execute failover for a banned number.
 * @param {string} numberId - UUID of the banned number
 * @param {string} groupId - UUID of the group that lost its active number
 * @param {string} reason - 'ban' | 'unhealthy'
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handleFailover(numberId, groupId, reason = 'ban') {
  logger.info('[failover] Starting failover', { numberId, groupId, reason });

  if (!numberId || !groupId) {
    return { success: false, error: { code: 'INVALID_INPUT', message: 'numberId and groupId are required' } };
  }

  // 1. Ban the number (dealloc from group, mark as banned)
  const banResult = await handleBan(numberId);
  if (!banResult.success) {
    logger.error('[failover] Failed to ban number', { numberId, error: banResult.error });
    return { success: false, error: banResult.error };
  }

  const bannedPhone = banResult.data?.phone_number || numberId;

  // 2. Find first backup for this group
  const { data: backups, error: backupErr } = await supabase
    .from('whatsapp_numbers')
    .select('id, phone_number, role')
    .eq('group_id', groupId)
    .eq('role', 'backup')
    .order('created_at', { ascending: true })
    .limit(1);

  if (backupErr) {
    logger.error('[failover] Failed to query backups', { groupId, error: backupErr.message });
    await _alertFailoverFailed(groupId, bannedPhone, 'DB_ERROR');
    return { success: false, error: { code: 'DB_ERROR', message: backupErr.message } };
  }

  if (!backups || backups.length === 0) {
    logger.warn('[failover] No backup available for group', { groupId });
    await _alertNoBackup(groupId, bannedPhone);
    return { success: false, error: { code: 'NO_BACKUP', message: 'No backup number available for failover' } };
  }

  const backup = backups[0];

  // 3. Promote backup to active
  const { data: promoted, error: promoteErr } = await supabase
    .from('whatsapp_numbers')
    .update({
      role: 'active',
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', backup.id)
    .eq('role', 'backup') // optimistic lock
    .select()
    .single();

  if (promoteErr) {
    logger.error('[failover] Failed to promote backup', { backupId: backup.id, error: promoteErr.message });
    await _alertFailoverFailed(groupId, bannedPhone, 'PROMOTE_FAILED');
    return { success: false, error: { code: 'PROMOTE_FAILED', message: promoteErr.message } };
  }

  logger.info('[failover] Backup promoted to active', {
    groupId,
    promotedId: promoted.id,
    promotedPhone: promoted.phone_number,
    bannedPhone,
  });

  // 4. Allocate new backup from pool
  let newBackup = null;
  const { data: availableNumbers, error: poolErr } = await supabase
    .from('whatsapp_numbers')
    .select('id, phone_number')
    .eq('status', 'available')
    .is('group_id', null)
    .order('created_at', { ascending: true })
    .limit(1);

  if (poolErr) {
    logger.warn('[failover] Failed to query pool for new backup', { error: poolErr.message });
  } else if (!availableNumbers || availableNumbers.length === 0) {
    logger.warn('[failover] Pool empty — no backup replacement available', { groupId });
  } else {
    const candidate = availableNumbers[0];
    const { data: allocated, error: allocErr } = await supabase
      .from('whatsapp_numbers')
      .update({
        group_id: groupId,
        role: 'backup',
        status: 'backup',
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'available') // optimistic lock
      .is('group_id', null)
      .select()
      .single();

    if (allocErr) {
      logger.warn('[failover] Failed to allocate new backup', { candidateId: candidate.id, error: allocErr.message });
    } else {
      newBackup = allocated;
      logger.info('[failover] New backup allocated', { groupId, backupId: allocated.id, phone: allocated.phone_number });
    }
  }

  // 5. Check pool health and alert
  const poolHealth = await checkPoolHealth();
  await _alertFailoverSuccess(groupId, bannedPhone, promoted.phone_number, newBackup, poolHealth?.data);

  return {
    success: true,
    data: {
      bannedNumber: bannedPhone,
      promotedNumber: promoted.phone_number,
      promotedId: promoted.id,
      newBackup: newBackup?.phone_number || null,
      poolHealthy: poolHealth?.data?.healthy ?? null,
    },
  };
}

/**
 * Alert admin on successful failover.
 */
async function _alertFailoverSuccess(groupId, bannedPhone, promotedPhone, newBackup, poolData) {
  let msg = `FAILOVER AUTOMATICO EXECUTADO\n\n`;
  msg += `Grupo: ${groupId}\n`;
  msg += `Numero banido: ${bannedPhone}\n`;
  msg += `Novo ativo: ${promotedPhone}\n`;
  if (newBackup) {
    msg += `Novo backup alocado: ${newBackup.phone_number}\n`;
  } else {
    msg += `ATENCAO: Nenhum backup foi alocado (pool vazio)\n`;
  }
  if (poolData) {
    msg += `\nPool: ${poolData.available} numeros disponiveis`;
    if (!poolData.healthy) {
      msg += ` (BAIXO — abaixo do limite de ${poolData.threshold})`;
    }
  }

  try {
    await alertAdmin(msg);
  } catch (err) {
    logger.warn('[failover] Failed to send admin alert', { error: err.message });
  }
}

/**
 * Alert admin when failover fails.
 */
async function _alertFailoverFailed(groupId, bannedPhone, errorCode) {
  const msg = `ERRO DE FAILOVER\n\nGrupo: ${groupId}\nNumero banido: ${bannedPhone}\nErro: ${errorCode}\n\nIntervencao manual necessaria.`;
  try {
    await alertAdmin(msg);
  } catch (err) {
    logger.warn('[failover] Failed to send failure alert', { error: err.message });
  }
}

/**
 * Alert admin when no backup is available.
 */
async function _alertNoBackup(groupId, bannedPhone) {
  const msg = `FAILOVER IMPOSSIVEL — SEM BACKUP\n\nGrupo: ${groupId}\nNumero banido: ${bannedPhone}\n\nNenhum numero backup disponivel para assumir. Intervencao manual necessaria.`;
  try {
    await alertAdmin(msg);
  } catch (err) {
    logger.warn('[failover] Failed to send no-backup alert', { error: err.message });
  }
}

module.exports = { handleFailover };

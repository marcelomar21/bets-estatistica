/**
 * Job: Reconciliation - Daily sync check between local DB and Cakto API
 * Story 16.8: Implementar Reconciliacao com Cakto
 *
 * Compares member status in Supabase with subscription status from Cakto API.
 * Does NOT auto-correct - only alerts admin for manual review.
 *
 * Run: node bot/jobs/membership/reconciliation.js
 * Schedule: 03:00 BRT daily
 */
require('dotenv').config();

const logger = require('../../../lib/logger');
const { sleep } = require('../../../lib/utils');
const { alertAdmin } = require('../../services/alertService');
const { getMembersForReconciliation } = require('../../services/memberService');
const { getSubscription } = require('../../services/caktoService');

const JOB_NAME = 'membership:reconciliation';
const RATE_LIMIT_MS = 100; // 10 req/s
// L1 FIX: Document that this is exported for testing/tuning
const PROGRESS_LOG_INTERVAL = 100; // Log every 100 members

// M3 FIX: Extract bad statuses as constant for clarity
const BAD_CAKTO_STATUSES = ['canceled', 'cancelled', 'expired', 'defaulted', 'suspended'];

// Lock to prevent concurrent runs (in-memory, same process)
let reconciliationRunning = false;

/**
 * Check if member is desynchronized with Cakto
 * @param {string} localStatus - Member status in Supabase
 * @param {string} caktoStatus - Subscription status from Cakto
 * @returns {{desync: boolean, action: string|null}}
 */
function isDesynchronized(localStatus, caktoStatus) {
  // Trial members are ignored (no subscription yet)
  if (localStatus === 'trial') {
    return { desync: false, action: null };
  }

  // Active member should have active subscription
  if (localStatus === 'ativo') {
    // M3 FIX: Use extracted constant
    if (BAD_CAKTO_STATUSES.includes(caktoStatus?.toLowerCase())) {
      return {
        desync: true,
        action: caktoStatus === 'canceled' || caktoStatus === 'cancelled'
          ? 'Verificar se deve remover membro'
          : 'Verificar pagamento/cobranca'
      };
    }
  }

  return { desync: false, action: null };
}

/**
 * Format and send desync alert to admin group
 * @param {Array} members - Desynchronized members with caktoStatus and suggestedAction
 */
async function sendDesyncAlert(members) {
  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const lines = members.map(m =>
    `@${m.telegram_username || 'sem_username'} (${m.telegram_id})\n   Local: ${m.status} | Cakto: ${m.caktoStatus}\n   Acao: ${m.suggestedAction}`
  );

  const message = `*DESSINCRONIZACAO DETECTADA*

Job: Reconciliacao 03:00 BRT
Data: ${today}

*${members.length} membro(s) com estado divergente:*

${lines.join('\n\n')}

---
Acao: Verificacao manual necessaria`;

  await alertAdmin(message);
  logger.info(`[${JOB_NAME}] Alerta de dessincronizacao enviado`, { count: members.length });
}

/**
 * Format and send critical failure alert
 * @param {object} stats - Job statistics
 * @param {Array} errors - Error details
 */
async function sendCriticalFailureAlert(stats, errors) {
  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const failureRate = ((stats.failed / stats.total) * 100).toFixed(1);

  // Aggregate errors by type
  const errorCounts = errors.reduce((acc, e) => {
    acc[e.error] = (acc[e.error] || 0) + 1;
    return acc;
  }, {});

  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => `${code}: ${count}`)
    .join(', ');

  const message = `*FALHA CRITICA - RECONCILIACAO*

Job: Reconciliacao 03:00 BRT
Data: ${today}

*API Cakto com problemas*

Verificados: ${stats.total}
Falhas: ${stats.failed} (${failureRate}%)
Sincronizados: ${stats.synced}

Erros mais frequentes: ${topErrors || 'N/A'}

Acao: Verificar status da API Cakto`;

  await alertAdmin(message);
  logger.error(`[${JOB_NAME}] Alerta critico enviado`, { failureRate, topErrors });
}

/**
 * Main reconciliation processor (internal implementation)
 * L2 FIX: Detailed JSDoc for internal function
 *
 * This function performs the actual reconciliation logic:
 * 1. Fetches all active members with cakto_subscription_id
 * 2. Queries Cakto API for each subscription status (with rate limiting)
 * 3. Compares local status with Cakto status using isDesynchronized()
 * 4. Sends alerts for any desynchronizations found
 * 5. Sends critical alert if > 50% of API calls fail
 *
 * @private
 * @returns {Promise<{success: boolean, total?: number, synced?: number, desynced?: number, failed?: number, error?: string}>}
 * - success: true if job completed (even with desyncs), false if critical error
 * - total: total members checked
 * - synced: members with matching status
 * - desynced: members with mismatched status (including NOT_FOUND)
 * - failed: API failures (network errors, timeouts)
 * - error: error message if success is false
 */
async function _runReconciliationInternal() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  logger.info(`[${JOB_NAME}] Starting`, { date: today });

  const stats = {
    total: 0,
    synced: 0,
    desynced: 0,
    failed: 0,
  };
  const desyncedMembers = [];
  const errors = [];

  try {
    // 1. Fetch members to verify
    const membersResult = await getMembersForReconciliation();
    if (!membersResult.success) {
      logger.error(`[${JOB_NAME}] Falha ao buscar membros`, { error: membersResult.error });
      return { success: false, error: membersResult.error.message };
    }

    const members = membersResult.data;
    stats.total = members.length;

    if (stats.total === 0) {
      logger.info(`[${JOB_NAME}] Nenhum membro para verificar`);
      return { success: true, ...stats };
    }

    logger.info(`[${JOB_NAME}] Verificando ${stats.total} membros`);

    // 2. Verify each member with rate limiting
    for (let i = 0; i < members.length; i++) {
      const member = members[i];

      // Progress logging
      if ((i + 1) % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(`[${JOB_NAME}] Progresso: ${i + 1}/${stats.total}`);
      }

      // Rate limiting
      await sleep(RATE_LIMIT_MS);

      const caktoResult = await getSubscription(member.cakto_subscription_id);

      // Handle SUBSCRIPTION_NOT_FOUND as desync
      if (!caktoResult.success) {
        if (caktoResult.error?.code === 'SUBSCRIPTION_NOT_FOUND') {
          // Subscription deleted in Cakto = desync
          stats.desynced++;
          desyncedMembers.push({
            ...member,
            caktoStatus: 'NOT_FOUND',
            suggestedAction: 'Assinatura nao existe no Cakto - verificar se deve remover'
          });
        } else {
          // API error
          stats.failed++;
          errors.push({ memberId: member.id, error: caktoResult.error.code });
        }
        continue;
      }

      // 3. Compare status
      const caktoStatus = caktoResult.data.status;
      const { desync, action } = isDesynchronized(member.status, caktoStatus);

      if (desync) {
        stats.desynced++;
        desyncedMembers.push({
          ...member,
          caktoStatus,
          suggestedAction: action
        });
      } else {
        stats.synced++;
      }
    }

    // 4. Send alerts if needed (silent success if all OK)
    if (desyncedMembers.length > 0) {
      await sendDesyncAlert(desyncedMembers);
    }

    // 5. Critical alert if too many failures (> 50%)
    const failureRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;
    if (failureRate > 50) {
      await sendCriticalFailureAlert(stats, errors);
    }

    const duration = Date.now() - startTime;
    logger.info(`[${JOB_NAME}] Complete`, { ...stats, durationMs: duration });

    return { success: true, ...stats };
  } catch (err) {
    logger.error(`[${JOB_NAME}] Unexpected error`, { error: err.message });
    return { success: false, ...stats, error: err.message };
  }
}

/**
 * Main entry point - runs reconciliation with lock
 * @returns {Promise<{success: boolean, total?: number, synced?: number, desynced?: number, failed?: number, skipped?: boolean, error?: string}>}
 */
async function runReconciliation() {
  // Prevent concurrent runs
  if (reconciliationRunning) {
    logger.debug(`[${JOB_NAME}] Already running, skipping`);
    return { success: true, skipped: true };
  }
  reconciliationRunning = true;

  try {
    return await _runReconciliationInternal();
  } finally {
    reconciliationRunning = false;
  }
}

// Run if called directly
if (require.main === module) {
  runReconciliation()
    .then(result => {
      logger.info(`[${JOB_NAME}] CLI result`, result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      logger.error(`[${JOB_NAME}] CLI failed`, { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  runReconciliation,
  isDesynchronized,
  sendDesyncAlert,
  sendCriticalFailureAlert,
  // L1 FIX: Export constants for testing/tuning
  PROGRESS_LOG_INTERVAL,
  BAD_CAKTO_STATUSES,
  // For testing
  _runReconciliationInternal,
};

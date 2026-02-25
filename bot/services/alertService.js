/**
 * Alert Service - Centralized alerting to admin group
 */
const { alertAdmin, sendToAdmin } = require('../telegram');
const logger = require('../../lib/logger');
const config = require('../../lib/config');

// Debounce cache for webhook alerts (prevents flooding)
const webhookAlertCache = new Map();
const WEBHOOK_ALERT_DEBOUNCE_MINUTES = 5;

// Debounce cache for job failure alerts
const jobAlertCache = new Map();
const JOB_ALERT_DEBOUNCE_MINUTES = 60;

/**
 * Check if webhook alert can be sent (debounce logic)
 * Prevents sending the same event alert within WEBHOOK_ALERT_DEBOUNCE_MINUTES
 * @param {string} eventId - Event idempotency key
 * @returns {boolean} - true if alert can be sent
 */
function canSendWebhookAlert(eventId) {
  const cacheKey = `webhook_${eventId}`;
  const lastSent = webhookAlertCache.get(cacheKey);
  const now = Date.now();
  const debounceMs = WEBHOOK_ALERT_DEBOUNCE_MINUTES * 60 * 1000;

  if (lastSent && (now - lastSent) < debounceMs) {
    const minutesAgo = Math.round((now - lastSent) / 60000);
    logger.debug('[alertService] Webhook alert debounced', { eventId, lastSentAgo: `${minutesAgo}min` });
    return false;
  }

  webhookAlertCache.set(cacheKey, now);
  return true;
}

/**
 * Check if job failure alert can be sent (debounce logic)
 * Prevents sending the same job alert within JOB_ALERT_DEBOUNCE_MINUTES
 * @param {string} jobName - Job name
 * @returns {boolean} - true if alert can be sent
 */
function canSendJobAlert(jobName) {
  const cacheKey = `job_${jobName}`;
  const lastSent = jobAlertCache.get(cacheKey);
  const now = Date.now();
  const debounceMs = JOB_ALERT_DEBOUNCE_MINUTES * 60 * 1000;

  if (lastSent && (now - lastSent) < debounceMs) {
    logger.debug('[alertService] Job alert debounced', { jobName });
    return false;
  }

  jobAlertCache.set(cacheKey, now);
  return true;
}

/**
 * Send job failure alert to admin group
 * Uses debounce pattern to prevent flooding admin with duplicate alerts
 * @param {string} jobName - Job name that failed
 * @param {string} errorMessage - Error details
 * @param {string} executionId - Execution ID from job_executions table
 * @returns {Promise<{success: boolean, debounced?: boolean}>}
 */
async function jobFailureAlert(jobName, errorMessage, executionId, botCtx = null) {
  if (!canSendJobAlert(jobName)) {
    logger.info('[alertService] Job failure alert debounced', { jobName, executionId });
    return { success: true, debounced: true };
  }

  const text = `
🔴 *JOB FAILED*

📋 *Job:* ${jobName}
🔑 *ID:* \`${executionId || 'N/A'}\`

❌ *Erro:*
${errorMessage}

🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send API error alert
 * @param {string} service - Service name (e.g., 'The Odds API', 'FootyStats')
 * @param {string} errorMessage - Error details
 * @param {number} attempts - Number of retry attempts made
 */
async function apiErrorAlert(service, errorMessage, attempts, botCtx = null) {
  return alertAdmin(
    'ERROR',
    `${service} falhou após ${attempts} tentativas: ${errorMessage}`,
    `O serviço ${service} está com problemas. As apostas podem não ter odds atualizadas.`,
    botCtx
  );
}

/**
 * Send database error alert
 * @param {string} operation - Operation that failed
 * @param {string} errorMessage - Error details
 */
async function dbErrorAlert(operation, errorMessage, botCtx = null) {
  return alertAdmin(
    'ERROR',
    `DB Error em ${operation}: ${errorMessage}`,
    `Problema no banco de dados. Verifique o Supabase.`,
    botCtx
  );
}

/**
 * Send link reminder to admin
 * @param {object} bet - Bet object
 * @param {number} reminderNumber - Which reminder this is (1, 2, 3...)
 */
async function linkReminderAlert(bet, reminderNumber, botCtx = null) {
  const emoji = reminderNumber >= 3 ? '🔴' : '🟡';

  const text = `
${emoji} *LEMBRETE #${reminderNumber}*

⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*
📊 ${bet.betMarket}: ${bet.betPick}
💰 Odd esperada: ~${bet.odds}

⏰ Preciso do link para postar!

Responda com o link da aposta (Bet365 ou Betano).
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send link request to admin group
 * @param {Array} bets - Array of bets needing links
 * @param {string} period - Period (morning, afternoon, night)
 */
async function requestLinksAlert(bets, period, botCtx = null) {
  const periodNames = {
    morning: 'MANHÃ (10h)',
    afternoon: 'TARDE (15h)',
    night: 'NOITE (22h)',
  };

  const betsList = bets.map((bet, i) => `
${i + 1}. *${bet.homeTeamName} x ${bet.awayTeamName}*
   📊 ${bet.betMarket}: ${bet.betPick}
   💰 Odd: ${bet.odds?.toFixed(2) || 'N/A'}
   🆔 ID: \`${bet.id}\`
  `).join('\n');

  const text = `
🎯 *LINKS NECESSÁRIOS - ${periodNames[period] || period}*

${betsList}

📝 Responda com:
\`ID: link_da_aposta\`

Exemplo: \`123: https://bet365.com/...\`
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Confirm link received
 * @param {object} bet - Bet object
 */
async function confirmLinkReceived(bet, botCtx = null) {
  const text = `
✅ *Link recebido!*

⚽ ${bet.homeTeamName} x ${bet.awayTeamName}
📊 ${bet.betMarket}: ${bet.betPick}
🔗 Link salvo com sucesso
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send success/failure tracking update
 * @param {object} bet - Bet with result
 * @param {boolean} won - Whether bet won
 */
async function trackingResultAlert(bet, won, botCtx = null) {
  const emoji = won ? '✅' : '❌';
  const result = won ? 'ACERTOU' : 'ERROU';

  const text = `
${emoji} *RESULTADO: ${result}*

⚽ ${bet.homeTeamName} x ${bet.awayTeamName}
📊 ${bet.betMarket}: ${bet.betPick}
💰 Odd: ${bet.oddsAtPost?.toFixed(2)}
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send posting failure alert with operator mention
 * @param {string} period - Which posting period failed (morning/afternoon/night or hour like "10h")
 * @param {string} detectedAt - When the failure was detected
 * @param {string} reason - Reason for failure (optional)
 */
async function postingFailureAlert(period, detectedAt, reason = null, botCtx = null) {
  const operatorUsername = config.membership?.operatorUsername || 'operador';

  const reasonText = reason ? `\n📋 Motivo: ${reason}` : '';

  const text = `
🚨 *ALERTA DE SISTEMA*

@${operatorUsername} Problema detectado!

❌ *Falha:* Postagem das ${period} não executada
⏰ *Detectado:* ${detectedAt}${reasonText}
💡 *Ação:* Use /postar para forçar

\`/status\` para mais detalhes
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send webhook processing failure alert (AC5)
 * Story 16.3: Added for webhook processing alerts
 * Uses debounce pattern to prevent flooding admin with duplicate alerts
 * @param {string} eventId - Event idempotency key
 * @param {string} eventType - Type of webhook event
 * @param {string} errorMessage - Error details
 * @param {number} attempts - Number of processing attempts made
 * @returns {Promise<{success: boolean, debounced?: boolean}>}
 */
async function webhookProcessingAlert(eventId, eventType, errorMessage, attempts, botCtx = null) {
  // Debounce check - prevent duplicate alerts for same event
  if (!canSendWebhookAlert(eventId)) {
    logger.info('[alertService] webhookProcessingAlert: debounced', { eventId });
    return { success: true, debounced: true };
  }

  const text = `
🔴 *WEBHOOK PROCESSING FAILED*

📋 *Evento:* ${eventType}
🔑 *ID:* \`${eventId}\`
🔄 *Tentativas:* ${attempts}

❌ *Erro:*
${errorMessage}

💡 *Ação:* Verifique os logs e considere reprocessar manualmente se necessário.

🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send health check alert
 * @param {Array} alerts - Array of alert objects { severity, check, message, action }
 * @param {boolean} hasErrors - Whether any errors (vs just warnings)
 */
async function healthCheckAlert(alerts, hasErrors, botCtx = null) {
  const emoji = hasErrors ? '🔴' : '🟡';
  const type = hasErrors ? 'ERROR' : 'WARN';

  const alertsList = alerts.map(a => {
    const sev = a.severity === 'error' ? '🔴' : '🟡';
    return `${sev} *${a.check}*\n   └ ${a.message}\n   └ _${a.action}_`;
  }).join('\n\n');

  const text = `
${emoji} *HEALTH CHECK: ${type}*

${alertsList}

🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

/**
 * Send tracking summary alert to admin group
 * Shows results tracked and 7-day success rate
 * @param {object} results - { tracked, success, failure, unknown }
 * @param {object} rate7Days - { rate, successCount, total } or null
 */
async function trackingSummaryAlert(results, rate7Days, botCtx = null) {
  const { tracked, success, failure, unknown } = results;

  if (tracked === 0) {
    return { success: true, skipped: true };
  }

  const rateText = rate7Days?.rate !== null
    ? `${rate7Days.rate.toFixed(1)}% (${rate7Days.successCount}/${rate7Days.total})`
    : 'N/A';

  const text = `
📊 *RESULTADOS ATUALIZADOS*

🎯 *Avaliados agora:* ${tracked}
   ✅ Acertos: ${success}
   ❌ Erros: ${failure}${unknown > 0 ? `\n   ❓ Inconclusivos: ${unknown}` : ''}

📈 *Taxa últimos 7 dias:* ${rateText}

🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text);
}

module.exports = {
  apiErrorAlert,
  dbErrorAlert,
  linkReminderAlert,
  requestLinksAlert,
  confirmLinkReceived,
  trackingResultAlert,
  trackingSummaryAlert,
  postingFailureAlert,
  healthCheckAlert,
  webhookProcessingAlert,
  jobFailureAlert,
};

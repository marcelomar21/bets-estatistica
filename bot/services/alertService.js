/**
 * Alert Service - Centralized alerting to admin group
 */
const { alertAdmin, sendToAdmin } = require('../telegram');
const logger = require('../../lib/logger');

/**
 * Send API error alert
 * @param {string} service - Service name (e.g., 'The Odds API', 'FootyStats')
 * @param {string} errorMessage - Error details
 * @param {number} attempts - Number of retry attempts made
 */
async function apiErrorAlert(service, errorMessage, attempts) {
  return alertAdmin(
    'ERROR',
    `${service} falhou após ${attempts} tentativas: ${errorMessage}`,
    `O serviço ${service} está com problemas. As apostas podem não ter odds atualizadas.`
  );
}

/**
 * Send database error alert
 * @param {string} operation - Operation that failed
 * @param {string} errorMessage - Error details
 */
async function dbErrorAlert(operation, errorMessage) {
  return alertAdmin(
    'ERROR',
    `DB Error em ${operation}: ${errorMessage}`,
    `Problema no banco de dados. Verifique o Supabase.`
  );
}

/**
 * Send link reminder to admin
 * @param {object} bet - Bet object
 * @param {number} reminderNumber - Which reminder this is (1, 2, 3...)
 */
async function linkReminderAlert(bet, reminderNumber) {
  const emoji = reminderNumber >= 3 ? '🔴' : '🟡';
  
  const text = `
${emoji} *LEMBRETE #${reminderNumber}*

⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*
📊 ${bet.betMarket}: ${bet.betPick}
💰 Odd esperada: ~${bet.odds}

⏰ Preciso do link para postar!

Responda com o link da aposta (Bet365 ou Betano).
  `.trim();

  return sendToAdmin(text);
}

/**
 * Send link request to admin group
 * @param {Array} bets - Array of bets needing links
 * @param {string} period - Period (morning, afternoon, night)
 */
async function requestLinksAlert(bets, period) {
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

  return sendToAdmin(text);
}

/**
 * Confirm link received
 * @param {object} bet - Bet object
 */
async function confirmLinkReceived(bet) {
  const text = `
✅ *Link recebido!*

⚽ ${bet.homeTeamName} x ${bet.awayTeamName}
📊 ${bet.betMarket}: ${bet.betPick}
🔗 Link salvo com sucesso
  `.trim();

  return sendToAdmin(text);
}

/**
 * Send success/failure tracking update
 * @param {object} bet - Bet with result
 * @param {boolean} won - Whether bet won
 */
async function trackingResultAlert(bet, won) {
  const emoji = won ? '✅' : '❌';
  const result = won ? 'ACERTOU' : 'ERROU';

  const text = `
${emoji} *RESULTADO: ${result}*

⚽ ${bet.homeTeamName} x ${bet.awayTeamName}
📊 ${bet.betMarket}: ${bet.betPick}
💰 Odd: ${bet.oddsAtPost?.toFixed(2)}
  `.trim();

  return sendToAdmin(text);
}

/**
 * Send posting failure alert with operator mention
 * @param {string} period - Which posting period failed (morning/afternoon/night or hour like "10h")
 * @param {string} detectedAt - When the failure was detected
 * @param {string} reason - Reason for failure (optional)
 */
async function postingFailureAlert(period, detectedAt, reason = null) {
  const operatorUsername = process.env.TELEGRAM_OPERATOR_USERNAME || 'marcelomendes';

  const reasonText = reason ? `\n📋 Motivo: ${reason}` : '';

  const text = `
🚨 *ALERTA DE SISTEMA*

@${operatorUsername} Problema detectado!

❌ *Falha:* Postagem das ${period} não executada
⏰ *Detectado:* ${detectedAt}${reasonText}
💡 *Ação:* Use /postar para forçar

\`/status\` para mais detalhes
  `.trim();

  return sendToAdmin(text);
}

/**
 * Send health check alert
 * @param {Array} alerts - Array of alert objects { severity, check, message, action }
 * @param {boolean} hasErrors - Whether any errors (vs just warnings)
 */
async function healthCheckAlert(alerts, hasErrors) {
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

  return sendToAdmin(text);
}

module.exports = {
  apiErrorAlert,
  dbErrorAlert,
  linkReminderAlert,
  requestLinksAlert,
  confirmLinkReceived,
  trackingResultAlert,
  postingFailureAlert,
  healthCheckAlert,
};

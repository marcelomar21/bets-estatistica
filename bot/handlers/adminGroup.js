/**
 * Admin Group Message Handler (Router)
 * Story 17.1: Refactored from 2500+ lines into domain-specific modules
 *
 * This file now acts as a lightweight router that dispatches commands
 * to the appropriate handler modules in ./admin/
 *
 * Modules:
 * - betCommands.js: /apostas, /odd, /link, /filtrar, /fila, /promover, /remover
 * - memberCommands.js: /membros, /membro, /trial, /add_trial, /remover_membro, /estender
 * - actionCommands.js: /postar, /atualizar, /trocar, /adicionar
 * - queryCommands.js: /overview, /metricas, /status, /simular, /atualizados, /help
 * - callbackHandlers.js: Inline keyboard callbacks
 */
const logger = require('../../lib/logger');

// Import all handlers and patterns from domain modules
const {
  // Bet Commands
  handleOddsCommand,
  handleApostasCommand,
  handleLinkUpdate,
  handleFiltrarCommand,
  handlePromoverCommand,
  handleRemoverCommand,
  handleFilaCommand,
  LINK_PATTERN,
  ODDS_PATTERN,
  APOSTAS_PATTERN,
  LINK_COMMAND_PATTERN,
  FILTRAR_PATTERN,
  PROMOVER_PATTERN,
  REMOVER_PATTERN,
  FILA_PATTERN,

  // Member Commands
  handleMembrosCommand,
  handleMembroCommand,
  handleTrialConfigCommand,
  handleAddTrialCommand,
  handleRemoverMembroCommand,
  handleEstenderCommand,
  MEMBROS_PATTERN,
  MEMBRO_PATTERN,
  TRIAL_CONFIG_PATTERN,
  ADD_TRIAL_PATTERN,
  REMOVER_MEMBRO_PATTERN,
  ESTENDER_PATTERN,

  // Action Commands
  handlePostarCommand,
  handleAtualizarOddsCommand,
  handleTrocarCommand,
  handleAdicionarCommand,
  showAdicionarHelp,
  POSTAR_PATTERN,
  ATUALIZAR_ODDS_PATTERN,
  TROCAR_PATTERN,
  ADICIONAR_PATTERN,
  ADICIONAR_HELP_PATTERN,

  // Query Commands
  handleStatusCommand,
  handleOverviewCommand,
  handleMetricasCommand,
  handleSimularCommand,
  handleAtualizadosCommand,
  handleHelpCommand,
  STATUS_PATTERN,
  OVERVIEW_PATTERN,
  METRICAS_PATTERN,
  SIMULAR_PATTERN,
  ATUALIZADOS_PATTERN,
  HELP_PATTERN,

  // Callback Handlers
  handleRemovalCallback
} = require('./admin');

/**
 * Handle messages in admin group
 * Routes commands to appropriate handler modules
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 */
async function handleAdminMessage(bot, msg) {
  const text = msg.text?.trim();
  if (!text) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERY COMMANDS (read-only operations)
  // ─────────────────────────────────────────────────────────────────────────────

  // /status - Bot status with job executions
  if (STATUS_PATTERN.test(text)) {
    await handleStatusCommand(bot, msg);
    return;
  }

  // /metricas - Detailed metrics
  if (METRICAS_PATTERN.test(text)) {
    await handleMetricasCommand(bot, msg);
    return;
  }

  // /overview - Bets overview stats
  if (OVERVIEW_PATTERN.test(text)) {
    await handleOverviewCommand(bot, msg);
    return;
  }

  // /simular [novo|ID] - Preview next posting
  const simularMatch = text.match(SIMULAR_PATTERN);
  if (simularMatch) {
    const arg = simularMatch[1] || null;
    await handleSimularCommand(bot, msg, arg);
    return;
  }

  // /atualizados [pagina] - Odds update history
  const atualizadosMatch = text.match(ATUALIZADOS_PATTERN);
  if (atualizadosMatch) {
    const page = atualizadosMatch[1] ? parseInt(atualizadosMatch[1], 10) : 1;
    await handleAtualizadosCommand(bot, msg, page);
    return;
  }

  // /help - Show all commands
  if (HELP_PATTERN.test(text)) {
    await handleHelpCommand(bot, msg);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MEMBER COMMANDS (membership management)
  // ─────────────────────────────────────────────────────────────────────────────

  // /membros - Member statistics summary
  if (MEMBROS_PATTERN.test(text)) {
    await handleMembrosCommand(bot, msg);
    return;
  }

  // /membro @username - Detailed member status
  const membroMatch = text.match(MEMBRO_PATTERN);
  if (membroMatch) {
    const identifier = membroMatch[1].trim();
    await handleMembroCommand(bot, msg, identifier);
    return;
  }

  // /trial [dias] - Configure trial duration
  const trialMatch = text.match(TRIAL_CONFIG_PATTERN);
  if (trialMatch) {
    const days = trialMatch[1] ? parseInt(trialMatch[1], 10) : null;
    await handleTrialConfigCommand(bot, msg, days);
    return;
  }

  // /add_trial @username - Add user to trial
  const addTrialMatch = text.match(ADD_TRIAL_PATTERN);
  if (addTrialMatch) {
    const identifier = addTrialMatch[1].trim();
    await handleAddTrialCommand(bot, msg, identifier);
    return;
  }

  // /remover_membro @username [motivo] - Remove member from group
  const removerMembroMatch = text.match(REMOVER_MEMBRO_PATTERN);
  if (removerMembroMatch) {
    const identifier = removerMembroMatch[1].trim();
    const motivo = removerMembroMatch[2]?.trim() || null;
    await handleRemoverMembroCommand(bot, msg, identifier, motivo);
    return;
  }

  // /estender @username dias - Extend membership
  const estenderMatch = text.match(ESTENDER_PATTERN);
  if (estenderMatch) {
    const identifier = estenderMatch[1].trim();
    const days = parseInt(estenderMatch[2], 10);
    await handleEstenderCommand(bot, msg, identifier, days);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BET COMMANDS (bet management)
  // ─────────────────────────────────────────────────────────────────────────────

  // /apostas [pagina] - List available bets
  const apostasMatch = text.match(APOSTAS_PATTERN);
  if (apostasMatch) {
    const page = apostasMatch[1] ? parseInt(apostasMatch[1], 10) : 1;
    await handleApostasCommand(bot, msg, page);
    return;
  }

  // /filtrar [tipo] [pagina] - Filter bets by criteria
  const filtrarMatch = text.match(FILTRAR_PATTERN);
  if (filtrarMatch) {
    const filterType = filtrarMatch[1] || null;
    const page = filtrarMatch[2] ? parseInt(filtrarMatch[2], 10) : 1;
    await handleFiltrarCommand(bot, msg, filterType, page);
    return;
  }

  // /fila [pagina] - Show posting queue status
  const filaMatch = text.match(FILA_PATTERN);
  if (filaMatch) {
    const page = filaMatch[1] ? parseInt(filaMatch[1], 10) : 1;
    await handleFilaCommand(bot, msg, page);
    return;
  }

  // /promover ID - Promote bet to posting queue
  const promoverMatch = text.match(PROMOVER_PATTERN);
  if (promoverMatch) {
    const betId = promoverMatch[1] ? parseInt(promoverMatch[1], 10) : null;
    await handlePromoverCommand(bot, msg, betId);
    return;
  }

  // /remover ID - Remove bet from posting queue
  const removerMatch = text.match(REMOVER_PATTERN);
  if (removerMatch) {
    const betId = removerMatch[1] ? parseInt(removerMatch[1], 10) : null;
    await handleRemoverCommand(bot, msg, betId);
    return;
  }

  // /odds ID valor - Set manual odds
  const oddsMatch = text.match(ODDS_PATTERN);
  if (oddsMatch) {
    const betId = parseInt(oddsMatch[1], 10);
    const oddsValue = oddsMatch[2];
    await handleOddsCommand(bot, msg, betId, oddsValue);
    return;
  }

  // /link ID URL - Add link to bet
  const linkCommandMatch = text.match(LINK_COMMAND_PATTERN);
  if (linkCommandMatch) {
    const betId = parseInt(linkCommandMatch[1], 10);
    const deepLink = linkCommandMatch[2];
    await handleLinkUpdate(bot, msg, betId, deepLink);
    return;
  }

  // ID: URL - Legacy link pattern
  const linkMatch = text.match(LINK_PATTERN);
  if (linkMatch) {
    const betId = parseInt(linkMatch[1], 10);
    const deepLink = linkMatch[2];
    await handleLinkUpdate(bot, msg, betId, deepLink);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTION COMMANDS (side effects)
  // ─────────────────────────────────────────────────────────────────────────────

  // /postar - Force posting
  if (POSTAR_PATTERN.test(text)) {
    await handlePostarCommand(bot, msg);
    return;
  }

  // /atualizar [odds] - Force odds refresh
  if (ATUALIZAR_ODDS_PATTERN.test(text)) {
    await handleAtualizarOddsCommand(bot, msg);
    return;
  }

  // /trocar ID_ANTIGO ID_NOVO - Swap posted bet
  const trocarMatch = text.match(TROCAR_PATTERN);
  if (trocarMatch) {
    const oldBetId = parseInt(trocarMatch[1], 10);
    const newBetId = parseInt(trocarMatch[2], 10);
    await handleTrocarCommand(bot, msg, oldBetId, newBetId);
    return;
  }

  // /adicionar (help)
  if (ADICIONAR_HELP_PATTERN.test(text)) {
    await showAdicionarHelp(bot, msg);
    return;
  }

  // /adicionar "Time A vs Time B" "Mercado" odd [link]
  const adicionarMatch = text.match(ADICIONAR_PATTERN);
  if (adicionarMatch) {
    const [, matchStr, market, oddsStr, link] = adicionarMatch;
    await handleAdicionarCommand(bot, msg, matchStr, market, oddsStr, link);
    return;
  }
}

module.exports = { handleAdminMessage, handleRemovalCallback };

/**
 * Admin Handlers - Consolidated Exports
 * Story 17.1: Refactor adminGroup.js into domain-specific modules
 *
 * Structure:
 * - betCommands.js: /apostas, /odd, /link, /filtrar, /fila, /promover, /remover
 * - memberCommands.js: /membros, /membro, /trial, /add_trial, /remover_membro, /estender
 * - actionCommands.js: /postar, /atualizar, /trocar, /adicionar
 * - queryCommands.js: /overview, /metricas, /status, /simular, /atualizados, /help
 * - callbackHandlers.js: Inline keyboard callbacks
 */

const betCommands = require('./betCommands');
const memberCommands = require('./memberCommands');
const actionCommands = require('./actionCommands');
const queryCommands = require('./queryCommands');
const callbackHandlers = require('./callbackHandlers');

module.exports = {
  // Bet Commands
  ...betCommands,

  // Member Commands
  ...memberCommands,

  // Action Commands
  ...actionCommands,

  // Query Commands
  ...queryCommands,

  // Callback Handlers
  ...callbackHandlers
};

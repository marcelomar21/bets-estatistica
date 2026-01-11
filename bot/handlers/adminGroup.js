/**
 * Admin Group Message Handler
 * Handles incoming messages in the admin group, primarily for receiving deep links
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { confirmLinkReceived } = require('../services/alertService');

// Regex to match "ID: link" pattern
const LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i;

// Valid bookmaker domains
const VALID_DOMAINS = ['bet365.com', 'betano.com', 'betano.com.br'];

/**
 * Validate if URL is from a valid bookmaker
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidBookmakerUrl(url) {
  try {
    const parsed = new URL(url);
    return VALID_DOMAINS.some(domain => parsed.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Handle messages in admin group
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 */
async function handleAdminMessage(bot, msg) {
  const text = msg.text?.trim();
  if (!text) return;

  // Check if message matches link pattern
  const match = text.match(LINK_PATTERN);
  if (!match) return;

  const betId = parseInt(match[1], 10);
  const deepLink = match[2];

  logger.info('Link received', { betId, link: deepLink.substring(0, 50) });

  // Validate URL
  if (!isValidBookmakerUrl(deepLink)) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Link inválido. Use links do Bet365 ou Betano.\n\nRecebido: ${deepLink}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Find and update bet
  const { data: bet, error: fetchError } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_market,
      bet_pick,
      odds,
      bet_status,
      league_matches!inner (
        home_team_name,
        away_team_name
      )
    `)
    .eq('id', betId)
    .single();

  if (fetchError || !bet) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Aposta #${betId} não encontrada.`,
      { reply_to_message_id: msg.message_id }
    );
    logger.warn('Bet not found for link', { betId });
    return;
  }

  // Check if bet is in correct status
  if (bet.bet_status !== 'pending_link' && bet.bet_status !== 'generated') {
    await bot.sendMessage(
      msg.chat.id,
      `⚠️ Aposta #${betId} já tem status: ${bet.bet_status}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Update bet with link
  const { error: updateError } = await supabase
    .from('suggested_bets')
    .update({
      deep_link: deepLink,
      bet_status: 'ready',
    })
    .eq('id', betId);

  if (updateError) {
    logger.error('Failed to save link', { betId, error: updateError.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao salvar link: ${updateError.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Confirm receipt
  await confirmLinkReceived({
    homeTeamName: bet.league_matches.home_team_name,
    awayTeamName: bet.league_matches.away_team_name,
    betMarket: bet.bet_market,
    betPick: bet.bet_pick,
  });

  logger.info('Link saved successfully', { betId });
}

module.exports = { handleAdminMessage };

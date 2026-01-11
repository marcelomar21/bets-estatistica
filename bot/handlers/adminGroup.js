/**
 * Admin Group Message Handler
 * Handles incoming messages in the admin group, primarily for receiving deep links
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { confirmLinkReceived } = require('../services/alertService');

// Regex to match "ID: link" pattern
const LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i;

// Regex to match "/odds ID valor" command
const ODDS_PATTERN = /^\/odds\s+(\d+)\s+([\d.,]+)/i;

// Valid bookmaker domains
const VALID_DOMAINS = [
  'bet365.com', 
  'betano.com', 
  'betano.com.br',
  'betano.bet.br',  // Brasil
  'betway.com',
  'sportingbet.com',
];

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
 * Handle /odds command to set manual odds
 */
async function handleOddsCommand(bot, msg, betId, oddsValue) {
  // Parse odds value (handle both 1.85 and 1,85)
  const odds = parseFloat(oddsValue.replace(',', '.'));
  
  if (isNaN(odds) || odds < 1) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Odds inválida: ${oddsValue}\nUse um valor decimal, ex: 1.85 ou 2,10`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Find bet
  const { data: bet, error: fetchError } = await supabase
    .from('suggested_bets')
    .select(`
      id,
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
    return;
  }

  // Update bet with manual odds
  const { error: updateError } = await supabase
    .from('suggested_bets')
    .update({
      odds: odds,
      notes: `Odds manual via admin: ${odds}`,
    })
    .eq('id', betId);

  if (updateError) {
    logger.error('Failed to save manual odds', { betId, error: updateError.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao salvar odds: ${updateError.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Confirm
  const match = `${bet.league_matches.home_team_name} vs ${bet.league_matches.away_team_name}`;
  await bot.sendMessage(
    msg.chat.id,
    `✅ Odds atualizada!\n\n🏟️ ${match}\n📊 ${bet.bet_market}\n💰 Odds: ${odds}\n\n_Agora envie o link: \`${betId}: URL\`_`,
    { 
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown',
    }
  );

  logger.info('Manual odds saved', { betId, odds });
}

/**
 * Handle messages in admin group
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 */
async function handleAdminMessage(bot, msg) {
  const text = msg.text?.trim();
  if (!text) return;

  // Check if message is /odds command
  const oddsMatch = text.match(ODDS_PATTERN);
  if (oddsMatch) {
    const betId = parseInt(oddsMatch[1], 10);
    const oddsValue = oddsMatch[2];
    await handleOddsCommand(bot, msg, betId, oddsValue);
    return;
  }

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

  // Find bet
  const { data: bet, error: fetchError } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_market,
      bet_pick,
      odds,
      bet_status,
      deep_link,
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

  // If already posted, don't allow changes
  if (bet.bet_status === 'posted') {
    await bot.sendMessage(
      msg.chat.id,
      `🔒 Aposta #${betId} já foi publicada. Link não pode ser alterado.`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // If already has link and status is ready, warn but allow update
  if (bet.deep_link && bet.bet_status === 'ready') {
    await bot.sendMessage(
      msg.chat.id,
      `⚠️ Aposta #${betId} já tinha link. Atualizando...`,
      { reply_to_message_id: msg.message_id }
    );
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

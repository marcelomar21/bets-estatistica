/**
 * Job: Post bets to public Telegram group
 *
 * Stories covered:
 * - 3.1: Criar job postagem pública
 * - 3.2: Formatar mensagem aposta
 * - 3.3: Incluir deep link na mensagem
 * - 3.4: Validar requisitos antes de postar
 * - 14.3: Integrar warns no job de postagem
 *
 * Run: node bot/jobs/postBets.js [morning|afternoon|night]
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { sendToPublic, sendToAdmin } = require('../telegram');
const { getFilaStatus, markBetAsPosted, registrarPostagem, getAvailableBets } = require('../services/betService');
const { generateBetCopy } = require('../services/copyService');
const { sendPostWarn } = require('./jobWarn');

// Message templates for variety (Story 3.6)
const MESSAGE_TEMPLATES = [
  {
    header: '🎯 *APOSTA DO DIA*',
    footer: '🍀 Boa sorte!',
  },
  {
    header: '⚽ *DICA QUENTE*',
    footer: '💪 Bora lucrar!',
  },
  {
    header: '🔥 *OPORTUNIDADE*',
    footer: '📈 Vamos juntos!',
  },
  {
    header: '💰 *APOSTA SEGURA*',
    footer: '🎯 Confiança total!',
  },
  {
    header: '🏆 *SELEÇÃO DO DIA*',
    footer: '✨ Sucesso garantido!',
  },
];

/**
 * Get random template
 */
function getRandomTemplate() {
  const index = Math.floor(Math.random() * MESSAGE_TEMPLATES.length);
  return MESSAGE_TEMPLATES[index];
}

/**
 * Get period from command line or current time
 */
function getPeriod() {
  const arg = process.argv[2];
  if (arg && ['morning', 'afternoon', 'night'].includes(arg)) {
    return arg;
  }

  // Use BRT timezone
  const now = new Date();
  const brtString = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const hour = parseInt(brtString, 10);

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

/**
 * Format bet message for Telegram - extrai dados do reasoning em bullets
 * @param {object} bet - Bet object
 * @param {object} template - Message template
 * @returns {Promise<string>}
 */
async function formatBetMessage(bet, template) {
  const kickoffDate = new Date(bet.kickoffTime);
  const kickoffStr = kickoffDate.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Build message parts
  const parts = [
    template.header,
    '',
    `⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*`,
    `🗓 ${kickoffStr}`,
    '',
    `📊 ${bet.betMarket}`,
    `💰 Odd: ${bet.odds?.toFixed(2) || 'N/A'}`,
  ];

  // Extrair dados do reasoning em bullets via LLM
  if (bet.reasoning) {
    try {
      const copyResult = await generateBetCopy(bet);
      if (copyResult.success && copyResult.data?.copy) {
        parts.push('');
        parts.push(copyResult.data.copy);
        logger.debug('Using extracted data bullets', { betId: bet.id });
      } else {
        // Fallback: usar reasoning direto (truncado)
        const truncated = bet.reasoning.length > 200
          ? bet.reasoning.substring(0, 197) + '...'
          : bet.reasoning;
        parts.push('');
        parts.push(`_${truncated}_`);
      }
    } catch (err) {
      logger.warn('Failed to extract data bullets', { betId: bet.id, error: err.message });
      const truncated = bet.reasoning.length > 200
        ? bet.reasoning.substring(0, 197) + '...'
        : bet.reasoning;
      parts.push('');
      parts.push(`_${truncated}_`);
    }
  }

  // Add deep link
  if (bet.deepLink) {
    parts.push('');
    parts.push(`🔗 [Apostar Agora](${bet.deepLink})`);
  }

  parts.push('');
  parts.push(template.footer);

  return parts.join('\n');
}

/**
 * Validate bet before posting (Story 3.4, Story 13.5: AC6)
 * Story 13.5: Apostas com promovida_manual=true ignoram filtro de odds mínimas
 * @param {object} bet - Bet object
 * @returns {object} - { valid: boolean, reason?: string }
 */
function validateBetForPosting(bet) {
  // Must have deep link
  if (!bet.deepLink) {
    return { valid: false, reason: 'No deep link' };
  }

  // Must have valid odds (AC6: skip check if promovida_manual=true)
  if (!bet.promovidaManual && (!bet.odds || bet.odds < config.betting.minOdds)) {
    return { valid: false, reason: `Odds below minimum (${bet.odds} < ${config.betting.minOdds})` };
  }

  // Kickoff must be in the future
  if (new Date(bet.kickoffTime) <= new Date()) {
    return { valid: false, reason: 'Match already started' };
  }

  return { valid: true };
}

/**
 * Main job - Usa getFilaStatus() como fonte única de verdade
 * Garante que /postar posta EXATAMENTE o que /fila mostra
 */
async function runPostBets() {
  const period = getPeriod();
  const now = new Date().toISOString();
  logger.info('Starting post bets job', { period, timestamp: now });

  // Step 1: Usar getFilaStatus() - MESMA lógica do /fila
  const filaResult = await getFilaStatus();

  if (!filaResult.success) {
    logger.error('Failed to get fila status', { error: filaResult.error?.message });

    // Warn failure (Story 14.3 AC5)
    await sendToAdmin(`⚠️ *ERRO NA POSTAGEM*\n\nFalha ao buscar fila de apostas.\nErro: ${filaResult.error?.message || 'Desconhecido'}\n\nVerifique o banco de dados.`);

    return { reposted: 0, posted: 0, skipped: 0, totalSent: 0 };
  }

  const { ativas, novas } = filaResult.data;

  logger.info('Fila status', {
    ativas: ativas.length,
    novas: novas.length,
    total: ativas.length + novas.length
  });

  let reposted = 0;
  let repostFailed = 0;
  let posted = 0;
  let skipped = 0;

  // Story 14.3: Array para coletar apostas postadas para o warn
  const postedBetsArray = [];

  // Step 3: Repostar apostas ATIVAS (já postadas, continuam na fila)
  if (ativas.length > 0) {
    logger.info('Reposting active bets', {
      count: ativas.length,
      bets: ativas.map(b => ({ id: b.id, match: `${b.homeTeamName} x ${b.awayTeamName}` }))
    });

    for (const bet of ativas) {
      // Validate before posting
      const validation = validateBetForPosting(bet);
      if (!validation.valid) {
        logger.warn('Active bet failed validation', { betId: bet.id, reason: validation.reason });
        repostFailed++;
        continue;
      }

      // Format and send message
      const template = getRandomTemplate();
      const message = await formatBetMessage(bet, template);

      const sendResult = await sendToPublic(message);

      if (sendResult.success) {
        // Registrar repost no histórico (não muda status, já é posted)
        await registrarPostagem(bet.id);
        reposted++;
        logger.info('Bet reposted successfully', { betId: bet.id, messageId: sendResult.data.messageId });

        // Story 14.3: Coletar dados para warn
        postedBetsArray.push({
          id: bet.id,
          homeTeamName: bet.homeTeamName,
          awayTeamName: bet.awayTeamName,
          betMarket: bet.betMarket,
          odds: bet.odds,
          type: 'repost',
        });
      } else {
        logger.error('Failed to repost bet', { betId: bet.id, error: sendResult.error?.message });
        repostFailed++;
      }
    }
  }

  // Step 4: Postar NOVAS apostas (preenchendo slots disponíveis)
  if (novas.length > 0) {
    logger.info('Posting new bets', {
      count: novas.length,
      bets: novas.map(b => ({ id: b.id, match: `${b.homeTeamName} x ${b.awayTeamName}` }))
    });

    for (const bet of novas) {
      // Validate before posting
      const validation = validateBetForPosting(bet);
      if (!validation.valid) {
        logger.warn('New bet failed validation', { betId: bet.id, reason: validation.reason });
        skipped++;
        continue;
      }

      // Format and send message
      const template = getRandomTemplate();
      const message = await formatBetMessage(bet, template);

      const sendResult = await sendToPublic(message);

      if (sendResult.success) {
        // Mark as posted (updates status and timestamp)
        await markBetAsPosted(bet.id, sendResult.data.messageId, bet.odds);
        // Registrar postagem no histórico
        await registrarPostagem(bet.id);
        posted++;
        logger.info('New bet posted successfully', { betId: bet.id, messageId: sendResult.data.messageId });

        // Story 14.3: Coletar dados para warn
        postedBetsArray.push({
          id: bet.id,
          homeTeamName: bet.homeTeamName,
          awayTeamName: bet.awayTeamName,
          betMarket: bet.betMarket,
          odds: bet.odds,
          type: 'new',
        });
      } else {
        logger.error('Failed to post new bet', { betId: bet.id, error: sendResult.error?.message });
        skipped++;
      }
    }
  }

  logger.info('Post bets job complete', {
    reposted,
    repostFailed,
    newPosted: posted,
    newSkipped: skipped,
    totalSent: reposted + posted
  });

  // Step 5: Enviar warn para grupo admin (Story 14.3)
  try {
    // Buscar apostas dos próximos 2 dias
    const upcomingResult = await getAvailableBets();
    const upcomingBets = upcomingResult.success ? upcomingResult.data : [];

    // Identificar pendências
    const pendingActions = [];
    for (const bet of upcomingBets) {
      if (!bet.deepLink) {
        pendingActions.push(`#${bet.id} precisa de link → /link ${bet.id} URL`);
      }
      if (!bet.odds || bet.odds < config.betting.minOdds) {
        pendingActions.push(`#${bet.id} sem odds adequadas → /atualizar`);
      }
    }

    await sendPostWarn(period, postedBetsArray, upcomingBets, pendingActions);
    logger.info('Post warn sent successfully');
  } catch (warnErr) {
    // Warn failure should not fail the job
    logger.warn('Failed to send post warn', { error: warnErr.message });
  }

  return {
    reposted,
    repostFailed,
    posted,
    skipped,
    totalSent: reposted + posted
  };
}

// Run if called directly
if (require.main === module) {
  runPostBets()
    .then(result => {
      console.log('✅ Post bets complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Post bets failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runPostBets, formatBetMessage, validateBetForPosting };

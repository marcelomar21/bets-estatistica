/**
 * Copy Service - Extrai dados do reasoning em formato bullet points
 *
 * Story 10.1: Copy Dinâmico com LLM
 */
require('dotenv').config();

const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../../lib/logger');

// In-memory cache for generated copies
const copyCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 200;

/**
 * Initialize OpenAI client
 */
const { config } = require('../../lib/config');

function getOpenAI() {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: config.llm.lightModel,
    temperature: 0.2, // Baixa para extração precisa de dados
    maxTokens: 200,
  });
}

/**
 * Get cache key for a bet
 */
function getCacheKey(bet) {
  return `copy_${bet.id}`;
}

/**
 * Get from cache if valid
 */
function getFromCache(key) {
  const cached = copyCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    copyCache.delete(key);
    return null;
  }

  return cached.data;
}

/**
 * Set cache with size limit
 */
function setCache(key, data) {
  // Clean up if too large
  if (copyCache.size >= CACHE_MAX_SIZE) {
    const oldest = [...copyCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) copyCache.delete(oldest[0]);
  }

  copyCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Generate engaging copy for a bet using LLM
 * @param {object} bet - Bet object with homeTeamName, awayTeamName, betMarket, betPick, odds, reasoning
 * @returns {Promise<{success: boolean, data?: {copy: string}, error?: object}>}
 */
async function generateBetCopy(bet) {
  if (!bet) {
    return {
      success: false,
      error: { code: 'INVALID_BET', message: 'No bet provided' }
    };
  }

  // Check cache first
  const cacheKey = getCacheKey(bet);
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug('Copy from cache', { betId: bet.id });
    return { success: true, data: { copy: cached, fromCache: true } };
  }

  try {
    const llm = getOpenAI();

    const prompt = `Extraia os dados estatísticos do texto abaixo em bullet points curtos.

Texto:
${bet.reasoning || 'Sem análise disponível'}

Regras:
- Extraia APENAS dados numéricos/percentuais do texto
- Máximo 4-5 bullets
- Cada bullet deve ter no máximo 40 caracteres
- Use "•" como marcador
- Abrevie nomes de times (ex: "Sampaio Corrêa RJ" → "Sampaio")
- Formato: "• Time: XX% dado" ou "• Dado: X,XX valor"
- NÃO invente dados - use apenas o que está no texto
- NÃO use emojis
- Português BR

Exemplo de saída:
• Sampaio: 50% ambas marcam
• Botafogo: 60% ambas marcam
• Média ofensiva: 1,80 e 2,10 gols
• 70% jogos com 3+ gols

Responda APENAS com os bullets, sem texto adicional.`;

    const response = await llm.invoke(prompt);
    const copy = response.content.trim();

    // Validate response - deve ter pelo menos um bullet
    if (!copy || !copy.includes('•')) {
      logger.warn('LLM returned invalid format', { betId: bet.id, copy });
      return {
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'LLM did not return bullet format' }
      };
    }

    // Limitar a 5 bullets e limpar formatação
    const bullets = copy
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .slice(0, 5)
      .join('\n');

    const finalCopy = bullets || copy;

    // Cache the result
    setCache(cacheKey, finalCopy);

    logger.info('Generated bet copy', {
      betId: bet.id,
      copyLength: finalCopy.length,
      match: `${bet.homeTeamName} x ${bet.awayTeamName}`
    });

    return { success: true, data: { copy: finalCopy, fromCache: false } };
  } catch (error) {
    logger.error('Failed to generate bet copy', {
      betId: bet.id,
      error: error.message
    });

    return {
      success: false,
      error: { code: 'LLM_ERROR', message: error.message }
    };
  }
}

/**
 * Clear copy cache
 */
function clearCache() {
  copyCache.clear();
  logger.info('Copy cache cleared');
}

/**
 * Clear cache for specific bet (Story 12.6: /simular novo)
 * @param {number} betId - Bet ID to clear from cache
 */
function clearBetCache(betId) {
  const key = `copy_${betId}`;
  const deleted = copyCache.delete(key);
  if (deleted) {
    logger.debug('Cleared cache for bet', { betId });
  }
  return deleted;
}

/**
 * Get cache stats
 */
function getCacheStats() {
  return {
    size: copyCache.size,
    maxSize: CACHE_MAX_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}

module.exports = {
  generateBetCopy,
  clearCache,
  clearBetCache,
  getCacheStats,
};

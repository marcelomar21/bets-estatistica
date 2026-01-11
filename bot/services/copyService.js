/**
 * Copy Service - Generate engaging copy for bet posts using LLM
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
function getOpenAI() {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o-mini',
    temperature: 0.7, // More creative than market interpreter
    maxTokens: 150,
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

    const prompt = `Você é um copywriter de apostas esportivas. Gere um copy CURTO e ENGAJADOR para esta aposta:

Jogo: ${bet.homeTeamName} x ${bet.awayTeamName}
Aposta: ${bet.betMarket} - ${bet.betPick}
Odd: ${bet.odds?.toFixed(2) || 'N/A'}
Análise original: ${bet.reasoning || 'Aposta de alto valor estatístico'}

Regras:
- Máximo 2-3 linhas curtas
- Tom animado mas profissional
- Em português BR informal
- Mencione algum dado ou insight interessante
- NÃO use emojis (serão adicionados separadamente)
- NÃO repita a odd ou nome do mercado (já aparecem na mensagem)

Responda APENAS com o copy, sem aspas ou formatação adicional.`;

    const response = await llm.invoke(prompt);
    const copy = response.content.trim();

    // Validate response
    if (!copy || copy.length < 10) {
      logger.warn('LLM returned empty or short copy', { betId: bet.id, copy });
      return {
        success: false,
        error: { code: 'EMPTY_RESPONSE', message: 'LLM returned insufficient copy' }
      };
    }

    // Truncate if too long (max 300 chars)
    const finalCopy = copy.length > 300 ? copy.substring(0, 297) + '...' : copy;

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
  getCacheStats,
};

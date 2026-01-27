/**
 * Market Interpreter - Uses AI to parse bet market descriptions
 * 
 * The Odds API supported markets:
 * - h2h: Moneyline (home/away/draw)
 * - spreads: Point spread / handicap
 * - totals: Over/Under goals
 * - btts: Both Teams To Score (yes/no)
 * - draw_no_bet: Draw no bet
 * - double_chance: Double chance
 * 
 * NOT supported by The Odds API:
 * - Corners (escanteios)
 * - Cards/Bookings (cartões)
 * - Shots on target (chutes)
 * - Player props (in most sports)
 */
require('dotenv').config();

const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../../lib/logger');

// Simple in-memory cache for interpretations
const interpretationCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const SUPPORTED_MARKETS = {
  totals: {
    types: ['over', 'under'],
    description: 'Total de gols na partida (Over/Under)',
    example: 'Mais de 2.5 gols',
  },
  btts: {
    types: ['yes', 'no'],
    description: 'Ambas equipes marcam (BTTS)',
    example: 'Ambas equipes marcam - Sim',
  },
  h2h: {
    types: ['home', 'away', 'draw'],
    description: 'Resultado da partida (1x2)',
    example: 'Vitória do time da casa',
  },
  spreads: {
    types: ['home', 'away'],
    description: 'Handicap asiático',
    example: 'Time da casa -1.5',
  },
  draw_no_bet: {
    types: ['home', 'away'],
    description: 'Empate anula aposta',
    example: 'Time visitante (empate anula)',
  },
  double_chance: {
    types: ['home_draw', 'away_draw', 'home_away'],
    description: 'Chance dupla',
    example: 'Casa ou empate',
  },
};

const UNSUPPORTED_MARKETS = [
  'corners', 'escanteios', 'corner',
  'cards', 'cartões', 'cartoes', 'bookings', 'amarelos', 'vermelhos',
  'shots', 'chutes', 'finalizações',
  'fouls', 'faltas',
  'offsides', 'impedimentos',
];

const { config } = require('../../lib/config');

/**
 * Initialize OpenAI client
 */
function getOpenAI() {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: config.llm.lightModel,
    temperature: 0,
    maxTokens: 200,
  });
}

/**
 * Check cache for interpretation
 */
function getFromCache(key) {
  const cached = interpretationCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    interpretationCache.delete(key);
    return null;
  }
  return cached.data;
}

/**
 * Set cache for interpretation
 */
function setCache(key, data) {
  interpretationCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Check if market description mentions unsupported markets
 */
function isUnsupportedMarket(betMarket) {
  const text = betMarket.toLowerCase();
  return UNSUPPORTED_MARKETS.some(term => text.includes(term));
}

/**
 * Interpret bet market using AI
 * @param {string} betMarket - Portuguese description like "Proteja com mais de 1,5 gols no jogo"
 * @returns {Promise<{market: string|null, type: string|null, line: number|null, supported: boolean, reason?: string}>}
 */
async function interpretMarket(betMarket) {
  if (!betMarket) {
    return { market: null, type: null, line: null, supported: false, reason: 'Empty market' };
  }

  // Check cache first
  const cacheKey = betMarket.toLowerCase().trim();
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug('Market interpretation from cache', { betMarket, result: cached });
    return cached;
  }

  // Quick check for unsupported markets
  if (isUnsupportedMarket(betMarket)) {
    const result = { 
      market: null, 
      type: null, 
      line: null, 
      supported: false, 
      reason: 'Market not available in The Odds API (corners, cards, etc.)' 
    };
    setCache(cacheKey, result);
    logger.debug('Unsupported market detected', { betMarket });
    return result;
  }

  try {
    const llm = getOpenAI();
    
    const prompt = `Analise esta descrição de aposta esportiva e extraia as informações para a The Odds API.

Descrição da aposta: "${betMarket}"

Mercados suportados pela The Odds API:
- totals: Over/Under de gols (types: over, under)
- btts: Ambas equipes marcam (types: yes, no)
- h2h: Resultado 1x2 (types: home, away, draw)
- spreads: Handicap (types: home, away)
- draw_no_bet: Empate anula (types: home, away)
- double_chance: Chance dupla (types: home_draw, away_draw, home_away)

NÃO SUPORTADOS: escanteios/corners, cartões/bookings, chutes, faltas

Responda APENAS em JSON válido:
{
  "market": "nome do mercado ou null se não suportado",
  "type": "tipo da aposta (over/under/yes/no/home/away/draw) ou null",
  "line": número decimal (ex: 1.5, 2.5) ou null se não aplicável,
  "supported": true se suportado, false se não,
  "reason": "razão se não suportado"
}`;

    const response = await llm.invoke(prompt);
    const content = response.content.trim();
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Could not parse AI response', { betMarket, response: content });
      return { market: null, type: null, line: null, supported: false, reason: 'Parse error' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate market is in our supported list
    if (parsed.market && !SUPPORTED_MARKETS[parsed.market]) {
      parsed.market = null;
      parsed.supported = false;
      parsed.reason = 'Unknown market type';
    }

    // Ensure line is a number
    if (parsed.line !== null && typeof parsed.line === 'string') {
      parsed.line = parseFloat(parsed.line.replace(',', '.'));
    }

    setCache(cacheKey, parsed);
    logger.debug('Market interpreted by AI', { betMarket, result: parsed });
    
    return parsed;
  } catch (error) {
    logger.error('Failed to interpret market with AI', { betMarket, error: error.message });
    
    // Fallback to simple regex parsing
    return fallbackParsing(betMarket);
  }
}

/**
 * Fallback parsing without AI
 */
function fallbackParsing(betMarket) {
  const text = betMarket.toLowerCase();
  let market = null;
  let type = null;
  let line = null;

  // Check for unsupported first
  if (isUnsupportedMarket(betMarket)) {
    return { market: null, type: null, line: null, supported: false, reason: 'Unsupported market' };
  }

  // BTTS
  if (text.includes('ambas') || text.includes('btts')) {
    market = 'btts';
    type = text.includes('não') || text.includes('no ') ? 'no' : 'yes';
  }
  // Totals
  else if (text.includes('mais de') || text.includes('over') || text.includes('acima')) {
    market = 'totals';
    type = 'over';
  }
  else if (text.includes('menos de') || text.includes('under') || text.includes('abaixo')) {
    market = 'totals';
    type = 'under';
  }
  // H2H
  else if (text.includes('vitória') || text.includes('vencer')) {
    market = 'h2h';
    if (text.includes('casa') || text.includes('mandante')) type = 'home';
    else if (text.includes('visitante') || text.includes('fora')) type = 'away';
  }
  else if (text.includes('empate')) {
    market = 'h2h';
    type = 'draw';
  }
  // Gols without explicit over/under - assume over
  else if (text.includes('gol')) {
    market = 'totals';
    type = 'over';
  }

  // Extract line
  const lineMatch = text.match(/(\d+)[,.](\d+)/);
  if (lineMatch) {
    line = parseFloat(`${lineMatch[1]}.${lineMatch[2]}`);
  }

  const supported = market !== null;
  
  return { 
    market, 
    type, 
    line, 
    supported,
    reason: supported ? null : 'Could not identify market',
  };
}

/**
 * Batch interpret multiple markets (more efficient)
 */
async function interpretMarkets(betMarkets) {
  const results = [];
  
  for (const betMarket of betMarkets) {
    const result = await interpretMarket(betMarket);
    results.push({ betMarket, ...result });
  }
  
  return results;
}

/**
 * Clear interpretation cache
 */
function clearCache() {
  interpretationCache.clear();
  logger.info('Market interpretation cache cleared');
}

module.exports = {
  interpretMarket,
  interpretMarkets,
  isUnsupportedMarket,
  fallbackParsing,
  clearCache,
  SUPPORTED_MARKETS,
  UNSUPPORTED_MARKETS,
};

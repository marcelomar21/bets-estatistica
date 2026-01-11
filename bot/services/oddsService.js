/**
 * Odds Service - Integration with The Odds API
 * https://the-odds-api.com/
 */
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { alertAdmin } = require('../telegram');

const BASE_URL = 'https://api.the-odds-api.com/v4';

// Story 4.2: Market mapping from internal bet types to The Odds API markets
const MARKET_MAP = {
  // Goals markets
  'over_gols': { market: 'totals', type: 'over' },
  'under_gols': { market: 'totals', type: 'under' },
  'mais de': { market: 'totals', type: 'over' },
  'menos de': { market: 'totals', type: 'under' },
  'btts': { market: 'btts', type: null },
  'ambas marcam': { market: 'btts', type: 'yes' },
  'ambas as equipes marcam': { market: 'btts', type: 'yes' },
  
  // Corners markets
  'escanteios': { market: 'totals_corners', type: null },
  'escanteio': { market: 'totals_corners', type: null },
  
  // Cards markets  
  'cartoes': { market: 'totals_bookings', type: null },
  'cartões': { market: 'totals_bookings', type: null },
  
  // Player props
  'chutes_gol': { market: 'player_shots_on_target', type: null },
  'chutes a gol': { market: 'player_shots_on_target', type: null },
};

// Target bookmakers (in order of preference)
const TARGET_BOOKMAKERS = ['bet365', 'betano'];

// Simple in-memory cache
const oddsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Retry configuration
const MAX_RETRIES = config.retry.maxAttempts;
const BASE_DELAY_MS = config.retry.baseDelayMs;

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      // Check remaining quota from headers
      const remaining = response.headers.get('x-requests-remaining');
      const used = response.headers.get('x-requests-used');
      if (remaining) {
        logger.debug('Odds API quota', { remaining, used });
      }
      
      return await response.json();
    } catch (err) {
      logger.warn('Odds API request failed', { attempt, error: err.message });
      
      if (attempt === retries) {
        await alertAdmin(
          'ERROR',
          `The Odds API falhou após ${retries} tentativas: ${err.message}`,
          'As apostas podem não ter odds atualizadas. Verifique a API key e conexão.'
        );
        throw err;
      }
      
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
}

/**
 * Get cache key for event
 */
function getCacheKey(sport, eventId, market) {
  return `${sport}:${eventId}:${market}`;
}

/**
 * Get from cache if valid
 */
function getFromCache(key) {
  const cached = oddsCache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    oddsCache.delete(key);
    return null;
  }
  
  return cached.data;
}

/**
 * Set cache
 */
function setCache(key, data) {
  oddsCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Get available sports
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getSports() {
  try {
    const url = `${BASE_URL}/sports?apiKey=${config.apis.theOddsApiKey}`;
    const data = await fetchWithRetry(url);
    
    return { 
      success: true, 
      data: data.filter(s => s.active && s.group === 'Soccer') 
    };
  } catch (err) {
    return { 
      success: false, 
      error: { code: 'API_ERROR', message: err.message } 
    };
  }
}

/**
 * Get upcoming events for a sport
 * @param {string} sportKey - Sport key (e.g., 'soccer_brazil_campeonato')
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getUpcomingEvents(sportKey) {
  try {
    const url = `${BASE_URL}/sports/${sportKey}/events?apiKey=${config.apis.theOddsApiKey}`;
    const data = await fetchWithRetry(url);
    
    return { success: true, data };
  } catch (err) {
    return { 
      success: false, 
      error: { code: 'API_ERROR', message: err.message } 
    };
  }
}

/**
 * Get odds for a specific event and market
 * @param {string} sportKey - Sport key
 * @param {string} eventId - Event ID from The Odds API
 * @param {string} market - Market key (e.g., 'totals', 'btts')
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getEventOdds(sportKey, eventId, market = 'totals') {
  const cacheKey = getCacheKey(sportKey, eventId, market);
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    logger.debug('Using cached odds', { eventId, market });
    return { success: true, data: cached };
  }

  try {
    const bookmakers = TARGET_BOOKMAKERS.join(',');
    const url = `${BASE_URL}/sports/${sportKey}/events/${eventId}/odds?apiKey=${config.apis.theOddsApiKey}&regions=eu&markets=${market}&bookmakers=${bookmakers}`;
    
    const data = await fetchWithRetry(url);
    setCache(cacheKey, data);
    
    return { success: true, data };
  } catch (err) {
    return { 
      success: false, 
      error: { code: 'API_ERROR', message: err.message } 
    };
  }
}

/**
 * Find best odds for a bet from multiple bookmakers
 * @param {object} oddsData - Odds data from API
 * @param {string} betType - 'over' or 'under' for totals, 'yes'/'no' for btts
 * @param {number} line - Line value (e.g., 2.5 for over 2.5)
 * @returns {object|null} - { bookmaker, odds, line } or null
 */
function findBestOdds(oddsData, betType, line = null) {
  if (!oddsData?.bookmakers?.length) return null;

  let bestOdds = null;
  let bestBookmaker = null;
  let bestLine = null;

  for (const bookmaker of oddsData.bookmakers) {
    // Prefer our target bookmakers
    const isPreferred = TARGET_BOOKMAKERS.includes(bookmaker.key);
    
    for (const market of bookmaker.markets || []) {
      for (const outcome of market.outcomes || []) {
        // Match bet type
        const outcomeType = outcome.name?.toLowerCase();
        if (betType && outcomeType !== betType) continue;
        
        // Match line if specified
        if (line !== null && outcome.point !== undefined && Math.abs(outcome.point - line) > 0.1) {
          continue;
        }
        
        const odds = outcome.price;
        
        // Update if better odds or preferred bookmaker with same odds
        if (!bestOdds || odds > bestOdds || (odds === bestOdds && isPreferred)) {
          bestOdds = odds;
          bestBookmaker = bookmaker.key;
          bestLine = outcome.point ?? line;
        }
      }
    }
  }

  if (!bestOdds) return null;
  
  return {
    bookmaker: bestBookmaker,
    odds: bestOdds,
    line: bestLine,
  };
}

/**
 * Parse bet market string to extract type and line
 * @param {string} betMarket - e.g., "mais de 2,5 gols"
 * @returns {object} - { marketKey, betType, line }
 */
function parseBetMarket(betMarket) {
  if (!betMarket) return { marketKey: null, betType: null, line: null };
  
  const normalized = betMarket.toLowerCase().trim();
  
  // Find matching market
  let marketKey = null;
  let betType = null;
  
  for (const [keyword, mapping] of Object.entries(MARKET_MAP)) {
    if (normalized.includes(keyword)) {
      marketKey = mapping.market;
      betType = mapping.type;
      break;
    }
  }
  
  // Extract line number (e.g., 2.5 from "mais de 2,5")
  let line = null;
  const lineMatch = normalized.match(/(\d+[,.]?\d*)/);
  if (lineMatch) {
    line = parseFloat(lineMatch[1].replace(',', '.'));
  }
  
  return { marketKey, betType, line };
}

/**
 * Find event by team names
 * @param {Array} events - Array of events from API
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {object|null} - Matching event or null
 */
function findEventByTeams(events, homeTeam, awayTeam) {
  if (!events?.length || !homeTeam || !awayTeam) return null;
  
  const normalizeTeam = (name) => name?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeam(homeTeam);
  const awayNorm = normalizeTeam(awayTeam);
  
  return events.find(event => {
    const eventHome = normalizeTeam(event.home_team);
    const eventAway = normalizeTeam(event.away_team);
    
    // Try exact match first
    if (eventHome === homeNorm && eventAway === awayNorm) return true;
    
    // Try partial match (team name contains)
    if (eventHome?.includes(homeNorm) || homeNorm?.includes(eventHome)) {
      if (eventAway?.includes(awayNorm) || awayNorm?.includes(eventAway)) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Get odds for a specific bet
 * @param {object} bet - Bet object with homeTeamName, awayTeamName, betMarket
 * @param {string} sportKey - Sport key (optional, defaults to searching all soccer)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getOddsForBet(bet, sportKey = null) {
  const { marketKey, betType, line } = parseBetMarket(bet.betMarket);
  
  if (!marketKey) {
    logger.warn('Could not parse bet market', { betMarket: bet.betMarket });
    return { 
      success: false, 
      error: { code: 'PARSE_ERROR', message: `Unknown market: ${bet.betMarket}` } 
    };
  }

  // Get sports if not specified
  let sports = sportKey ? [{ key: sportKey }] : null;
  if (!sports) {
    const sportsResult = await getSports();
    if (!sportsResult.success) return sportsResult;
    sports = sportsResult.data;
  }

  // Search for the event in each sport
  for (const sport of sports) {
    const eventsResult = await getUpcomingEvents(sport.key);
    if (!eventsResult.success) continue;
    
    const event = findEventByTeams(eventsResult.data, bet.homeTeamName, bet.awayTeamName);
    if (!event) continue;
    
    // Found the event, get odds
    const oddsResult = await getEventOdds(sport.key, event.id, marketKey);
    if (!oddsResult.success) continue;
    
    const bestOdds = findBestOdds(oddsResult.data, betType, line);
    if (!bestOdds) continue;
    
    logger.info('Found odds for bet', { 
      betId: bet.id,
      event: `${event.home_team} vs ${event.away_team}`,
      odds: bestOdds.odds,
      bookmaker: bestOdds.bookmaker,
    });
    
    return {
      success: true,
      data: {
        eventId: event.id,
        sportKey: sport.key,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        commenceTime: event.commence_time,
        ...bestOdds,
      },
    };
  }

  logger.warn('No odds found for bet', { 
    homeTeam: bet.homeTeamName, 
    awayTeam: bet.awayTeamName,
    market: bet.betMarket,
  });
  
  return { 
    success: false, 
    error: { code: 'NOT_FOUND', message: 'Event or odds not found' } 
  };
}

/**
 * Enrich bets with live odds
 * @param {Array} bets - Array of bet objects
 * @returns {Promise<Array>} - Bets with odds field updated
 */
async function enrichBetsWithOdds(bets) {
  const enriched = [];
  
  for (const bet of bets) {
    const oddsResult = await getOddsForBet(bet);
    
    if (oddsResult.success) {
      enriched.push({
        ...bet,
        odds: oddsResult.data.odds,
        oddsBookmaker: oddsResult.data.bookmaker,
        oddsEventId: oddsResult.data.eventId,
        oddsLine: oddsResult.data.line,
      });
    } else {
      // Keep bet without updated odds
      enriched.push(bet);
    }
  }
  
  return enriched;
}

/**
 * Clear odds cache
 */
function clearCache() {
  oddsCache.clear();
  logger.info('Odds cache cleared');
}

module.exports = {
  getSports,
  getUpcomingEvents,
  getEventOdds,
  getOddsForBet,
  enrichBetsWithOdds,
  findBestOdds,
  parseBetMarket,
  findEventByTeams,
  clearCache,
  MARKET_MAP,
  TARGET_BOOKMAKERS,
};

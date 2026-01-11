/**
 * Odds Service - Integration with The Odds API
 * https://the-odds-api.com/
 */
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { alertAdmin } = require('../telegram');
const { interpretMarket } = require('./marketInterpreter');

const BASE_URL = 'https://api.the-odds-api.com/v4';

// Target bookmakers (in order of preference)
const TARGET_BOOKMAKERS = ['bet365', 'betano', 'pinnacle', 'williamhill', '1xbet'];

// Priority sports to search first (covers major leagues and European competitions)
const PRIORITY_SPORTS = [
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_brazil_campeonato',
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_portugal_primeira_liga',
  'soccer_netherlands_eredivisie',
  'soccer_conmebol_copa_libertadores',
];

// Simple in-memory cache with automatic cleanup
const oddsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 500; // Max entries to prevent memory leak
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Cleanup every 10 minutes

// Periodic cache cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, cached] of oddsCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL_MS) {
      oddsCache.delete(key);
      cleaned++;
    }
  }

  // If still too big, remove oldest entries
  if (oddsCache.size > CACHE_MAX_SIZE) {
    const entries = [...oddsCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, oddsCache.size - CACHE_MAX_SIZE);
    toRemove.forEach(([key]) => oddsCache.delete(key));
    cleaned += toRemove.length;
  }

  if (cleaned > 0) {
    logger.debug('Cache cleanup completed', { removed: cleaned, remaining: oddsCache.size });
  }
}, CACHE_CLEANUP_INTERVAL_MS).unref(); // unref() so it doesn't prevent process exit

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
    // Don't filter by bookmakers - get all available odds
    // bet365/betano preference is handled in findBestOdds
    const url = `${BASE_URL}/sports/${sportKey}/events/${eventId}/odds?apiKey=${config.apis.theOddsApiKey}&regions=eu&markets=${market}`;
    
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
 * Find best odds for a bet from multiple bookmakers (Story 7.2: Fixed matching)
 * Strategy:
 * 1. STRICT: Only accept exact line match (±0.01 tolerance for floats)
 * 2. Type must match exactly (case-insensitive)
 * 3. Prefer target bookmakers, then highest odds
 * 
 * @param {object} oddsData - Odds data from API
 * @param {string} betType - 'over' or 'under' for totals, 'yes'/'no' for btts
 * @param {number} line - Line value (e.g., 2.5 for over 2.5), null for non-line markets
 * @returns {object|null} - { bookmaker, odds, line, exactMatch } or null
 */
function findBestOdds(oddsData, betType, line = null) {
  // Normalize betType to lowercase
  const normalizedBetType = betType?.toLowerCase()?.trim();
  
  logger.debug('findBestOdds: Starting search', { 
    betType: normalizedBetType, 
    line,
    hasBookmakers: !!oddsData?.bookmakers?.length,
    bookmakerCount: oddsData?.bookmakers?.length || 0
  });

  if (!oddsData?.bookmakers?.length) {
    logger.debug('findBestOdds: No bookmakers in odds data');
    return null;
  }

  // Collect all matching outcomes
  const candidates = [];
  const allOutcomes = []; // For debug logging

  for (const bookmaker of oddsData.bookmakers) {
    const isPreferred = TARGET_BOOKMAKERS.includes(bookmaker.key);
    
    for (const market of bookmaker.markets || []) {
      for (const outcome of market.outcomes || []) {
        // Normalize outcome type
        const outcomeType = outcome.name?.toLowerCase()?.trim();
        const outcomePoint = typeof outcome.point === 'string' 
          ? parseFloat(outcome.point) 
          : outcome.point;
        
        // Log all outcomes for debugging
        allOutcomes.push({
          bookmaker: bookmaker.key,
          type: outcomeType,
          point: outcomePoint,
          price: outcome.price
        });

        // STRICT TYPE MATCH
        if (normalizedBetType && outcomeType !== normalizedBetType) {
          continue;
        }
        
        // STRICT LINE MATCH (if line specified)
        if (line !== null) {
          // Skip if outcome has no point
          if (outcomePoint === undefined || outcomePoint === null || isNaN(outcomePoint)) {
            continue;
          }
          // Only accept exact match (±0.01 tolerance for float comparison)
          const lineDiff = Math.abs(outcomePoint - line);
          if (lineDiff > 0.01) {
            continue;
          }
        }
        
        // This is a valid candidate (exact match)
        candidates.push({
          bookmaker: bookmaker.key,
          bookmakerTitle: bookmaker.title,
          odds: outcome.price,
          line: outcomePoint ?? null,
          isPreferred,
          exactMatch: true,
        });
      }
    }
  }

  // Log all outcomes found for debugging
  logger.debug('findBestOdds: All outcomes found', { 
    totalOutcomes: allOutcomes.length,
    outcomes: allOutcomes.slice(0, 20), // Limit to first 20 for log size
    searchCriteria: { type: normalizedBetType, line }
  });

  if (candidates.length === 0) {
    logger.warn('findBestOdds: No exact match found', { 
      betType: normalizedBetType, 
      line,
      availableLines: [...new Set(allOutcomes.filter(o => o.type === normalizedBetType).map(o => o.point))].sort()
    });
    return null;
  }

  logger.debug('findBestOdds: Candidates found', { 
    count: candidates.length,
    candidates: candidates.map(c => ({ 
      bookmaker: c.bookmaker, 
      odds: c.odds, 
      line: c.line 
    }))
  });

  // Sort candidates: preferred bookmakers first, then by highest odds
  candidates.sort((a, b) => {
    // Preferred bookmakers first
    if (a.isPreferred && !b.isPreferred) return -1;
    if (!a.isPreferred && b.isPreferred) return 1;
    
    // Higher odds first
    return b.odds - a.odds;
  });

  const best = candidates[0];
  
  logger.info('findBestOdds: Selected best odds', { 
    bookmaker: best.bookmakerTitle,
    odds: best.odds,
    line: best.line,
    betType: normalizedBetType,
    isPreferred: best.isPreferred
  });
  
  return {
    bookmaker: best.bookmaker,
    odds: best.odds,
    line: best.line,
    exactMatch: best.exactMatch,
  };
}

/**
 * Parse bet market string to extract type and line (uses AI interpreter)
 * @param {string} betMarket - e.g., "mais de 2,5 gols", "Proteja com mais de 1,5 gols no jogo"
 * @returns {Promise<{marketKey: string|null, betType: string|null, line: number|null, supported: boolean}>}
 */
async function parseBetMarket(betMarket) {
  if (!betMarket) {
    return { marketKey: null, betType: null, line: null, supported: false };
  }
  
  // Use AI interpreter for robust parsing
  const interpreted = await interpretMarket(betMarket);
  
  return {
    marketKey: interpreted.market,
    betType: interpreted.type,
    line: interpreted.line,
    supported: interpreted.supported,
    reason: interpreted.reason,
  };
}

/**
 * Normalize team name for matching
 * Handles prefixes (FC, SK, FK), special chars (ø, ö, ü), and common variations
 */
function normalizeTeamName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    // Replace special characters with ASCII equivalents
    .replace(/ø/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ä/g, 'a')
    .replace(/é|è|ê/g, 'e')
    .replace(/á|à|â|ã/g, 'a')
    .replace(/í|ì|î/g, 'i')
    .replace(/ó|ò|ô|õ/g, 'o')
    .replace(/ú|ù|û/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ç/g, 'c')
    // Remove common prefixes/suffixes
    .replace(/^(fc|fk|sk|sc|ac|as|cd|cf|rc|rcd|afc|ssc|bsc|tsg|rb|sv|vfb|vfl|1\.|)\s*/g, '')
    .replace(/\s*(fc|cf|sc|united|city|hotspur|rovers|wanderers)$/g, '')
    // Remove all non-alphanumeric
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate similarity between two strings (simple Jaccard-like)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  // Check if one contains the other
  if (str1.includes(str2) || str2.includes(str1)) return 0.9;
  
  // Check first N characters match (handles "bodo" vs "bodoglimt")
  const minLen = Math.min(str1.length, str2.length, 5);
  if (str1.substring(0, minLen) === str2.substring(0, minLen)) return 0.8;
  
  // Simple character overlap
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));
  const intersection = [...set1].filter(c => set2.has(c)).length;
  const union = new Set([...set1, ...set2]).size;
  
  return intersection / union;
}

/**
 * Find event by team names with fuzzy matching
 * @param {Array} events - Array of events from API
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {object|null} - Matching event or null
 */
function findEventByTeams(events, homeTeam, awayTeam) {
  if (!events?.length || !homeTeam || !awayTeam) return null;
  
  const homeNorm = normalizeTeamName(homeTeam);
  const awayNorm = normalizeTeamName(awayTeam);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const event of events) {
    const eventHome = normalizeTeamName(event.home_team);
    const eventAway = normalizeTeamName(event.away_team);
    
    // Calculate match scores
    const homeScore = calculateSimilarity(homeNorm, eventHome);
    const awayScore = calculateSimilarity(awayNorm, eventAway);
    
    // Combined score (both teams must match reasonably)
    const combinedScore = (homeScore + awayScore) / 2;
    
    // Exact match
    if (homeScore === 1 && awayScore === 1) {
      return event;
    }
    
    // Good match (both teams > 0.7)
    if (homeScore >= 0.7 && awayScore >= 0.7 && combinedScore > bestScore) {
      bestScore = combinedScore;
      bestMatch = event;
    }
  }
  
  // Return best match if score is good enough
  if (bestScore >= 0.75) {
    logger.debug('Fuzzy match found', { 
      searched: `${homeTeam} vs ${awayTeam}`,
      matched: `${bestMatch.home_team} vs ${bestMatch.away_team}`,
      score: bestScore.toFixed(2),
    });
    return bestMatch;
  }
  
  return null;
}

/**
 * Get odds for a specific bet (Story 7.2: Enhanced logging)
 * @param {object} bet - Bet object with homeTeamName, awayTeamName, betMarket
 * @param {string} sportKey - Sport key (optional, defaults to searching all soccer)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getOddsForBet(bet, sportKey = null) {
  logger.debug('getOddsForBet: Starting', { 
    betId: bet.id,
    betMarket: bet.betMarket,
    homeTeam: bet.homeTeamName,
    awayTeam: bet.awayTeamName
  });

  const { marketKey, betType, line, supported, reason } = await parseBetMarket(bet.betMarket);
  
  logger.debug('getOddsForBet: Market parsed', { 
    betMarket: bet.betMarket,
    parsed: { marketKey, betType, line, supported, reason }
  });
  
  if (!supported || !marketKey) {
    logger.warn('Bet market not supported by Odds API', { 
      betMarket: bet.betMarket, 
      reason: reason || 'Unknown market' 
    });
    return { 
      success: false, 
      error: { 
        code: 'UNSUPPORTED_MARKET', 
        message: reason || `Market not supported: ${bet.betMarket}` 
      } 
    };
  }

  // Get sports if not specified, prioritize important leagues
  let sports = sportKey ? [{ key: sportKey }] : null;
  if (!sports) {
    const sportsResult = await getSports();
    if (!sportsResult.success) return sportsResult;
    
    // Sort sports: priority sports first, then the rest
    const prioritySet = new Set(PRIORITY_SPORTS);
    sports = [
      ...PRIORITY_SPORTS.filter(key => sportsResult.data.some(s => s.key === key)).map(key => ({ key })),
      ...sportsResult.data.filter(s => !prioritySet.has(s.key)),
    ];
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
  TARGET_BOOKMAKERS,
};

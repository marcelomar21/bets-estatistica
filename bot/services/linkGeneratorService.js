/**
 * Service: Generate deep links from URL templates (GURU-4)
 *
 * Uses a group's link_config + match data to build affiliate deep links.
 * Supports two template types:
 *   - generic: static URL (e.g. bookmaker sports homepage with affiliate tag)
 *   - search: URL with team/league placeholders for search-based linking
 */

const logger = require('../../lib/logger');

/**
 * Escape special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace template variables in a URL with match data
 * Variables are URI-encoded for safe URL construction.
 * @param {string} template - URL template with {variable} placeholders
 * @param {object} matchData - Match data to substitute
 * @param {object} linkConfig - Group's link config (for affiliate_tag)
 * @returns {string} URL with variables replaced
 */
function replaceTemplateVars(template, matchData, linkConfig) {
  const vars = {
    '{home_team}': matchData.homeTeam || '',
    '{away_team}': matchData.awayTeam || '',
    '{league}': matchData.league || '',
    '{kickoff_date}': matchData.kickoffDate || '',
    '{market}': matchData.market || '',
    '{affiliate_tag}': linkConfig.affiliateTag || '',
  };

  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, encodeURIComponent(value));
  }

  return result;
}

/**
 * Generate a deep link from a group's link config and match data
 * @param {object} linkConfig - Group's link_config JSONB
 * @param {object} matchData - { homeTeam, awayTeam, league, kickoffDate, market }
 * @returns {{ success: boolean, data?: { url: string }, error?: object }}
 */
function generateDeepLink(linkConfig, matchData) {
  if (!linkConfig || !linkConfig.enabled) {
    return { success: false, error: { code: 'LINK_DISABLED', message: 'Auto-link not enabled for this group' } };
  }

  const templateType = linkConfig.templateType || 'generic';

  let url;
  if (templateType === 'search') {
    url = linkConfig.searchUrl;
    if (!url) {
      logger.warn('[linkGenerator] searchUrl not configured, falling back to templateUrl');
      url = linkConfig.templateUrl;
    }
  } else {
    url = linkConfig.templateUrl;
  }

  if (!url) {
    return { success: false, error: { code: 'NO_TEMPLATE_URL', message: 'No template URL configured' } };
  }

  const generatedUrl = replaceTemplateVars(url, matchData || {}, linkConfig);

  return { success: true, data: { url: generatedUrl } };
}

/**
 * Build matchData object from a Supabase bet row with joined league_matches
 * @param {object} bet - Bet with league_matches join
 * @returns {object} matchData for generateDeepLink
 */
function buildMatchDataFromBet(bet) {
  const match = bet.league_matches || {};
  const kickoffDate = match.kickoff_time
    ? new Date(match.kickoff_time).toISOString().split('T')[0]
    : '';

  return {
    homeTeam: match.home_team_name || '',
    awayTeam: match.away_team_name || '',
    league: match.league_seasons?.league_name || match.league_name || '',
    kickoffDate,
    market: bet.bet_market || '',
  };
}

module.exports = {
  generateDeepLink,
  replaceTemplateVars,
  buildMatchDataFromBet,
  escapeRegExp,
};

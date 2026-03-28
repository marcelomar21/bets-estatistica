/**
 * Link Generator Service
 * Generates deep links from URL templates using match data.
 * GURU-4: Automatic affiliate link generation per group.
 */

const logger = require('../../lib/logger');

/**
 * Available template variables and their descriptions
 * @type {Record<string, string>}
 */
const TEMPLATE_VARIABLES = {
  '{home_team}': 'Home team name',
  '{away_team}': 'Away team name',
  '{league}': 'League name',
  '{kickoff_date}': 'Kickoff date (YYYY-MM-DD)',
  '{market}': 'Bet market',
  '{affiliate_tag}': 'Affiliate tracking tag',
};

/**
 * Replace template variables in a URL string with actual values.
 * Unresolved variables are removed to avoid broken URLs.
 * @param {string} template - URL template with {variable} placeholders
 * @param {Record<string, string>} vars - Variable values
 * @returns {string} Resolved URL
 */
function resolveTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    if (value != null) {
      result = result.replace(new RegExp(escapeRegex(key), 'g'), encodeURIComponent(value));
    }
  }
  // Remove any unresolved variables
  result = result.replace(/\{[a-z_]+\}/g, '');
  return result;
}

/**
 * Escape special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build template variables from match and bet data
 * @param {object} matchData - Match information
 * @param {string} matchData.homeTeamName - Home team name
 * @param {string} matchData.awayTeamName - Away team name
 * @param {string} [matchData.leagueName] - League name
 * @param {string} [matchData.kickoffTime] - Kickoff time (ISO 8601)
 * @param {string} [matchData.betMarket] - Bet market
 * @param {object} linkConfig - Group's link configuration
 * @param {string} [linkConfig.affiliateTag] - Affiliate tracking tag
 * @returns {Record<string, string>}
 */
function buildTemplateVars(matchData, linkConfig) {
  const vars = {
    '{home_team}': matchData.homeTeamName || '',
    '{away_team}': matchData.awayTeamName || '',
    '{league}': matchData.leagueName || '',
    '{market}': matchData.betMarket || '',
    '{affiliate_tag}': linkConfig.affiliateTag || '',
  };

  if (matchData.kickoffTime) {
    try {
      vars['{kickoff_date}'] = new Date(matchData.kickoffTime).toISOString().split('T')[0];
    } catch {
      vars['{kickoff_date}'] = '';
    }
  }

  return vars;
}

/**
 * Generate a deep link for a bet based on a group's link configuration.
 * @param {object} linkConfig - Group's link configuration
 * @param {boolean} linkConfig.enabled - Whether auto-link is enabled
 * @param {string} linkConfig.templateUrl - Generic template URL
 * @param {string} linkConfig.templateType - 'generic' or 'search'
 * @param {string} [linkConfig.searchUrl] - Search-based template URL
 * @param {string} [linkConfig.affiliateTag] - Affiliate tracking tag
 * @param {object} matchData - Match information for template variables
 * @param {string} matchData.homeTeamName - Home team name
 * @param {string} matchData.awayTeamName - Away team name
 * @param {string} [matchData.leagueName] - League name
 * @param {string} [matchData.kickoffTime] - Kickoff time
 * @param {string} [matchData.betMarket] - Bet market
 * @returns {{ success: boolean, link?: string, error?: string }}
 */
function generateDeepLink(linkConfig, matchData) {
  if (!linkConfig || !linkConfig.enabled) {
    return { success: false, error: 'Link config not enabled' };
  }

  const vars = buildTemplateVars(matchData, linkConfig);

  if (linkConfig.templateType === 'search' && linkConfig.searchUrl) {
    const link = resolveTemplate(linkConfig.searchUrl, vars);
    return { success: true, link };
  }

  if (linkConfig.templateUrl) {
    const link = resolveTemplate(linkConfig.templateUrl, vars);
    return { success: true, link };
  }

  return { success: false, error: 'No template URL configured' };
}

/**
 * Generate a preview deep link using sample match data.
 * Used by the admin panel "Test Link" feature.
 * @param {object} linkConfig - Group's link configuration
 * @returns {{ success: boolean, link?: string, error?: string }}
 */
function generatePreviewLink(linkConfig) {
  const sampleMatch = {
    homeTeamName: 'Flamengo',
    awayTeamName: 'Vasco',
    leagueName: 'Brasileirão Série A',
    kickoffTime: new Date().toISOString(),
    betMarket: 'Ambas Marcam',
  };
  return generateDeepLink(linkConfig, sampleMatch);
}

module.exports = {
  generateDeepLink,
  generatePreviewLink,
  resolveTemplate,
  buildTemplateVars,
  TEMPLATE_VARIABLES,
};

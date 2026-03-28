/**
 * Link Generator — generates deep links from URL templates.
 * Admin panel version (TypeScript) of bot/services/linkGeneratorService.js.
 * GURU-4: Automatic affiliate link generation per group.
 */

import type { LinkConfig } from '@/types/database';

interface MatchData {
  homeTeamName: string;
  awayTeamName: string;
  leagueName?: string;
  kickoffTime?: string;
  betMarket?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveTemplate(template: string, vars: Record<string, string>): string {
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

function buildTemplateVars(matchData: MatchData, linkConfig: LinkConfig): Record<string, string> {
  const vars: Record<string, string> = {
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

export function generateDeepLink(
  linkConfig: LinkConfig | null | undefined,
  matchData: MatchData,
): { success: boolean; link?: string; error?: string } {
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

export function generatePreviewLink(
  linkConfig: LinkConfig,
): { success: boolean; link?: string; error?: string } {
  const sampleMatch: MatchData = {
    homeTeamName: 'Flamengo',
    awayTeamName: 'Vasco',
    leagueName: 'Brasileirão Série A',
    kickoffTime: new Date().toISOString(),
    betMarket: 'Ambas Marcam',
  };
  return generateDeepLink(linkConfig, sampleMatch);
}

const {
  generateDeepLink,
  generatePreviewLink,
  resolveTemplate,
  buildTemplateVars,
} = require('../linkGeneratorService');

describe('linkGeneratorService', () => {
  const baseLinkConfig = {
    enabled: true,
    templateUrl: 'https://betano.bet.br/sport/futebol?ref=GURU_AFF',
    templateType: 'generic',
    bookmakerName: 'Betano',
    affiliateTag: 'GURU_AFF',
  };

  const baseMatchData = {
    homeTeamName: 'Flamengo',
    awayTeamName: 'Vasco',
    leagueName: 'Brasileirão Série A',
    kickoffTime: '2026-03-28T19:00:00Z',
    betMarket: 'Ambas Marcam',
  };

  describe('resolveTemplate', () => {
    it('should replace template variables with encoded values', () => {
      const result = resolveTemplate(
        'https://example.com/search?q={home_team}+vs+{away_team}',
        { '{home_team}': 'Flamengo', '{away_team}': 'Vasco' },
      );
      expect(result).toBe('https://example.com/search?q=Flamengo+vs+Vasco');
    });

    it('should URL-encode special characters', () => {
      const result = resolveTemplate(
        'https://example.com/search?q={home_team}',
        { '{home_team}': 'São Paulo' },
      );
      expect(result).toBe('https://example.com/search?q=S%C3%A3o%20Paulo');
    });

    it('should remove unresolved variables', () => {
      const result = resolveTemplate(
        'https://example.com/{home_team}/{event_id}',
        { '{home_team}': 'Flamengo' },
      );
      expect(result).toBe('https://example.com/Flamengo/');
    });

    it('should replace all occurrences of the same variable', () => {
      const result = resolveTemplate(
        '{home_team}-{home_team}',
        { '{home_team}': 'Fla' },
      );
      expect(result).toBe('Fla-Fla');
    });
  });

  describe('buildTemplateVars', () => {
    it('should build vars from match data and link config', () => {
      const vars = buildTemplateVars(baseMatchData, baseLinkConfig);
      expect(vars['{home_team}']).toBe('Flamengo');
      expect(vars['{away_team}']).toBe('Vasco');
      expect(vars['{league}']).toBe('Brasileirão Série A');
      expect(vars['{market}']).toBe('Ambas Marcam');
      expect(vars['{affiliate_tag}']).toBe('GURU_AFF');
      expect(vars['{kickoff_date}']).toBe('2026-03-28');
    });

    it('should handle missing match data gracefully', () => {
      const vars = buildTemplateVars({}, { affiliateTag: 'X' });
      expect(vars['{home_team}']).toBe('');
      expect(vars['{away_team}']).toBe('');
    });
  });

  describe('generateDeepLink', () => {
    it('should generate a generic link', () => {
      const result = generateDeepLink(baseLinkConfig, baseMatchData);
      expect(result.success).toBe(true);
      expect(result.link).toBe('https://betano.bet.br/sport/futebol?ref=GURU_AFF');
    });

    it('should generate a search-based link with variables', () => {
      const searchConfig = {
        ...baseLinkConfig,
        templateType: 'search',
        searchUrl: 'https://betano.bet.br/search?q={home_team}+vs+{away_team}&ref={affiliate_tag}',
      };
      const result = generateDeepLink(searchConfig, baseMatchData);
      expect(result.success).toBe(true);
      expect(result.link).toBe('https://betano.bet.br/search?q=Flamengo+vs+Vasco&ref=GURU_AFF');
    });

    it('should fall back to templateUrl when search type has no searchUrl', () => {
      const searchConfig = {
        ...baseLinkConfig,
        templateType: 'search',
        searchUrl: '',
      };
      const result = generateDeepLink(searchConfig, baseMatchData);
      expect(result.success).toBe(true);
      expect(result.link).toBe('https://betano.bet.br/sport/futebol?ref=GURU_AFF');
    });

    it('should return error when config is not enabled', () => {
      const result = generateDeepLink({ ...baseLinkConfig, enabled: false }, baseMatchData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('should return error when config is null', () => {
      const result = generateDeepLink(null, baseMatchData);
      expect(result.success).toBe(false);
    });

    it('should return error when no template URL is configured', () => {
      const result = generateDeepLink({ enabled: true, templateType: 'generic', templateUrl: '' }, baseMatchData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No template URL');
    });

    it('should handle special characters in team names', () => {
      const searchConfig = {
        ...baseLinkConfig,
        templateType: 'search',
        searchUrl: 'https://example.com/search?q={home_team}+vs+{away_team}',
      };
      const result = generateDeepLink(searchConfig, {
        ...baseMatchData,
        homeTeamName: 'Atlético Mineiro',
        awayTeamName: 'Grêmio',
      });
      expect(result.success).toBe(true);
      expect(result.link).toContain('Atl%C3%A9tico%20Mineiro');
      expect(result.link).toContain('Gr%C3%AAmio');
    });
  });

  describe('generatePreviewLink', () => {
    it('should generate a preview link with sample data', () => {
      const result = generatePreviewLink(baseLinkConfig);
      expect(result.success).toBe(true);
      expect(result.link).toBe('https://betano.bet.br/sport/futebol?ref=GURU_AFF');
    });

    it('should use Flamengo vs Vasco as sample teams for search type', () => {
      const searchConfig = {
        ...baseLinkConfig,
        templateType: 'search',
        searchUrl: 'https://example.com/search?q={home_team}+vs+{away_team}',
      };
      const result = generatePreviewLink(searchConfig);
      expect(result.success).toBe(true);
      expect(result.link).toContain('Flamengo');
      expect(result.link).toContain('Vasco');
    });
  });
});

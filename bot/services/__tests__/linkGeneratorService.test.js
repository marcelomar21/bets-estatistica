const { generateDeepLink, replaceTemplateVars, buildMatchDataFromBet } = require('../linkGeneratorService');

describe('linkGeneratorService', () => {
  describe('generateDeepLink', () => {
    const baseLinkConfig = {
      enabled: true,
      templateUrl: 'https://betano.bet.br/sport/futebol?ref=GURU_AFF',
      templateType: 'generic',
      affiliateTag: 'GURU_AFF',
    };

    const matchData = {
      homeTeam: 'Flamengo',
      awayTeam: 'Vasco',
      league: 'Brasileirao Serie A',
      kickoffDate: '2026-03-28',
      market: 'Ambas Marcam',
    };

    it('returns error when linkConfig is null', () => {
      const result = generateDeepLink(null, matchData);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LINK_DISABLED');
    });

    it('returns error when linkConfig.enabled is false', () => {
      const result = generateDeepLink({ enabled: false }, matchData);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LINK_DISABLED');
    });

    it('returns error when no template URL is configured', () => {
      const result = generateDeepLink({ enabled: true }, matchData);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_TEMPLATE_URL');
    });

    it('generates a generic link with no variable substitution', () => {
      const result = generateDeepLink(baseLinkConfig, matchData);
      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://betano.bet.br/sport/futebol?ref=GURU_AFF');
    });

    it('generates a search-based link with team names substituted', () => {
      const config = {
        ...baseLinkConfig,
        templateType: 'search',
        searchUrl: 'https://betano.bet.br/search?q={home_team}+vs+{away_team}&ref={affiliate_tag}',
      };
      const result = generateDeepLink(config, matchData);
      expect(result.success).toBe(true);
      expect(result.data.url).toBe(
        'https://betano.bet.br/search?q=Flamengo+vs+Vasco&ref=GURU_AFF'
      );
    });

    it('falls back to templateUrl when searchUrl is missing for search type', () => {
      const config = {
        ...baseLinkConfig,
        templateType: 'search',
        // no searchUrl
      };
      const result = generateDeepLink(config, matchData);
      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://betano.bet.br/sport/futebol?ref=GURU_AFF');
    });

    it('handles special characters in team names with URI encoding', () => {
      const config = {
        ...baseLinkConfig,
        templateType: 'search',
        searchUrl: 'https://example.com/search?q={home_team}+vs+{away_team}',
      };
      const data = { ...matchData, homeTeam: 'São Paulo', awayTeam: 'Atlético MG' };
      const result = generateDeepLink(config, data);
      expect(result.success).toBe(true);
      expect(result.data.url).toContain('S%C3%A3o%20Paulo');
      expect(result.data.url).toContain('Atl%C3%A9tico%20MG');
    });

    it('replaces all template variables', () => {
      const config = {
        enabled: true,
        templateType: 'search',
        searchUrl: 'https://example.com?home={home_team}&away={away_team}&league={league}&date={kickoff_date}&market={market}&aff={affiliate_tag}',
        affiliateTag: 'MY_TAG',
      };
      const result = generateDeepLink(config, matchData);
      expect(result.success).toBe(true);
      expect(result.data.url).toContain('home=Flamengo');
      expect(result.data.url).toContain('away=Vasco');
      expect(result.data.url).toContain('league=Brasileirao%20Serie%20A');
      expect(result.data.url).toContain('date=2026-03-28');
      expect(result.data.url).toContain('market=Ambas%20Marcam');
      expect(result.data.url).toContain('aff=MY_TAG');
    });

    it('handles missing matchData gracefully', () => {
      const result = generateDeepLink(baseLinkConfig, null);
      expect(result.success).toBe(true);
      // No variables in generic URL, so it should be unchanged
      expect(result.data.url).toBe('https://betano.bet.br/sport/futebol?ref=GURU_AFF');
    });

    it('defaults templateType to generic when not specified', () => {
      const config = { enabled: true, templateUrl: 'https://example.com' };
      const result = generateDeepLink(config, matchData);
      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://example.com');
    });
  });

  describe('replaceTemplateVars', () => {
    it('replaces multiple occurrences of the same variable', () => {
      const template = '{home_team} vs {home_team}';
      const result = replaceTemplateVars(template, { homeTeam: 'Fla' }, {});
      expect(result).toBe('Fla vs Fla');
    });

    it('leaves unmatched variables as-is', () => {
      const template = '{unknown_var}';
      const result = replaceTemplateVars(template, {}, {});
      expect(result).toBe('{unknown_var}');
    });
  });

  describe('buildMatchDataFromBet', () => {
    it('extracts match data from a bet with league_matches join', () => {
      const bet = {
        bet_market: 'Over 2.5',
        league_matches: {
          home_team_name: 'Barcelona',
          away_team_name: 'Real Madrid',
          kickoff_time: '2026-03-28T20:00:00Z',
          league_seasons: { league_name: 'La Liga' },
        },
      };
      const result = buildMatchDataFromBet(bet);
      expect(result.homeTeam).toBe('Barcelona');
      expect(result.awayTeam).toBe('Real Madrid');
      expect(result.league).toBe('La Liga');
      expect(result.kickoffDate).toBe('2026-03-28');
      expect(result.market).toBe('Over 2.5');
    });

    it('handles missing league_matches gracefully', () => {
      const bet = { bet_market: 'Over 2.5' };
      const result = buildMatchDataFromBet(bet);
      expect(result.homeTeam).toBe('');
      expect(result.awayTeam).toBe('');
      expect(result.league).toBe('');
      expect(result.kickoffDate).toBe('');
      expect(result.market).toBe('Over 2.5');
    });

    it('handles missing league_seasons', () => {
      const bet = {
        bet_market: 'BTTS',
        league_matches: {
          home_team_name: 'TeamA',
          away_team_name: 'TeamB',
          kickoff_time: '2026-04-01T15:00:00Z',
        },
      };
      const result = buildMatchDataFromBet(bet);
      expect(result.league).toBe('');
    });
  });
});

const { buildReportBaseName } = require('../shared/naming');

const validateAnalysisPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload intermediário inválido ou ausente.');
  }
  if (!Number.isInteger(payload.match_id)) {
    throw new Error('Payload intermediário precisa conter match_id numérico.');
  }
  if (!payload.output || typeof payload.output !== 'object') {
    throw new Error('Payload intermediário precisa conter o objeto output.');
  }
  if (typeof payload.output.analise_texto !== 'string' || !payload.output.analise_texto.trim()) {
    throw new Error('Payload intermediário precisa conter output.analise_texto.');
  }
  return payload;
};

const deriveReportBaseName = (payload) => {
  const match = payload.context?.match_row || {};
  return buildReportBaseName({
    generatedAt: payload.generated_at,
    competitionName: match.competition_name || match.league_name || 'competicao',
    homeName: match.home_team_name,
    awayName: match.away_team_name,
  });
};

module.exports = {
  validateAnalysisPayload,
  deriveReportBaseName,
};

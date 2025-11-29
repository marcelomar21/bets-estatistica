const formatDateTime = (value) => {
  if (!value) return 'Data não disponível';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
};

const formatPercentage = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/d';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const normalizeOdds = (value) => {
  if (value === null || value === undefined) return 'n/d';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
};

const renderBet = (bet) => {
  return [
    `- **Mercado:** ${bet.mercado}`,
    `  - Pick: ${bet.pick}`,
    `  - Odds: ${normalizeOdds(bet.odds)}`,
    `  - Confiança: ${formatPercentage(bet.confianca)}`,
    `  - Risco: ${bet.risco}`,
    `  - Justificativa: ${bet.justificativa}`,
  ].join('\n');
};

const renderBetSection = (title, bets = []) => {
  if (!Array.isArray(bets) || bets.length === 0) {
    return `## ${title}\nNenhuma recomendação gerada.\n`;
  }
  return `## ${title}\n${bets.map(renderBet).join('\n\n')}\n`;
};

const generateMarkdown = (analysisPayload) => {
  if (!analysisPayload?.output) {
    throw new Error('Payload intermediário inválido: objeto output ausente.');
  }

  const match = analysisPayload.context?.match_row || {};
  const home = match.home_team_name || 'Time da casa';
  const away = match.away_team_name || 'Time visitante';
  const competition = match.competition_name || match.league_name || 'Competição não informada';

  const headerLines = [
    `# ${home} x ${away} – ${competition}`,
    `**Data:** ${formatDateTime(match.kickoff_time)}`,
    `**Match ID:** ${analysisPayload.match_id}`,
  ];

  const resumo = analysisPayload.output.analise_texto || 'Sem análise descritiva disponível.';

  return [
    headerLines.join('\n'),
    '',
    '## Resumo Analítico',
    resumo.trim(),
    '',
    renderBetSection('Apostas Seguras', analysisPayload.output.apostas_seguras),
    renderBetSection('Oportunidades', analysisPayload.output.oportunidades),
  ].join('\n').trim() + '\n';
};

module.exports = {
  generateMarkdown,
};



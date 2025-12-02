const sanitizeSegment = (value, { fallback = 'na', maxLength = 80 } = {}) => {
  const base = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = base.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maxLength);
  return cleaned || fallback;
};

const formatAnalysisDateLabel = (value) => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) {
    return 'sem_data';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}_${month}_${day}`;
};

const buildFixtureLabel = ({ homeName, awayName, separator = '_x_' } = {}) => {
  const home = sanitizeSegment(homeName, { fallback: 'time-casa' });
  const away = sanitizeSegment(awayName, { fallback: 'time-fora' });
  return `${home}${separator}${away}`;
};

const buildIntermediateFileName = ({ generatedAt, homeName, awayName, extension = '.json' }) => {
  const dateLabel = formatAnalysisDateLabel(generatedAt);
  const fixture = buildFixtureLabel({ homeName, awayName });
  return `${dateLabel}_${fixture}${extension}`;
};

const buildReportBaseName = ({ generatedAt, competitionName, homeName, awayName }) => {
  const dateLabel = formatAnalysisDateLabel(generatedAt);
  const competition = sanitizeSegment(competitionName, { fallback: 'competicao' });
  const fixture = buildFixtureLabel({ homeName, awayName });
  return `${dateLabel}_${competition}_${fixture}`;
};

module.exports = {
  sanitizeSegment,
  formatAnalysisDateLabel,
  buildFixtureLabel,
  buildIntermediateFileName,
  buildReportBaseName,
};


const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = path.join(__dirname, '../../data');
const INTERMEDIATE_DIR = path.join(DATA_DIR, 'analises_intermediarias');
const FINAL_DIR = path.join(DATA_DIR, 'analises_finais');
const REPORTS_DIR = path.join(DATA_DIR, 'relatorios');

const slugify = (value) => {
  if (!value) return 'na';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
};

const formatDateSlug = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return 'data';
  }
  return date.toISOString().slice(0, 10).replace(/-/g, '');
};

const assertMatchId = (matchId) => {
  const normalized = Number(matchId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('match_id inválido para leitura/gravação de relatórios.');
  }
  return normalized;
};

const getIntermediatePath = (matchId) => path.join(INTERMEDIATE_DIR, `${assertMatchId(matchId)}.json`);

const ensureDirectory = async (dirPath) => {
  await fs.ensureDir(dirPath);
  return dirPath;
};

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

const loadAnalysisPayload = async (matchId) => {
  const filePath = getIntermediatePath(matchId);
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    throw new Error(`Arquivo intermediário não encontrado: ${filePath}`);
  }
  const payload = await fs.readJson(filePath);
  return {
    payload: validateAnalysisPayload(payload),
    filePath,
  };
};

const fixtureSlug = (matchRow = {}) => {
  const home = slugify(matchRow.home_team_name || 'casa');
  const away = slugify(matchRow.away_team_name || 'fora');
  return `${home}vs${away}`;
};

const deriveReportBaseName = (payload, { includeMatchId = true } = {}) => {
  const match = payload.context?.match_row || {};
  const competition = slugify(match.competition_name || match.league_name || 'competicao');
  const fixture = fixtureSlug(match);
  const date = formatDateSlug(match.kickoff_time);
  const suffix = includeMatchId ? `_match${payload.match_id}` : '';
  return `${competition}_${fixture}_${date}${suffix}`;
};

const resolveReportPaths = (payload, options = {}) => {
  const baseName = deriveReportBaseName(payload, options);
  return {
    baseName,
    htmlPath: path.join(REPORTS_DIR, `${baseName}.html`),
    pdfPath: path.join(REPORTS_DIR, `${baseName}.pdf`),
  };
};

module.exports = {
  DATA_DIR,
  INTERMEDIATE_DIR,
  FINAL_DIR,
  REPORTS_DIR,
  slugify,
  formatDateSlug,
  getIntermediatePath,
  ensureDirectory,
  validateAnalysisPayload,
  loadAnalysisPayload,
  deriveReportBaseName,
  resolveReportPaths,
};



const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = path.join(__dirname, '../../data');
const INTERMEDIATE_DIR = path.join(DATA_DIR, 'analises_intermediarias');
const FINAL_DIR = path.join(DATA_DIR, 'analises_finais');
const REPORTS_DIR = path.join(DATA_DIR, 'relatorios');
const REPORTS_HTML_DIR = path.join(REPORTS_DIR, 'html');
const REPORTS_PDF_DIR = path.join(REPORTS_DIR, 'pdf');

const { buildReportBaseName } = require('../shared/naming');

const assertMatchId = (matchId) => {
  const normalized = Number(matchId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('match_id inválido para leitura/gravação de relatórios.');
  }
  return normalized;
};

const isJsonFile = (name = '') => name.toLowerCase().endsWith('.json');

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

const readValidatedPayload = async (filePath) => {
  const raw = await fs.readJson(filePath);
  return validateAnalysisPayload(raw);
};

const listIntermediatePayloads = async (matchFilter = null) => {
  const exists = await fs.pathExists(INTERMEDIATE_DIR);
  if (!exists) return [];

  const entries = await fs.readdir(INTERMEDIATE_DIR);
  const results = [];
  for (const name of entries) {
    if (!isJsonFile(name)) continue;
    const filePath = path.join(INTERMEDIATE_DIR, name);
    try {
      const payload = await readValidatedPayload(filePath);
      if (matchFilter && payload.match_id !== matchFilter) continue;
      results.push({
        matchId: payload.match_id,
        payload,
        fileName: name,
        filePath,
      });
    } catch (err) {
      console.warn(`[report] Ignorando arquivo inválido ${filePath}: ${err.message}`);
    }
  }
  return results;
};

const loadAnalysisPayload = async (matchId) => {
  const normalizedId = assertMatchId(matchId);
  const entries = await listIntermediatePayloads(normalizedId);
  if (!entries.length) {
    throw new Error(
      `Arquivo intermediário não encontrado para match_id ${normalizedId} dentro de ${INTERMEDIATE_DIR}.`,
    );
  }
  const { payload, filePath } = entries[0];
  return { payload, filePath };
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

const resolveReportPaths = (payload, options = {}) => {
  const baseName = deriveReportBaseName(payload, options);
  return {
    baseName,
    htmlPath: path.join(REPORTS_HTML_DIR, `${baseName}.html`),
    pdfPath: path.join(REPORTS_PDF_DIR, `${baseName}.pdf`),
  };
};

module.exports = {
  DATA_DIR,
  INTERMEDIATE_DIR,
  FINAL_DIR,
  REPORTS_DIR,
  REPORTS_HTML_DIR,
  REPORTS_PDF_DIR,
  ensureDirectory,
  validateAnalysisPayload,
  loadAnalysisPayload,
  deriveReportBaseName,
  resolveReportPaths,
  listIntermediatePayloads,
};



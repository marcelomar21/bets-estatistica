const fs = require('fs-extra');

const { renderHtmlReport } = require('./htmlRenderer');
const {
  loadAnalysisPayload,
  resolveReportPaths,
  REPORTS_HTML_DIR,
  ensureDirectory,
} = require('./reportUtils');

const ensureReportDirs = () => ensureDirectory(REPORTS_HTML_DIR);

/**
 * Generate HTML report for a match analysis
 * Note: PDF generation was removed (deprecated feature)
 */
const generateReportForMatch = async ({ matchId, payload } = {}) => {
  if (!payload && (matchId === undefined || matchId === null)) {
    throw new Error('É necessário informar matchId ou fornecer o payload da análise.');
  }

  const analysisPayload = payload || (await loadAnalysisPayload(matchId)).payload;
  const html = renderHtmlReport(analysisPayload);
  const { htmlPath } = resolveReportPaths(analysisPayload);

  await ensureReportDirs();
  await fs.writeFile(htmlPath, html, 'utf8');

  return { htmlPath, pdfPath: null };
};

module.exports = {
  generateReportForMatch,
};



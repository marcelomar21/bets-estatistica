const fs = require('fs-extra');

const { renderHtmlReport } = require('./htmlRenderer');
const { generatePdfFromHtml } = require('./pdfGenerator');
const {
  loadAnalysisPayload,
  resolveReportPaths,
  REPORTS_DIR,
  ensureDirectory,
} = require('./reportUtils');

const ensureReportsDir = () => ensureDirectory(REPORTS_DIR);

const generateReportForMatch = async ({ matchId, payload, skipPdf = false, pdfOptions } = {}) => {
  if (!payload && (matchId === undefined || matchId === null)) {
    throw new Error('É necessário informar matchId ou fornecer o payload da análise.');
  }

  const analysisPayload = payload || (await loadAnalysisPayload(matchId)).payload;
  const html = renderHtmlReport(analysisPayload);
  const { htmlPath, pdfPath } = resolveReportPaths(analysisPayload);

  await ensureReportsDir();
  await fs.writeFile(htmlPath, html, 'utf8');

  if (skipPdf) {
    return { htmlPath, pdfPath: null };
  }

  const finalPdfPath = await generatePdfFromHtml(html, pdfPath, pdfOptions);
  return { htmlPath, pdfPath: finalPdfPath };
};

module.exports = {
  generateReportForMatch,
};



const fs = require('fs-extra');
const htmlPdfNode = require('html-pdf-node');

const { renderHtmlReport } = require('./htmlRenderer');
const {
  loadAnalysisPayload,
  resolveReportPaths,
  REPORTS_HTML_DIR,
  REPORTS_PDF_DIR,
  ensureDirectory,
} = require('./reportUtils');

const ensureReportDirs = async () => {
  await ensureDirectory(REPORTS_HTML_DIR);
  await ensureDirectory(REPORTS_PDF_DIR);
};

const PDF_OPTIONS = {
  format: 'A4',
  printBackground: true,
  margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
};

const PDF_TIMEOUT_MS = 60_000;

const generatePdfFromHtml = async (html) => {
  const file = { content: html };
  const pdfBuffer = await Promise.race([
    htmlPdfNode.generatePdf(file, PDF_OPTIONS),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF generation timed out after 60s')), PDF_TIMEOUT_MS)
    ),
  ]);
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('PDF generation returned empty or invalid buffer');
  }
  return pdfBuffer;
};

const generateReportForMatch = async ({ matchId, payload } = {}) => {
  if (!payload && (matchId === undefined || matchId === null)) {
    throw new Error('É necessário informar matchId ou fornecer o payload da análise.');
  }

  const analysisPayload = payload || (await loadAnalysisPayload(matchId)).payload;
  const html = renderHtmlReport(analysisPayload);
  const { htmlPath, pdfPath } = resolveReportPaths(analysisPayload);

  await ensureReportDirs();
  await fs.writeFile(htmlPath, html, 'utf8');

  const pdfBuffer = await generatePdfFromHtml(html);
  await fs.writeFile(pdfPath, pdfBuffer);

  return { htmlPath, pdfPath };
};

module.exports = {
  generateReportForMatch,
  generatePdfFromHtml,
};



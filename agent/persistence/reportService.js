const htmlPdfNode = require('html-pdf-node');

const { renderHtmlReport } = require('./htmlRenderer');

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

const generateReportForMatch = async ({ payload }) => {
  if (!payload) {
    throw new Error('É necessário fornecer o payload da análise.');
  }

  const html = await renderHtmlReport(payload);
  const pdfBuffer = await generatePdfFromHtml(html);

  return { html, pdfBuffer };
};

module.exports = {
  generateReportForMatch,
  generatePdfFromHtml,
};

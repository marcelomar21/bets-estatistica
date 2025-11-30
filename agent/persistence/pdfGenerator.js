const path = require('path');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');

const buildLaunchOptions = () => {
  const options = {
    headless: 'new',
    args: [],
  };

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH ||
    process.env.PLAYWRIGHT_BROWSERS_PATH;

  if (executablePath) {
    options.executablePath = executablePath;
  }

  if (process.env.PUPPETEER_DISABLE_SANDBOX === 'true') {
    options.args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  return options;
};

const DEFAULT_PDF_OPTIONS = {
  format: 'A4',
  margin: {
    top: '16mm',
    right: '16mm',
    bottom: '20mm',
    left: '16mm',
  },
  printBackground: true,
  preferCSSPageSize: true,
};

const generatePdfFromHtml = async (html, outputPath, overrides = {}) => {
  if (!html || typeof html !== 'string') {
    throw new Error('HTML inválido para geração de PDF.');
  }

  const targetPath = path.resolve(outputPath);
  await fs.ensureDir(path.dirname(targetPath));

  const browser = await puppeteer.launch(buildLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.pdf({
      path: targetPath,
      ...DEFAULT_PDF_OPTIONS,
      ...overrides,
      margin: {
        ...DEFAULT_PDF_OPTIONS.margin,
        ...(overrides.margin || {}),
      },
    });
    return targetPath;
  } finally {
    await browser.close();
  }
};

module.exports = {
  generatePdfFromHtml,
};



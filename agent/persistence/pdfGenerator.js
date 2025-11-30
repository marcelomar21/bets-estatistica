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

const getContentHeight = async (page) => {
  const height = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight,
    );
  });
  return Math.ceil(height);
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

    const contentHeight = await getContentHeight(page);
    const boundedHeight = Math.min(Math.max(contentHeight, 600), 40000);
    const pdfOptions = {
      path: targetPath,
      width: overrides.width || '900px',
      height: overrides.height || `${boundedHeight}px`,
      printBackground: true,
      preferCSSPageSize: false,
      ...(overrides || {}),
    };
    await page.setViewport({
      width: Number.parseInt(pdfOptions.width, 10) || 1024,
      height: Math.min(boundedHeight, 16384),
      deviceScaleFactor: 2,
    });
    await page.pdf(pdfOptions);
    return targetPath;
  } finally {
    await browser.close();
  }
};

module.exports = {
  generatePdfFromHtml,
};



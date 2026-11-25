#!/usr/bin/env node
// Take screenshots of each slide in the reveal.js presentation
// and optionally render PDF reference pages.
//
// Usage:
//   node screenshot.js                    # screenshot all slides
//   node screenshot.js --pdf ref.pdf      # render PDF pages to PNGs
//   node screenshot.js --compare          # slides + PDF side by side

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const REFERENCE_DIR = path.join(__dirname, 'reference');
const WIDTH = 1920;
const HEIGHT = 1080;

async function screenshotSlides(browser) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const htmlPath = path.join(__dirname, 'index.html');

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Get total slide count
  const totalSlides = await page.evaluate(() => {
    return Reveal.getTotalSlides();
  });

  console.log(`Found ${totalSlides} slides`);

  const slidesDir = path.join(SCREENSHOT_DIR, 'slides');
  fs.mkdirSync(slidesDir, { recursive: true });

  for (let i = 0; i < totalSlides; i++) {
    await page.evaluate((idx) => {
      Reveal.slide(idx);
    }, i);
    await page.waitForTimeout(300);

    const filename = path.join(slidesDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: filename });
    console.log(`  ${filename}`);
  }

  await page.close();
  return totalSlides;
}

async function screenshotPdf(browser, pdfPath) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const pdfName = path.basename(pdfPath, path.extname(pdfPath));
  const outDir = path.join(SCREENSHOT_DIR, pdfName);
  fs.mkdirSync(outDir, { recursive: true });

  // Use PDF.js via Chromium's built-in PDF viewer won't work headless,
  // so we use a simple HTML page with pdf.js from CDN
  const html = `<!DOCTYPE html>
<html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
</head><body style="margin:0;background:#fff;">
<canvas id="c"></canvas>
<script type="module">
const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

const data = Uint8Array.from(atob(document.getElementById('pdfdata').textContent), c => c.charCodeAt(0));
const pdf = await pdfjsLib.getDocument({data}).promise;
window._pdfPageCount = pdf.numPages;

window._renderPage = async function(num) {
  const page = await pdf.getPage(num);
  const vp = page.getViewport({scale: 2.0});
  const canvas = document.getElementById('c');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
};
window._ready = true;
</script>
<script id="pdfdata" type="text/plain">${fs.readFileSync(pdfPath).toString('base64')}</script>
</body></html>`;

  const tmpHtml = path.join('/tmp', `pdf-render-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html);

  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window._ready === true', { timeout: 15000 });

  const pageCount = await page.evaluate(() => window._pdfPageCount);
  console.log(`PDF "${pdfName}" has ${pageCount} pages`);

  for (let i = 1; i <= pageCount; i++) {
    await page.evaluate((n) => window._renderPage(n), i);
    await page.waitForTimeout(200);

    // Resize viewport to canvas size for clean screenshot
    const dims = await page.evaluate(() => {
      const c = document.getElementById('c');
      return { w: c.width, h: c.height };
    });

    const filename = path.join(outDir, `page-${String(i).padStart(2, '0')}.png`);
    const canvas = page.locator('#c');
    await canvas.screenshot({ path: filename });
    console.log(`  ${filename}`);
  }

  fs.unlinkSync(tmpHtml);
  await page.close();
  return pageCount;
}

(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  if (args[0] === '--pdf' && args[1]) {
    await screenshotPdf(browser, path.resolve(args[1]));
  } else {
    // Screenshot slides
    await screenshotSlides(browser);

    // Also render any reference PDFs
    const pdfs = fs.readdirSync(REFERENCE_DIR).filter(f => f.endsWith('.pdf'));
    for (const pdf of pdfs) {
      await screenshotPdf(browser, path.join(REFERENCE_DIR, pdf));
    }
  }

  await browser.close();
  console.log('\nDone. Screenshots in:', SCREENSHOT_DIR);
})();

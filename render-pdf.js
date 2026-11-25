#!/usr/bin/env node
// Render a reveal.js deck to PDF via Chromium's print-pdf mode.
//
// Usage: node render-pdf.js <deck.html> <out.pdf>
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

function findBrowser() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

(async () => {
  const [deck, outPdf] = process.argv.slice(2);
  if (!deck || !outPdf) {
    console.error('Usage: node render-pdf.js <deck.html> <out.pdf>');
    process.exit(1);
  }
  const deckPath = path.resolve(deck);
  const outPath = path.resolve(outPdf);
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome/Chromium found. Set PUPPETEER_EXECUTABLE_PATH.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto(`file://${deckPath}?print-pdf`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  await page.pdf({
    path: outPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await browser.close();
  console.log(`Written: ${outPath}`);
})();

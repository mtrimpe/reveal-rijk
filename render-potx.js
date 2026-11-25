#!/usr/bin/env node
// Render each slide layout from a .potx file as a PNG screenshot.
// Parses the OOXML, extracts shape positions/colors, builds an HTML
// approximation, and screenshots it with Playwright.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const POTX_DIR = '/tmp/potx-extract/donkerblauw';
const OUT_DIR = path.join(__dirname, 'screenshots', 'potx-layouts');
const EMU_PER_PX = 12192000 / 1920; // slide width EMU / 1920px

// Slide dimensions
const SLIDE_W = 1920;
const SLIDE_H = 1080;

function emuToPx(emu) {
  return Math.round(parseInt(emu) / EMU_PER_PX);
}

function parseColor(xml, tag) {
  // Look for srgbClr within the context
  const m = xml.match(/srgbClr val="([A-Fa-f0-9]{6})"/);
  return m ? `#${m[1]}` : null;
}

function extractShapes(xml) {
  const shapes = [];
  // Match each sp (shape) element - use a simple regex approach
  const spRegex = /<p:sp>[\s\S]*?<\/p:sp>/g;
  let match;
  while ((match = spRegex.exec(xml)) !== null) {
    const sp = match[0];
    const shape = {};

    // Get placeholder type and index
    const phMatch = sp.match(/<p:ph([^/]*?)\/>/);
    if (phMatch) {
      const typeM = phMatch[1].match(/type="([^"]*)"/);
      const idxM = phMatch[1].match(/idx="([^"]*)"/);
      shape.phType = typeM ? typeM[1] : 'body';
      shape.phIdx = idxM ? idxM[1] : '';
    }

    // Get name
    const nameM = sp.match(/name="([^"]*)"/);
    shape.name = nameM ? nameM[1] : '';

    // Get position and size from xfrm
    const xfrmM = sp.match(/<a:xfrm[^>]*>[\s\S]*?<\/a:xfrm>/);
    if (xfrmM) {
      const offM = xfrmM[0].match(/<a:off x="(\d+)" y="(\d+)"\/>/);
      const extM = xfrmM[0].match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
      if (offM && extM) {
        shape.x = emuToPx(offM[1]);
        shape.y = emuToPx(offM[2]);
        shape.w = emuToPx(extM[1]);
        shape.h = emuToPx(extM[2]);
      }
    }

    // Get fill color
    const solidFill = sp.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);
    if (solidFill) {
      shape.fillColor = parseColor(solidFill[0]);
    }

    // Get text content (placeholder text)
    const texts = [];
    const tRegex = /<a:t>([^<]*)<\/a:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(sp)) !== null) {
      if (tMatch[1].trim()) texts.push(tMatch[1].trim());
    }
    shape.text = texts.join(' ');

    // Font size
    const szM = sp.match(/sz="(\d+)"/);
    shape.fontSize = szM ? Math.round(parseInt(szM[1]) / 100) : null;

    // Font color
    const runClr = sp.match(/<a:rPr[^>]*>[\s\S]*?<a:solidFill>[\s\S]*?srgbClr val="([A-Fa-f0-9]{6})"[\s\S]*?<\/a:solidFill>/);
    shape.fontColor = runClr ? `#${runClr[1]}` : null;

    if (shape.x !== undefined) {
      shapes.push(shape);
    }
  }
  return shapes;
}

function extractBgShapes(xml) {
  // Extract background shapes (cSld > bg or spTree shapes without placeholders)
  const bgShapes = [];

  // Look for background fill
  const bgMatch = xml.match(/<p:bg>[\s\S]*?<\/p:bg>/);
  if (bgMatch) {
    const color = parseColor(bgMatch[0]);
    if (color) {
      bgShapes.push({ type: 'bg', color });
    }
  }

  return bgShapes;
}

function getLayoutLabel(phType) {
  const labels = {
    title: 'Titel',
    subTitle: 'Ondertitel',
    body: 'Tekst',
    pic: 'Afbeelding',
    sldNum: '',
    dt: '',
    ftr: '',
    none: 'Vrij vlak',
    secHead: 'Sectietitel',
    blank: '',
  };
  return labels[phType] || phType || '';
}

function shapeToHtml(shape) {
  if (!shape.w || !shape.h) return '';

  // Skip tiny metadata placeholders (slide number, date, footer)
  if (shape.phType === 'sldNum' || shape.phType === 'dt' || shape.phType === 'ftr') return '';
  if (shape.phType === 'slidenum') return '';
  if (shape.w < 30 && shape.h < 30) return '';

  const label = shape.text || getLayoutLabel(shape.phType) || shape.name;
  const isTitle = shape.phType === 'title' || shape.phType === 'secHead';
  const isPic = shape.phType === 'pic';
  const isBody = shape.phType === 'body' || shape.phType === 'subTitle';

  let bgColor = shape.fillColor || 'transparent';
  let borderColor = '#999';
  let textColor = shape.fontColor || '#154273';
  let fontSize = shape.fontSize || (isTitle ? 24 : isPic ? 14 : 16);

  if (isPic) {
    bgColor = bgColor === 'transparent' ? '#e8e8e8' : bgColor;
    borderColor = '#ccc';
    textColor = '#888';
  }
  if (isTitle) {
    fontSize = Math.max(fontSize, 20);
  }

  const border = bgColor === 'transparent' ? `2px dashed ${borderColor}` : 'none';

  return `<div style="
    position: absolute;
    left: ${shape.x}px; top: ${shape.y}px;
    width: ${shape.w}px; height: ${shape.h}px;
    background: ${bgColor};
    border: ${border};
    display: flex; align-items: ${isTitle ? 'flex-end' : 'flex-start'}; justify-content: flex-start;
    padding: 12px;
    box-sizing: border-box;
    font-family: Verdana, sans-serif;
    font-size: ${fontSize}px;
    color: ${textColor};
    font-weight: ${isTitle ? '700' : '400'};
    overflow: hidden;
    ${isPic ? 'font-style: italic;' : ''}
  ">${label}</div>`;
}

function masterBgToHtml(masterXml) {
  // Extract solid bg color from slide master
  const bgMatch = masterXml.match(/<p:bg>[\s\S]*?<\/p:bg>/);
  if (bgMatch) {
    const color = parseColor(bgMatch[0]);
    if (color) return color;
  }
  return '#ffffff';
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const masterXml = fs.readFileSync(path.join(POTX_DIR, 'ppt/slideMasters/slideMaster1.xml'), 'utf8');
  const masterBg = masterBgToHtml(masterXml);

  // Also extract shapes from the slide master that appear on all layouts
  const masterShapes = extractShapes(masterXml).filter(s =>
    s.phType !== 'sldNum' && s.phType !== 'dt' && s.phType !== 'ftr' && s.phType !== 'slidenum'
  );

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  for (let i = 1; i <= 20; i++) {
    const xmlPath = path.join(POTX_DIR, `ppt/slideLayouts/slideLayout${i}.xml`);
    const xml = fs.readFileSync(xmlPath, 'utf8');

    const nameM = xml.match(/name="([^"]*)"/);
    const layoutName = nameM ? nameM[1] : `Layout ${i}`;

    const shapes = extractShapes(xml);

    // Determine background
    let bg = masterBg;
    const layoutBg = extractBgShapes(xml);
    if (layoutBg.length > 0 && layoutBg[0].color) {
      bg = layoutBg[0].color;
    }
    // Check for useBgFill or direct solidFill on background
    const solidBgMatch = xml.match(/<p:bg>[\s\S]*?srgbClr val="([A-Fa-f0-9]{6})"[\s\S]*?<\/p:bg>/);
    if (solidBgMatch) {
      bg = `#${solidBgMatch[1]}`;
    }

    // Build HTML
    const shapesHtml = shapes.map(shapeToHtml).join('\n');

    // Beeldmerk placeholder (centered at top like in the actual template)
    const beeldmerk = `<div style="
      position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      width: 56px; height: 76px; background: #154273;
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    "><div style="color: white; font-size: 8px; text-align: center;">Beeldmerk</div></div>`;

    const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; background: ${bg}; position: relative; font-family: Verdana, sans-serif; }
  .label { position: absolute; top: 8px; left: 8px; font-size: 14px; color: rgba(0,0,0,0.4); z-index: 200; }
</style></head>
<body>
  <div class="label">${i}. ${layoutName}</div>
  ${beeldmerk}
  ${shapesHtml}
</body></html>`;

    const page = await browser.newPage({ viewport: { width: SLIDE_W, height: SLIDE_H } });
    await page.setContent(html);
    await page.waitForTimeout(100);

    const filename = path.join(OUT_DIR, `layout-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: filename });
    console.log(`${filename} — ${layoutName}`);
    await page.close();
  }

  await browser.close();
  console.log(`\nDone. ${OUT_DIR}`);
})();

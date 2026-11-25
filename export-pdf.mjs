// Vector-PDF met selecteerbare tekst, pixelgetrouw aan de presentatie:
// per slide een page.pdf van de SCHERMweergave (emulateMediaType('screen')),
// dus zonder reveal's print-CSS. Losse pagina's; merge gebeurt daarna in python.
import puppeteer from 'puppeteer';
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { mkdirSync } from 'node:fs'; import { extname } from 'node:path';
const [deck, outdir] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const srv = createServer(async (req,res)=>{ try { const p = process.cwd() + decodeURIComponent(req.url.split('?')[0]); const d = await readFile(p); res.setHeader('Content-Type', mime[extname(p)]||'application/octet-stream'); res.end(d); } catch { res.statusCode=404; res.end(); } });
await new Promise(r=>srv.listen(8295,r));
const b = await puppeteer.launch({executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage']});
const p = await b.newPage();
await p.setViewport({width:1920, height:1080});
await p.emulateMediaType('screen');
await p.goto('http://localhost:8295/' + deck, {waitUntil:'networkidle0', timeout:90000});
await p.waitForFunction('window.Reveal && Reveal.isReady && Reveal.isReady()', {timeout:30000});
const total = await p.evaluate(() => Reveal.getTotalSlides());
for (let i = 0; i < total; i++) {
  await p.evaluate((n) => { let c=0; while (Reveal.getSlidePastCount() > n && c++<200) Reveal.prev(); while (Reveal.getSlidePastCount() < n && c++<200) Reveal.next(); }, i);
  await new Promise(r=>setTimeout(r,400));
  await p.pdf({path: `${outdir}/slide-${String(i).padStart(2,'0')}.pdf`,
    width:'1920px', height:'1080px', printBackground:true, pageRanges:'1',
    margin:{top:0,right:0,bottom:0,left:0}});
}
await b.close(); srv.close();
console.log('slides:', total);

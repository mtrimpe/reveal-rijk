// Voegt de losse slide-PDF's van export-pdf.mjs samen tot één deck-PDF
// en zet de documentmetadata (titel, auteur, onderwerp).
// Gebruik: node merge-pdf.mjs <slidedir> <uit.pdf> "<titel>" ["<auteur>"]
import { PDFDocument } from 'pdf-lib';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [dir, out, title, author] = process.argv.slice(2);
if (!dir || !out) {
  console.error('gebruik: node merge-pdf.mjs <slidedir> <uit.pdf> "<titel>"');
  process.exit(1);
}

const files = (await readdir(dir)).filter(f => f.endsWith('.pdf')).sort();
const merged = await PDFDocument.create();
for (const f of files) {
  const src = await PDFDocument.load(await readFile(join(dir, f)));
  const pages = await merged.copyPages(src, src.getPageIndices());
  pages.forEach(p => merged.addPage(p));
}

merged.setTitle(title || 'Presentatie');
if (author) merged.setAuthor(author);
merged.setSubject(title || '');
merged.setCreator('reveal-rijk');
merged.setProducer('reveal-rijk');

await writeFile(out, await merged.save());
console.log('pagina\'s:', merged.getPageCount(), '→', out);

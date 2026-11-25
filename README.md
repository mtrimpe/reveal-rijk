# reveal-rijk

A [reveal.js](https://revealjs.com/) theme that follows the Rijksoverheid
(Dutch central government) presentation layouts: 16:9, the 20 slide layouts
of the official PowerPoint template, in plain HTML and CSS.

Not an official product of the Rijksoverheid. See *Rijkshuisstijl* below
before you use it.

## Use

Copy `rijksoverheid.css` and `beeldmerk.svg` next to your deck and load the
theme after the reveal.js stylesheets:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
<link rel="stylesheet" href="rijksoverheid.css">
```

`index.html` is a demo deck that shows every layout. Open it in a browser,
or serve the folder with `python3 -m http.server`.

A slide picks its layout with a class on the `<section>`, for example
`title-white`, `chapter` or `quote-photo`. The demo deck lists them all.

## Export to PDF

```sh
npm install
node export-pdf.mjs <deck.html> <empty-outdir>   # one vector PDF per slide
node merge-pdf.mjs <outdir> <deck.pdf> "<title>" ["<author>"]
```

Run `export-pdf.mjs` from the folder that holds the deck. It renders the
screen view, so the PDF matches the slides. Use a fresh, empty output folder:
`merge-pdf.mjs` merges every PDF it finds there. Set
`PUPPETEER_EXECUTABLE_PATH` to use a system Chrome or Chromium.

`render-pdf.js` is the simpler alternative through reveal's own print mode.

## Comparing against the official template

`render-potx.js` and `render-potx-lo.sh` render the layouts of a `.potx`
template to PNG, and `screenshot.js` screenshots the demo deck, for
side-by-side comparison. The templates themselves are not in this
repository; they are distributed through rijkshuisstijl.nl (login required).
`bronnen-presentatie-templates.md` lists the sources that were consulted.

## Rijkshuisstijl

The Rijkshuisstijl, including the logo in `beeldmerk.svg`, belongs to the
Dutch central government and may only be used by, or on behalf of,
organisations that are part of it. Using this theme does not give you that
right. Check <https://www.rijkshuisstijl.nl/> for the rules that apply to
you.

## Licence

[EUPL-1.2](LICENSE). The licence covers the code in this repository, not the
Rijkshuisstijl or its logo.

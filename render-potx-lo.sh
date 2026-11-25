#!/bin/bash
# Render all slide layouts from a .potx file as individual PNGs
# using LibreOffice headless mode.
#
# Usage: ./render-potx-lo.sh <file.potx> [output-dir]
#
# Requires: libreoffice-impress, python3-pptx (pip install python-pptx)

set -e

POTX="${1:?Usage: $0 <file.potx> [output-dir]}"
OUTDIR="${2:-screenshots/potx-layouts-real}"

mkdir -p "$OUTDIR"
TMPDIR=$(mktemp -d)

echo "Creating PPTX with one slide per layout from: $POTX"

# Step 1: Convert POTX to PPTX by patching the content type
# (POTX and PPTX are identical ZIPs, only [Content_Types].xml differs)
cp "$POTX" "$TMPDIR/template.pptx"
cd "$TMPDIR"
mkdir -p patch
cd patch
unzip -q ../template.pptx '*Content_Types*'
sed -i 's/template\.main+xml/presentation.main+xml/g' '[Content_Types].xml'
zip -q ../template.pptx '[Content_Types].xml'
cd "$TMPDIR"
rm -rf patch

echo "  Patched content type to .pptx"

# Step 2: Use python-pptx to create a PPTX with one slide per layout
python3 - "$TMPDIR/template.pptx" "$TMPDIR/all-layouts.pptx" << 'PYEOF'
import sys
from pptx import Presentation
from pptx.enum.text import PP_ALIGN

pptx_path = sys.argv[1]
output_path = sys.argv[2]

prs = Presentation(pptx_path)

# Remove default slides
while len(prs.slides) > 0:
    rId = prs.slides._sldIdLst[0].rId
    prs.part.drop_rel(rId)
    del prs.slides._sldIdLst[0]

# Add one slide per layout with placeholder text
for i, layout in enumerate(prs.slide_layouts):
    slide = prs.slides.add_slide(layout)
    # Fill in placeholder text
    for ph in slide.placeholders:
        if ph.placeholder_format.type is not None:
            phtype = str(ph.placeholder_format.type)
        else:
            phtype = "none"

        if hasattr(ph, "text"):
            if "TITLE" in phtype or "CENTER_TITLE" in phtype:
                ph.text = "Voorbeeldtitel"
            elif "SUBTITLE" in phtype:
                ph.text = "Ondertitel of spreker"
            elif "BODY" in phtype:
                ph.text = "Placeholder tekst voor dit vlak"
            elif "SLIDE_NUMBER" in phtype:
                ph.text = str(i + 1)

    print(f"  Slide {i+1}: {layout.name}")

prs.save(output_path)
print(f"\nSaved {len(prs.slides)} slides to {output_path}")
PYEOF

# Step 3: Convert to PDF, then to PNGs
echo ""
echo "Converting to PDF via LibreOffice..."
soffice --headless --convert-to pdf --outdir "$TMPDIR" "$TMPDIR/all-layouts.pptx" 2>/dev/null

echo "Converting PDF pages to PNGs..."
if command -v pdftoppm &>/dev/null; then
    pdftoppm -r 192 -png "$TMPDIR/all-layouts.pdf" "$TMPDIR/page"

    i=1
    for f in "$TMPDIR"/page-*.png; do
        cp "$f" "$OUTDIR/layout-$(printf '%02d' $i).png"
        echo "  $OUTDIR/layout-$(printf '%02d' $i).png"
        i=$((i+1))
    done
else
    echo "ERROR: pdftoppm not found. Install poppler-utils."
    exit 1
fi

rm -rf "$TMPDIR"
echo ""
echo "Done. $((i-1)) layouts rendered to $OUTDIR/"

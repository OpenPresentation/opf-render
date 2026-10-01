# RR-12: vector PDF with selectable text

Evidence for the vector PDF export (`svgToPdf` default mode `vector`). Source checkout only (not a registry or browser-download result); measured on Windows 11 with Node 26.4 against core 0.11.4 examples. The packed/registry and cross-OS CI results are separate evidence and are not claimed here. This is not a PDF/UA or PDF/A claim and not a native PowerPoint fidelity claim.

## Approach and why

The converter reads the renderer's own SVG (the SVG the preview rasterizes) and writes PDF directly: shapes and paths as PDF paths, gradients as shadings, `<pattern>` as tiling patterns, `clip-path`, dashes and opacity natively, pictures as image XObjects, and text as text objects in embedded TrueType subsets. There is no second layout pass: every line, position and width is the SVG's.

Chosen over the alternatives:

- **pdf-lib** (already a dependency, raster mode keeps it): no glyph-level positioning, no control over `ToUnicode` or `/ActualText`, no shaping; its custom-font path would re-encode text itself.
- **pdfkit**: pulls its own font stack and Node zlib, whose output varies with the zlib build and CPU (Chromium zlib hashes differently with SIMD), and its text API lays out strings itself.
- **A small purpose-built writer (chosen)**: about 2,300 lines over `fontkit` (already used for measurement, so the PDF is shaped by the same engine that measured the preview), `bidi-js` (MIT, UAX #9 conformance-tested, new) and `pako` (pure-JS Flate, already in the tree through pdf-lib, now pinned directly). Determinism is by construction: objects numbered in first-use order, no timestamps unless the caller supplies them, file id = hash of the content, Flate in JavaScript.

Font subsetting is the package's own TrueType subsetter (`src/pdf-subset.js`): the glyphs used plus composite components, renumbered, with `head`, `hhea`, `maxp`, `hmtx`, `loca`, `glyf` and the original `cvt`/`fpgm`/`prep`. A CIDToGIDMap sends CIDs to the renumbered glyphs; a CID is one glyph drawing one piece of text, so fonts that build several letters from one shared glyph (Arabic beh and noon share a dotless body; the dots are separate glyphs) still get an exact `ToUnicode` map. A glyph that stands for no character (a split-off dot) maps to U+200B. Every bundled face is TrueType (`glyf`); a face without TrueType outlines, or whose OS/2 `fsType` forbids embedding (or is bitmap-only), is never embedded and never used; one that forbids subsetting is embedded whole.

## Results (805 core example slides, `npm run report:pdf-vector`)

Each slide is exported to a vector PDF, rasterized independently with pdf.js (`pdfjs-dist` 6.3.289, Apache-2.0, with `@napi-rs/canvas`) at 1 pixel per point, and compared with the resvg PNG preview of the same SVG (same font files) after averaging 2 x 2 pixels, because the two rasterizers anti-alias differently.

| Metric | p50 | p90 | p99 | max |
| --- | --- | --- | --- | --- |
| Mean absolute channel error (0-255) | 0.176 | 0.449 | 0.644 | 0.953 |
| Pixels differing by more than 48 in any channel | 0.0043 % | 0.0148 % | 0.0208 % | 0.0551 % |

552 of 805 slides are under 0.25 mean error, 759 under 0.5, all under 1. Declared tolerances (checked in `test/pdf-vector-visual.mjs`): mean error 1.5, large-difference pixels 0.5 %. Of the sample CI runs by default (every 16th slide, 51 slides) the worst mean error is 0.49. No slide used a raster fallback and none raised an error.

Text: for all 805 slides the text pdf.js extracts contains exactly the characters the SVG draws (compared as character multisets after NFKC, ignoring whitespace and bidirectional controls; order is the extractor's business). The ordered round trips (Latin accents and ligatures, decomposed marks, Japanese, Chinese, Korean, Arabic, Hebrew, mixed direction) are in `test/pdf-vector.mjs`.

Sizes (one slide per PDF, including its font subsets): vector 7.1 KB minimum, 27.0 KB median, 35.6 KB p90, 49.3 KB maximum, mean 25.7 KB; the raster-mode mean is 31.1 KB. Vector is not guaranteed to be smaller (image-heavy slides are dominated by their pictures either way). Export time is about 0.13 to 0.18 s per slide (about 1 s the first time a call loads the font pack; parsed fonts are cached across calls).

## Independent readers

- pdf.js 6.3.289: text extraction and rendering (the tests above).
- pdf-lib: parses every produced file (structure checks in the tests).
- poppler `pdftotext` (local spot checks only, not in CI): extracts the text; for right-to-left lines it honours `/ActualText` but reorders marks heuristically, so Arabic comes out with extra spacing.
- Not run: PDFium (Chrome), Acrobat, macOS Preview. No qpdf or veraPDF structural validation was available. Viewer coverage is a known gap.

## Decisions (vetoable)

1. **Default mode is `vector`**, raster is `mode: "raster"`. The plan makes vector the default once the corpus gates pass; they pass here (above). It is a behaviour change for callers of `svgToPdf`; the two existing raster tests (`webp`, `jpeg-orientation`) now say `mode: "raster"` explicitly.
2. **One SVG pixel is one PDF point**, in both modes (a 1280 x 720 slide is a 1280 x 720 pt page, as before), not 0.75 pt. Printing scales to fit.
3. **System fonts are rejected** in vector mode (`loadSystemFonts: true` throws), because they could be proprietary; fonts come from the bundled pack, `fontFiles`, `fontDirs` and the SVG's own `@font-face` data.
4. **A requested family without a face** is drawn with the family the PNG preview draws (`defaultFontFamily`, default Roboto) and reported (`pdf-font-substituted`), never silently.
5. **Raster fallback is per element** (filter, mask, nested SVG picture), reported with the element's trace path, and `strict: true` throws. Nothing else is rasterized.
6. **Tagging is on by default** (`tagged: false` removes it); decoration (backgrounds, rules, bullets) is an artifact, text lines of one traced block share one structure element, the `.title` placeholder is `H1`.
7. **Space separators** (no-break, thin, ideographic) map to a plain space in `ToUnicode`; text that uses one carries `/ActualText` so the exact characters survive in viewers that honour it.

## Limitations

- Not claimed: PDF/UA, PDF/A, a verified reading order for screen readers, list and table structure, per-span language, alternative text beyond `aria-label`.
- Text inside a translucent group (opacity applied to a group of several drawings) is drawn in a form XObject and is not in the structure tree; it still extracts.
- Extraction order of mixed or right-to-left lines follows the drawing order (visual) in readers that do not honour `/ActualText` (pdf.js). Letters built from split glyphs (Arabic dots) may show inserted spaces in such readers; viewers that honour `/ActualText` (PDFium, Acrobat, poppler) give the logical text.
- Only TrueType (`glyf`) fonts are embedded; CFF/OTF and WOFF faces are reported (`pdf-font-unsupported-format`) and skipped.
- SVG features not implemented as vectors: `filter`, `mask`, `marker`, nested `<svg>` and `image/svg+xml` pictures (rasterized per element), gradient spread methods other than pad, gradient stops with transparency (drawn opaque, reported), CSS stylesheets other than `@font-face` and inline styles, `textPath`, vertical text.
- CMYK and 16-bit pictures are converted to 8-bit sRGB; animated pictures use the first frame.
- Cross-OS byte identity is pinned by `test/pdf-vector.mjs` (a frozen fixture hashed with the pinned bundled fonts) and verified by CI on Linux; it was measured on Windows here.
- The command line: core's `packages/cli` has no render or export command yet (no dependency on this package), so there is nothing to wire; the CLI follow-up (RR-01) should call `svgToPdf(svgs, { mode: "vector", fontFiles, metadata })`.

# Composed glyph transforms

Implementation `75a20abe73a2faba9266bef23a36ba7294f8abf5` computes one complete
transform per glyph in source precision before SVG parses it. The independent
Canvas reference computes its matrix from the original font's HarfBuzz glyphs
and accepted layout coordinates, then calls `setTransform`. It does not read
SVG paths or transforms to construct the expected pixels.

## Why the reference changed

The earlier checkpoint retained 54 pixel mismatches. A focused nine-case probe
using Caladea Bold, Source Sans Regular CFF2 and Source Serif SmText Bold
TrueType compared actual SVG matrices, independently composed matrices,
sequential Canvas transforms and flattened SVG controls. Browser matrix
readbacks expose finite paint precision; nested composition can round a scale
or origin before applying the glyph offset. Passing the actual SVG matrix to
Canvas eliminated all differences in those controls. Independently composing
both transforms before handing them to the APIs also matched exactly.

The fix changes both production SVG representation and independent reference
composition. It does not adjust any glyph position, advance, font, source
string, layout value or tolerance. The old sequential Canvas reference is
still recorded as a diagnostic: it differs in 78 cases against the new SVG,
with maximum alpha difference 8/255. Those observations are retained rather
than represented as passing. The expected mathematical transforms and the
browser readbacks are preserved in `precision-report.json.gz`; the exact probe
source and log are alongside it. The previous failed test remains available
at `e6bc0c1` and its evidence directory.

## Local source acceptance

Node 24.21.0 and Chromium 153.0.8010.12 pass all 650 supported runs across
33 bundled/Office faces and 188 variable instances, with three strings per
face/instance. Thirteen unsupported-character cases reject explicitly. Every
supported case has identical independent glyph IDs, exact advances, original
source text and nonempty ink. All RGBA channels match with a required
difference of zero. Source font hashes are retained per case.

Five full slides produce identical Node/browser SVG, retain logical text
selection and preserve visible PNGs when the logical text's native font family
changes. Repeated left headers and footers require nonempty visible ink.
Fresh and sequential mounts, with and without font/selection changes, confirm
155 bright header pixels and 491 footer pixels per slide in the fixture bands.
The five retained full-size images were reviewed for rich formatting,
decorations, code, whitespace, lists, metrics and furniture placement. This
is fixture review, not a claim about every slide or native rasterizer.

Run `npm run test:painting` and `npm run test:painting-browser`. The latter
writes its status and any assertion failure before returning. Source and
fresh-package tests use the same browser command; CI now schedules it in
pinned Chromium on Mac, Windows and Linux. These CI results must be inspected
at their own commit before claiming platform acceptance.

## Installed and integration scope

The fresh-package harness adds the Node/browser painting tests, fixture files
and public TypeScript provider/option checks. It retains painting failures and
continues to the separate native variable-font gate. A missing `fontWeight`
in the first new TypeScript fixture rejected correctly; the initial failing
command is preserved and the fixture now supplies the required style.

The completed fresh Node 24 consumer verifies all 37 shipped-file hashes,
the existing 439 browser pixel pairs, the new 650 supported painting runs and
13 coverage rejections, and TypeScript 5.9.3 NodeNext/Bundler interfaces. The
painting browser command passes with zero RGBA differences; all five installed
slide PNG hashes match the source run. The dependency audit has zero findings.
The overall harness **still exits nonzero** at the unchanged native
variable-font gate. Its 712 observations and failing command are preserved in
`installed.json.gz` and `installed.log.gz`; passing painting does not supersede
that separate gate.

A focused source-editor probe using editor `40023fb` also exercises Arimo,
Caladea and Gelasio. All three retain the original document until commit and
restore it with one undo, including formatting, links, decomposed marks, notes
and metadata. The 62 sampled cluster starts differ from the painted origins
by at most 0.02099609375 CSS pixels. The probe does not cover ligature interiors,
wrapped/multiple styled runs, bidi, IME, other platforms or fresh installed
editor packages. This is recorded integration evidence, not full editor
acceptance or a replacement for the existing editor workflows.

Precise caret/selection geometry, preview editing/undo, complete accessibility
review, native PPTX export, wider font coverage, bidi/fallback and resource
acceptance remain open. Logical text still uses native DOM Range geometry.
Color/bitmap painting still rejects explicitly. No default, package release,
production-site adoption or native compatibility acceptance follows from this
checkpoint. Exact results and consumer identity are recorded in the
accompanying summary and full report.

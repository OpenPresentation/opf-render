# Prepared text caret geometry

Prepared text painting now supplies optional caret geometry from the same
physical font and accepted glyph run. `PaintedText.caretGeometry` contains
original UTF-16 offsets, font-unit x coordinates, horizontal direction and font
extents. Measurement results and their cache remain unchanged.

Cluster boundaries use accepted advances. Ligature interiors use GDEF coordinates
when one glyph supplies an unambiguous definition; otherwise equal advance
interpolation is explicitly marked `basis: 'interpolated'`. This is a deterministic
editing fallback, not a claim that the font defined those positions. Empty runs
retain a caret at source offset zero.

With tracing enabled, SVG glyph groups carry `data-opf-caret-map` in slide
coordinates. The map uses the same scale and origin as visible glyph paths.
Logical text remains available for accessibility and source mapping. Consumers
apply the group's screen transform when positioning caret and selection UI.

The pinned HarfBuzz wrapper does not expose its resolved buffer direction. The
generated Unicode 17 / HarfBuzz 14.4.0 direction table reproduces the existing
single-buffer default; it does not change shaping or implement paragraph bidi.
Hash-bound upstream source fixtures and both licenses are retained. Regenerate
with `node scripts/generate-font-directions.mjs`; check with `--check`.

Run `npm run test:carets` on Node 24 to verify original grapheme boundaries,
independent physical-font GDEF coordinates, explicit interpolation, cache
isolation and direction against pinned WASM. `npm run test:shaping` includes it;
`npm run test:shaping-packed` also exercises the shipped geometry and TypeScript
contract in fresh candidate packages. Editor interaction coverage belongs to
the dependent editor PR.

This remains part of the draft font-rendering work. Paragraph bidi, broader
font/settings coverage, performance and lifetime checks, and native/export
acceptance remain separate requirements. Existing native variable-font metric
failures are not waived by caret checks.

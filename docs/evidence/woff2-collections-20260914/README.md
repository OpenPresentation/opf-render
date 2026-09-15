# Shared collection glyphs and per-face metrics

The preceding codec skipped glyph reconstruction when a collection face reused
an already written glyph table. It also skipped the bounds/count information
needed by that face's transformed horizontal metrics. The retained public-API
failure rejects the first fixture with `invalid-font-container`.

The decoder now retains reconstructed glyph bounds/counts for the duration of
one decode and restores them for each face that reuses that table. Each face
keeps its own horizontal metric count. Shared transformed metrics are checked
for consistent reconstruction. Collection validation rejects duplicate face
tables, missing/mismatched glyph/location pairs and partial sharing before
decompression. Output remains bounded and font order/physical selection survive.

## Fixtures and independent verification

All 33 bundled faces participate. Each gets an explicitly renamed test derivative
with the same glyphs, copyright and license, but advances increased by 64 font
units and a full metric array. The latter deliberately differs from the compact
array in monospaced and trailing-shared-advance fonts. These are generated test
inputs; the shipped font files and authored presentation source remain unchanged.

An independent SFNT/TTC fixture writer shares identical table records. Google's
encoder and decoder accept that baseline collection and retain both original
metric tables and face order. The fixture then changes only the horizontal-metrics
transform, exercising all three flag combinations. One combination leaves the
first face's metrics untransformed, so shared glyph state must also be retained
when the first face does not need the optimization. The
[WOFF2 collection requirements](https://www.w3.org/TR/WOFF2/#collection_dir_format)
define table sharing/pairing; the
[Google decoder source](https://github.com/google/woff2/blob/master/src/woff2_dec.cc)
records its limitation for optimized metrics with reused glyph tables.

FontTools 4.60.2 independently parses the source TTC files and the WOFF2 collection
directory, then rewraps each face's unchanged transformed table bytes as a
standalone WOFF2 view. Its glyph decoder and `WOFF2HmtxTable.reconstruct` match
all 198 source-hashed face cases: every advance/bearing, glyph coordinate,
contour endpoint, on-curve flag and instruction byte, plus identity/license text.
FontTools does not provide whole-WOFF2-collection decoding in this version;
the scope is independent directory parsing and per-face reconstruction.

The initial reference-script bytes/string mismatch is retained separately.
The next attempt also exposed a FontTools recompilation limit: its metric
compiler collapses repeated trailing advances and updates its internal `hhea`,
while the outer reader still expects the original metric count (4,252 versus
4,250 bytes in the first failure). The checker therefore compares the unchanged
FontTools transform decoder's table object before recompilation. The valid
nonminimal fixtures remain in the matrix; they are not rewritten to fit the
reference compiler. The separate reference failure log is preserved.

## Browser and installed acceptance

The full browser matrix has 198 existing shaping/coverage cases and 373 pixel
pairs. The added pairs select both shared-glyph faces with distinct metrics,
and include wholly shared metrics and literal-glyph collection controls.
Every pair paints identical nonempty pixels to its original selected face and
keeps natural geometric-precision advances within the unchanged 0.1px gate.
Source metadata, local-only requests, owned FontFace cleanup and the existing
CSP pass.

The first expanded browser run exceeded Chromium's 100 MiB DevTools pipe-message
limit. The diagnostic log records `max_buffer_size=104857600` and connection
closure before the transfer completed. The harness now transfers at most 8 MiB
per batch while retaining one live browser page and one prepared shaper for all
373 comparisons. It does not reset the page/service or force garbage collection
between batches. The report records transfer sizes and the complete lifecycle.
This fixes fixture transport; runtime shaping is unchanged by the harness fix.

Fresh core/renderer tarballs pass all shipped-file hashes, the complete Node
and offline-browser matrices, public TypeScript NodeNext/Bundler consumers and
a zero-finding audit. The full renderer suite passes all 805 reviewed-baseline
slides without changing the baseline. Syntax and package checks pass.

Reports are losslessly compressed with deterministic gzip. The manifest hashes
runtime/tests and both stored and decoded report bytes. The earlier CI correction
at `2464591` passed Mac/Windows Node and Linux package/browser/coordinated checks;
its raw logs are retained as a separate prior checkpoint. Current-head CI remains
a separate acceptance requirement.

Reproduce with the coordinated Node 24 setup: `npm run test:shaping`,
`npm run test:shaping-browser`, `npm run test:shaping-packed`, and the full renderer
suite using the reviewed furniture baseline. For the optional independent check,
use a temporary Python environment with `fonttools==4.60.2` and `brotli==1.2.0`:

```sh
python test/font-woff2-collections-fonttools.py \
  artifacts/font-shaping/collections.json artifacts/font-shaping/collections-fonttools.json
```

The backend remains opt-in and unpublished. DFont, CFF/CFF2/variable instances,
paragraph itemization/bidi, fallback, performance/lifetime, full-slide ink and
shared editing/export acceptance remain required. Native Office recovery and
tab/image/physical-font gates retain their separate prerequisites.

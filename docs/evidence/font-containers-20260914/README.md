# Compressed fonts and selected collection faces

This unpublished candidate prepares WOFF/WOFF2 for the opt-in HarfBuzz registry
and fixes selected TTC embedding/browser loading with either backend. Node
24.21.0, HarfBuzz 14.4.0, Chromium 153.0.8010.12. Fontkit remains the default.

## Accepted portable checks

- `formats.json`: 66 compressed instances of all 33 pinned bundled faces;
  the prepared glyph IDs, original source ranges, offsets, advances and outlines
  match their original standalone font. Standalone wrapper metadata/private
  bytes and caller license annotations survive embedding. Non-transformed
  OpenType tables survive exactly; standalone checksums are repaired. Both
  faces of a real TTC and its Google-encoded WOFF2 collection match their
  originals, and embedded standalone fonts select the same PostScript face.
  A synthetic version-2 collection verifies explicit DSIG-removal reporting;
  no signature authenticity is claimed. Fourteen malformed/limit controls
  include Brotli and zlib streams that expand beyond their declared sizes.
- `browser.json.gz`: the prior 198 shaping/coverage cases still pass. Seventy
  compressed/collection cases compare actual canvas pixels with each original
  selected font; all are nonempty and byte-identical. Natural advances match
  the same HarfBuzz runs within the unchanged 0.1px limit (maximum container
  canvas delta 0.000154px). Geometric precision matches renderer configuration.
  Requests resolve only local intercepted module/WASM bytes; CSP has no
  JavaScript `unsafe-eval`. Each registry removes its own FontFaces.
- `installed.json.gz` and `packed.log`: fresh renderer/core tarballs, all 34
  shipped-file hashes, the Node/container/browser matrix, public TypeScript
  5.9.3 NodeNext and Bundler consumers, zero known audit findings. The retained
  consumer path is evidence, not a prerequisite for reproduction.
- `renderer-full.log`: the complete renderer suite passes all 805 slides in
  126 decks against the unchanged, previously reviewed furniture baseline.
  Source syntax checks and package validation also pass.

## Failures retained and their corrections

The first container fixture assumed every face covered a decomposed accent
and inferred italic selection from the file alone. Existing coverage/style
errors correctly rejected those assumptions. The matrix now uses explicit
published face descriptors and includes decomposed accents where covered; the
separate 264-case shaping suite retains its 33 missing-glyph rejections.

`initial-canvas-*` retains the canvas default-rendering mismatch: all 70
reference/candidate pixel pairs already matched, but default canvas advances
differed from the geometric-precision shaping target. The corrected test uses
the renderer's actual geometric precision and kerning settings. No font
offset or relaxed tolerance was introduced.

`codec-csp-assessment.json` retains the rejected dynamic-evaluation WASM wrapper
and the successful JavaScript decoder under the existing CSP. Production uses
a source-hashed adapter of woff-lib 0.0.3 with bounded synchronous Brotli output,
stream bounds, bounded reconstruction and invalid-transform rejection. The
adapter and all upstream notices ship in the repository/package. The initial
fflate 0.8.2 audit is retained; the runtime pins the patched 0.8.3 instead.

## Reproduction and limits

Use the documented coordinated Node 24 setup, then `npm run test:shaping`,
`npm run test:shaping-browser`, and `npm run test:shaping-packed`. The full
renderer suite uses
`OPF_GOLDEN_BASELINE=test/golden/opf-examples-png.furniture.sha256.json npm test`.
`manifest.json` hashes the tested source/runtime and retained reports. It does
not convert assertions or hashes into broader compatibility acceptance.

The 978KB test JavaScript bundle includes Fontkit and codecs; its gzip size is
291KB, alongside 427KB WASM (174KB gzip). These are full test-bundle sizes,
not incremental application costs. Decoding is synchronous after service
initialization; configured byte bounds are not a whole-process memory budget.

DFont resources, CFF/CFF2/variable-instance matrices, paragraph bidi/itemization,
fallback, broader shaping settings, performance/lifetime analysis, full-slide
ink review and shared editor/undo/PPTX acceptance with this backend remain open.
Canvas glyph equality does not prove full-slide containment or native Office
font identity. Native recovery, tab/image/provenance gates are unchanged. No
restricted Aptos input, package publication, backend promotion or site change.

Large raw JSON reports use deterministic gzip to keep generated glyph records
out of code diffs. Decode with Node `gunzipSync(readFileSync(path))`; the
manifest records both compressed and decoded SHA-256 values.

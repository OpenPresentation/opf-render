# WOFF2 horizontal metrics with literal glyph tables

The optional horizontal-metrics transform can accompany untransformed
`glyf`/`loca` tables. The Google-derived decoder previously read glyph counts
and left-side bearings only while reconstructing transformed glyphs, producing
an incorrect `hmtx` table for this combination. The retained public-service
failure shows Carlito's 10,128-byte table reconstructed as 5,064 bytes.

The adapter now reads bounded `head`, `maxp`, `hhea`, `loca` and `glyf` records
for this path, treating empty glyphs explicitly. It checks metric flags/counts,
dependency bounds, location order, glyph headers and complete stream lengths.
No glyphs, authored text, advances or test tolerances are modified.

## Independent reference and browser compatibility

The [WOFF2 metrics transform](https://www.w3.org/TR/WOFF2/#hmtx_table_format)
does not require transformed glyph tables. Google/OTS has a
[documented limitation for this combination](https://github.com/khaledhosny/ots/issues/190).
The initial probe incorrectly required Google acceptance before exercising
OPF; `initial-reference-limit.log` retains that failure separately from
`initial-product-failure.log`.

FontTools 4.60.2 with Brotli 1.2.0 independently accepts all 99 fixtures:
three transform flags across all 33 bundled faces. It checks original glyph
order and every advance/bearing, including fonts with trailing shared advances,
and reads the wrapper metadata and private-data sentinels. The fixture generator
uses Node's Brotli encoder; it does not use the product decoder. The reference
checker verifies source and fixture SHA-256 before comparison. Python and
FontTools are test-only and are not required by the package.

The actual Chromium probe also rejects the raw combination. The prepared
registry therefore supplies the equivalent standalone SFNT for browser
FontFace loading and CSS embedding, reports `woff2-hmtx-compatibility`, and
retains the complete original WOFF2 as `EmbeddedFont.sourceDataUrl`. Actual
SVG output stores that source and exact license annotation in escaped JSON
metadata. This duplicates source data for this compatibility path; it avoids
losing wrapper metadata or private bytes. Other standalone compressed inputs
retain their existing embedding behavior.

## Verification

- Public Node APIs pass 99 transformed-metrics cases with every reconstructed
  metric byte equal to the original, unchanged shaped glyph runs and retained
  source bytes. Seventeen malformed inputs reject explicitly; invalid external
  and non-font metadata URLs also reject.
- Fresh installed browser tests pass 198 existing shaping/coverage cases and
  171 nonempty, byte-identical canvas pairs, including the new 99 cases.
  Actual SVG metadata parses and preserves original font bytes and license
  text; owned FontFace cleanup, local-only requests and the existing CSP pass.
  Geometric-precision advances remain within the unchanged 0.1px gate.
- Fresh core/renderer tarballs pass all shipped-file hashes, public TypeScript
  NodeNext/Bundler consumers and a zero-finding dependency audit.
- The complete renderer suite passes all 805 reviewed-baseline slides without
  changing the baseline. Source syntax and package validation pass.

`hmtx.json.gz` records source/fixture identities and each rejection;
`fonttools.json.gz` records the independent reference and its versions.
`installed.json.gz` retains installed package hashes and the browser results.
The manifest hashes runtime/tests and both compressed and decoded reports.
Historical checkpoints remain unchanged.

Reproduce on the coordinated Node 24 checkout with `npm run test:shaping`,
`npm run test:shaping-packed` and the documented full renderer suite. To repeat
the independent reference, create a temporary Python environment with pinned
`fonttools==4.60.2` and `brotli==1.2.0`, then run:

```sh
python test/font-woff2-hmtx-fonttools.py \
  artifacts/font-shaping/hmtx.json artifacts/font-shaping/hmtx-fonttools.json
```

This does not establish transformed metrics with shared collection glyph
tables, DFont/CFF/CFF2/variable-instance coverage, paragraph itemization/bidi,
full-slide ink, editor/export integration or native compatibility. The service
remains opt-in, Fontkit remains the default, and packages/sites are not promoted.

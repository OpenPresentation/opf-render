# Variable metrics: portability and installed-package evidence

The variable advance gate remains open. This checkpoint strengthens input
validation, expands independent coverage, and identifies a native metrics
difference that a blanket rounding change would conceal.

## Implementation and metadata

The registry rejects Date, Map, Set, typed-array and boxed-value inputs rather
than silently treating them as empty axis maps. A zero-axis standalone face
also validates the requested PostScript name.

The metadata suite passes 88 positive controls for relocated records, optional
PostScript fields, named PostScript selection and Fontkit's extended-record
adapter. It also passes 58 rejection/limit controls, including 16 explicit
HarfBuzz rejections of hypothetical extended `fvar` records. Standard version
1.0 relocated records work with both backends. Future-compatible record strides
work in the Fontkit adapter, but are not accepted by pinned HarfBuzz; the initial
failure is retained. Modified table controls exist only in memory. Original
upstream font files and their licenses remain unchanged.

## Browser and font-unit evidence

The complete 712-case matrix uses the same font bytes and selected coordinates
in Chromium 153.0.8010.12 on Mac and Linux. Every within-platform pixel
comparison matches. The unchanged 0.1px advance gate gives different results:

| Platform | Fontkit failures | Prepared HarfBuzz failures |
| --- | ---: | ---: |
| Mac | 5 CFF2 | 5 variable TrueType |
| Linux | 5 CFF2 + 5 variable TrueType | 0 |

Ten rows, representing five TrueType instances through both backends, differ
between native Mac and Linux advances by at least 0.1px. The largest difference
is 0.134765625px. Other smaller cross-platform differences are retained in the
full comparison rather than rounded away.

An additional Mac diagnostic covers 188 instance selections, measuring one
and 128 copies of `H` at 12, 32 and 72px with kerning disabled. Fractional
Fontkit advances differ from native CFF2 by up to 4.57px for a repeated run;
whole-unit HarfBuzz advances differ from native TrueType by up to 4.57px.
The matching alternate calculation stays within 0.023px in this diagnostic.
Increasing HarfBuzz's scale alone does not recover the TrueType fractions.

The [pinned HarfBuzz 14.4.0 implementation](https://github.com/harfbuzz/harfbuzz/blob/14.4.0/src/hb-ot-hmtx-table.hh#L374)
rounds the variation delta before returning the unscaled advance. The inspected
Git blob is `99ea38042636788b92668f1fbb45e3ffe5adb86c`.
[Its scale API](https://harfbuzz.github.io/harfbuzz-hb-font.html#hb-font-set-scale)
provides fractional output precision but cannot recover fractions already
removed by that earlier calculation. The browser results establish the
platform difference; they do not prove that every text stack uses this policy.

The next fix needs an explicit, verified relationship between glyph metrics
and painting. Preserve shaping-dependent positioning and original source.
Do not apply a final-width offset or promote a platform-specific measurement
as universally correct. A font-functions approach also needs resource ownership
and callback-lifetime verification before adoption. No metric policy, glyph
advance, tolerance, source font data or browser rendering was changed here.

CI now runs the native diagnostic on Mac, Windows and Linux. The Windows
browser result for this new diagnostic is pending; the preceding Windows run
proves Node shaping and exact license checkout, not native browser fidelity.

## Fresh packages, regression and payload

Fresh core/renderer tarballs verify all 36 shipped-file hashes, the original
439 browser pixel pairs, the new 712-case Node matrix, public TypeScript 5.9.3
NodeNext/Bundler consumers including the variation API, and a zero-finding
dependency audit. The installed variable browser matrix reproduces the same
ten Mac failures across all 712 cases. The package command deliberately exits
nonzero and saves the full report before throwing; this is partial acceptance,
not a passing package gate. The full renderer regression passes all 805 reviewed
slides from 126 decks, and syntax checks pass.

The default minified browser font-loader bundle grows from 156,957 to 231,372
gzip bytes: +74,415 bytes for bounded compressed-font preparation and instance
selection. The SVG entry grows from 190,195 to 190,608 gzip bytes: +413 bytes.
The prior installed consumer's 35 hashes were verified before comparison.
Neither bundle contains the HarfBuzz WASM runtime. These are controlled bundle
measurements, not production-page loading measurements.

[CI run 34932786036](https://github.com/OpenPresentation/opf-render/actions/runs/34932786036)
at the preceding `7916fc1` passed Mac/Windows Node shaping and all earlier Linux
checks, including fresh packages, the reviewed corpus and coordinated installed
workflows. Linux then failed the new variable browser gate. All three raw logs
and the Linux report are retained. New-head CI remains separate.

## Reproduce

Use Node 24 with the coordinated dependency graph:

```sh
npm run build
npm run test:variations
npm run test:variation-metrics-probe
npm run test:shaping-packed
```

The last command currently fails the installed browser advance gate and writes
`artifacts/font-shaping/installed.json`, including all observations and the
failure. CI runs the source browser gate even if that installed gate fails,
and uploads both reports after the existing coordinated checks.

Reports and logs are compressed with deterministic gzip. `manifest.json`
records source hashes and both compressed and decoded evidence hashes. Earlier
evidence folders remain unchanged. This does not establish native PPTX/font
acceptance, publish packages, or deploy sites.

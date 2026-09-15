# Variable normalization correction

Implementation `489273e1ae0688cb8295cd09b7137636ad4c72f5` normalizes user
coordinates before Fontkit creates glyph, blend-vector or feature-variation
caches. It preserves the original user values, font bytes and licenses. Axis
defaults at either endpoint map to zero; four-character tags retain spaces.
The bounded `avar` reader validates version 1.0 records and treats missing
mandatory anchors as an identity mapping. Unsupported mapping versions,
including `avar` 2, and malformed records reject explicitly.

The coordinate sequence follows the [OpenType normalization rules](https://learn.microsoft.com/en-us/typography/opentype/spec/otvaroverview#coordinate-scales-and-normalization):
16.16 input and calculations, optional axis mapping, then signed 2.14 output.
It does not round derived glyph advances, alter the prepared HarfBuzz engine,
change browser painting, modify source text or widen acceptance tolerances.

## Independent reference and tests

The test-only reference uses FreeType 2.14.1's design-to-blend API, with the
specified final 2.14 conversion. All 188 selected instances match. The original
FontTools 4.60.2 floating-point reference remains in the fixture and evidence:
four Source Sans Semibold cases differ at a rounding boundary. FreeType
confirms the fixed-point result of 9831/16384 for those four cases; FontTools'
floating-point path gives 9830/16384. The initial failure is retained.

All 143,207 CFF2 glyph/instance comparisons now agree with HarfBuzz after its
integer advance policy is applied in the diagnostic. The predecessor had 458
one-unit disagreements. This verifies the normalization prerequisite; the
runtime continues to retain fractional Fontkit advances. Tests additionally
cover 24 endpoint/collapsed-axis controls, 8 exact-axis-tag controls, 10 mapping
controls, signed input ties and the specification's mapping example. Original
font hashes are checked before either independent reference is generated.

The 712-case Node/container matrix, 88 positive and 58 rejection/limit metadata
controls, complete 805-slide/126-deck regression, syntax and package validation
pass. All 712 browser cases still produce matching nonempty pixels and no page
errors. The unchanged 0.1px advance gate still fails five Fontkit CFF2 cases
(maximum 0.134625px) and five prepared HarfBuzz TrueType cases (0.132061px).
Complete observations are saved before the command exits nonzero.

Fresh installed core/renderer tarballs verify all 37 shipped-file hashes, the
same 712 Node cases and normalization controls, the original 439 browser pixel
comparisons, TypeScript 5.9.3 NodeNext/Bundler consumers, and a zero-finding
dependency audit. The installed 712-case browser matrix reproduces the same
ten Mac failures. Its complete report and nonzero command output are retained.

## Browser context remains significant

The preceding Windows job at `1b17e70` passes its diagnostic with both pinned
Chromium 153.0.8010.12 and system Edge 152.0.4191.66. Both kerning modes show
the same larger repeated-H CFF2 discrepancy, up to 66.446px against Fontkit
and 64.512px against HarfBuzz. Browser version and kerning mode do not explain
that observation. This diagnostic requires measurable glyphs and cleanup; it
does not prove correct instance painting or acceptable metric fidelity.
Actual glyph/instance painting and the platform metric contract remain open.

The preceding [CI run](https://github.com/OpenPresentation/opf-render/actions/runs/34935816037)
was cancelled by the subsequent implementation push after its Mac/Windows jobs
passed and Linux failed the installed variable browser gate. The Linux log is
retained; this is not a completed source-browser acceptance result. The
[implementation run](https://github.com/OpenPresentation/opf-render/actions/runs/34937168798)
is still in progress at this checkpoint. No new-head green result is claimed.

## Reproduce the independent reference

The manifest records the official FreeType release URL and archive hash. Build
that unmodified release with `./configure --without-harfbuzz --without-png
--without-brotli --without-bzip2 --without-zlib`, then `make`. This Mac host's
libtool incremental link failed; all 43 compiled objects were then linked
directly with `clang -dynamiclib ... -lpthread`. No source was changed. The
configure and failed link logs are retained. The successful reference library
is test-only and is neither committed nor included in the package.

With FontTools 4.60.2 installed in a separate Python environment, run:

```sh
python test/font-normalization-reference.py /absolute/path/to/libfreetype.dylib
npm run build
npm run test:normalization
npm run test:variations
npm run test:variations-browser
npm run test:shaping-packed
```

Use Node 24. CI reads the committed independent reference; it does not build or
ship FreeType. The last two commands retain their failing browser evidence.
The manifest records compressed, decoded and implementation hashes. Earlier
checkpoints are preserved. Package publication and native acceptance remain
separate requirements.

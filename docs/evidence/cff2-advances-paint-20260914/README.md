# CFF2 advances and selected-instance painting

Implementation `1b3da21926fa81b0614a4407b0e10142853d8a9f` applies HarfBuzz's
integer horizontal advance policy to Fontkit CFF2 instances after fixed-point
normalization and before glyph positioning. It rounds only the HVAR advance
contribution and clamps the resulting unsigned advance. Kerning, mark placement,
outline interpolation and TrueType advances retain their existing precision.
Original font bytes, licenses, source text and user axis values are unchanged.

## Verified runtime and package behavior

All 143,207 CFF2 glyph/instance advances agree with the independent HarfBuzz
reference. Another 188 runs compare glyph selection and complete positioning
against HarfBuzz advances followed by Fontkit's independent GPOS processing;
112 runs retain fractional positioning. This tests the placement of the fix
before shaping, rather than applying a correction to a final text width.

The full 805-slide/126-deck regression passes unchanged. Both source and fresh
installed 712-case Mac browser matrices retain identical nonempty pixels.
All 356 default Fontkit cases now pass the unchanged 0.1px advance gate; the
largest source difference is 0.002414013px. Five optional HarfBuzz TrueType cases
still fail, with maximum 0.132060547px. Both browser commands retain complete
reports and exit nonzero. Earlier ten-failure evidence remains unchanged.

Fresh tarballs also verify all 37 shipped-file hashes, the 712 Node cases,
normalization and positioning controls, existing 439 browser pixel pairs,
TypeScript 5.9.3 NodeNext/Bundler consumers and a zero-finding audit. Syntax and
package validation pass. These are local candidate results, not registry or
native Office acceptance.

## Independent paint diagnostic

The new diagnostic compares actual browser painting of `H`, `g` and `W` with
HarfBuzz outlines from the selected original font instance. It includes all
188 fixture selections (564 glyph cases), plus default/minimum/maximum outline
controls, direct native advances, nonempty masks, crop checks and font cleanup.
The original 330px-high draft clipped some descenders; its report is retained
as invalid evidence. The final 440px canvas leaves all measured ink inside its
borders. Portable image filenames also work on Windows.

On Mac Chromium 153.0.8010.12, no control has a smaller alpha-mask difference
than the selected outline. The largest selected differences are 8.54% for
CFF2 and 2.25% for TrueType. Two representative comparison images were reviewed:
the heavy CFF2 shape agrees closely, while the thin italic shows visible stroke
differences. These observations support selection of the requested instance
in the sampled glyphs; they do not prove identical rasterization or full-slide
fidelity. The metric probe now distinguishes raw Fontkit from the actual
registry: the CFF2 repeated-glyph discrepancy falls from 4.57px to 0.01px.

CI runs the diagnostic in pinned Chromium on Mac/Linux/Windows and separately
in system Edge on Windows. New Windows/Linux paint results remain pending at
this checkpoint. The diagnostic's successful exit requires measurable,
uncropped glyphs and cleanup; it deliberately does not assert fidelity based
on a newly chosen tolerance. The release-blocking browser advance gate remains.

Run with Node 24:

```sh
npm run test:normalization
npm run test:variation-metrics-probe
npm run test:variation-paint-probe
npm run test:variations-browser
npm run test:shaping-packed
```

Use `OPF_FONT_PROBE_BROWSER_CHANNEL=msedge` and a separate output directory to
compare Edge. The manifest records source, compressed/decoded evidence and
reviewed-image hashes. Remaining work includes actual Windows instance paint,
the TrueType metric/paint relationship, wider mappings, resource lifetime,
full-slide editing/export and the separate native compatibility requirements.

# Fixed variable instances: draft checkpoint

This checkpoint preserves the implementation and a failing acceptance test.
It is not a release acceptance record. PR #21 remains a draft stacked on #20.

The registry selects fixed coordinates or named instances once and uses the
same selection in Fontkit, HarfBuzz, browser FontFace and embedded SVG CSS.
The bounded `fvar` reader supplies metadata to Fontkit's existing variation
processor, fixing standard subfamily name IDs and honoring table offsets and
record strides without changing the original font bytes. The adapter depends
on Fontkit's internal table cache and needs continued compatibility coverage.
Both backends decode compressed fonts before instance processing; the impact
of the additional codec in the default browser bundle is not yet measured.

The test fixtures are 16 unmodified, revision-pinned Adobe Source Sans/Serif
fonts with their OFL licenses. They cover static CFF, CFF2 variable and gvar
variable TTF outlines. Independent FontTools metadata records 148 named
instances. Tests verify fixture hashes and create wrappers in memory.

## Observed results

- Node 24.21.0: 712 format/instance/backend cases pass across original OTF/TTF,
  WOFF, WOFF2, selected TTC and selected DFont. Twelve negative controls pass.
  Tests preserve selected coordinates, names, original font data, licenses,
  source ranges and independent backend measurements.
- Chromium 153.0.8010.12: all 712 comparisons preserve nonempty, identical
  pixels through FontFace and actual SVG font CSS. The matrix measures text
  inserted into that SVG; this is not complete-slide visual acceptance.
- **Ten measurements fail the unchanged 0.1px browser advance gate.** Five
  Fontkit cases use Source Serif CFF2; five HarfBuzz cases use Source Serif
  variable TTF. Maximum observed drift is 0.134625px and 0.132061px respectively.
  `summary.json` lists every case. The harness writes the entire matrix before
  asserting, and `browser-failure.log.gz` retains its first assertion failure.
  No tolerance was widened and no measurement correction was added.
- The existing full renderer regression passes all 805 reviewed baseline
  slides from 126 decks. Syntax and package metadata validation pass. The new
  Node matrix also ran directly; the regression log predates its addition to
  the `test:shaping` script, with identical runtime source.
- The preceding DFont commit `0ca1656` has successful Mac, Windows and Linux
  CI in run 34929695382. Its raw logs are retained here. That result does not
  establish CI acceptance of this newer checkpoint.

All detailed reports and logs are gzip-compressed. `manifest.json` records
their compressed and decoded hashes, source hashes and prior CI identities.
The initial named-instance probe and explicit-axis browser probe are retained
alongside both the passing Node matrix and failing browser matrix.

## Reproduce and continue

Use Node 24 and the coordinated core dependency graph documented in the repo.

```sh
npm run build
npm run test:variations
npm run test:variations-browser
```

The last command currently exits nonzero at the advance gate. CI runs it after
the existing installed-package and coordinated checks and uploads the reports
even on failure; the failure is not hidden by a passing-only CI configuration.

Before promotion, resolve the differences against independent browser and
font metadata evidence, add malformed and extended-record `fvar` controls,
exercise named PostScript selection, extend the fresh installed consumer to
the new matrix and TypeScript API, and measure default browser payload impact.
Paragraph itemization/bidi, fallback, resource/performance work, full-slide ink,
shared editing/undo and PPTX/native variable-instance acceptance remain separate.
No packages were published and no site adopted this draft checkpoint.

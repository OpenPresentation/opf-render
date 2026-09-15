# PR 21 variable-font failure investigation

The Linux job at https://github.com/OpenPresentation/opf-render/actions/runs/34988877862/job/104448014125 fails the native variable-font advance gate. This focused investigation used renderer source `aec153be28d5b2b9c2c0e6b0f15705fe3efaba5e`, Node 24.21.0, pinned dependencies, original hashed font fixtures, and local Chromium 153.0.8010.12 on macOS. No product source, acceptance threshold, font bytes, license, or source text was changed.

The retained Linux reports show matching original-font, FontFace and embedded SVG-CSS pixels. Selection and embedding work for the reported failure. The difference arises in glyph metrics: Fontkit retains fractional TrueType HVAR advances, while the native Linux browser uses rounded advances.

A diagnostic candidate applied the existing CFF2 HVAR policy to TrueType: round the HVAR glyph advance contribution before the unchanged Fontkit positioning phase. It did not add a text-width offset or alter glyph selection. [`test/font-variation-rounding-probe.mjs`](../../../test/font-variation-rounding-probe.mjs) retains the precise candidate, matches current measurements against all 356 retained Linux Fontkit rows, compares both platforms, and checks five affected instances in a fresh local browser.

| Unchanged 0.1px gate against retained native targets | Linux failures | Mac failures |
| --- | ---: | ---: |
| Current metrics | 5 | 0 |
| Candidate rounding before GPOS | 0 | 5 |

The exact reported SmText Bold row is:

- Current Fontkit: 334.06213682353496px.
- Candidate Fontkit: 334.1924402486086px.
- Retained Linux Chromium: 334.193115234375px.
- Fresh and retained Mac Chromium: 334.06195068359375px.

Fresh macOS browser checks reproduce all five candidate regressions, with errors from 0.1113631086px to 0.1341816406px. Current measurements differ from these five native Mac targets by less than 0.0002px. The candidate was rejected and never applied to product code.

The retained repeated-glyph diagnostics contain 254 of 1,128 TrueType measurements whose native Mac/Linux widths differ by at least 0.2px. One example, 128 `H` characters in Source Serif Roman Display Bold at 72px, measures 6377.474609375px on Linux and 6372.90625px on Mac: a gap of 4.568359375px. No platform-independent prediction can be within 0.1px of both. Averaging or increasing precision cannot solve this contract conflict.

`rounding-probe.json.gz` retains all rows, source hashes, coordinates, current/candidate glyph advances and positions, historical target measurements, and fresh native observations. Linux values are retained CI evidence, not a new Linux run. This is a rejected-candidate report, not passing package or fresh-package acceptance.

There is no safe portable rounding fix for the current contract. A remaining implementation path is to paint exact accepted glyphs and positions using the same run used for layout, preserving logical text and editing. Existing prepared-glyph tests cover that distinct path; they do not make the native variable-font gate pass. [Renderer issue 24](https://github.com/OpenPresentation/opf-render/issues/24) tracks the unresolved boundary separately from native PowerPoint acceptance.


Reproduce after `npm ci` and `npm run build`, using Node 24 and the pinned Playwright browser:

```sh
node test/font-variation-rounding-probe.mjs artifacts/font-shaping/variation-rounding-probe.json
```

This diagnostic exits successfully when its provenance, glyph identity, and actual-ink checks pass. Its result contains current and candidate failure counts; successful execution does not mean the candidate meets the native fidelity gate. The Linux column uses retained CI measurements, while live observations use the host browser. No Linux rerun, Windows acceptance, fresh-package acceptance, release, or deployment is claimed.

The next supported-contract or supported-subset implementation must satisfy [the font API limits](../../font-shaping.md) and issue 24's completion criteria. Existing prepared-path acceptance is distinct from native text compatibility. Do not remove failing native rows or silently substitute the prepared path in the comparison.

# Native variable-font metrics and painting

This checkpoint retains completed renderer CI at
[`41311deeaf18fa738f7e5934620c7e84710fde9e`](https://github.com/OpenPresentation/opf-render/actions/runs/34939577103)
and adds a reproducible cross-platform comparison command. It changes no
runtime font policy, source bytes, rendered output or acceptance tolerance.
`manifest.json` records source/report hashes, decoded gzip hashes, CI artifact
IDs/digests and the reviewed image files. The upstream source snapshots retain
their original notices.

## Completed acceptance and remaining failures

Mac and Windows shaping/diagnostic jobs passed. The Linux package job passed
the earlier package, 805-slide regression, browser and coordinated installed
workflows, then failed both fresh-package and source variable-font gates.
Its complete logs and reports are retained, including the nonzero outcomes.

Both Linux variable-browser reports contain 712 cases with matching nonempty
source/FontFace/SVG-CSS pixels. All CFF2 cases now pass. The 356 Fontkit cases
contain five TrueType advance failures (maximum 0.134625px); all 356 HarfBuzz
cases pass (maximum 0.049477051px). The failing Source Serif instances are
Roman SmText Bold, SmText Black and Subhead Light, and Italic SmText Light
Italic and Light Italic. This differs from the five prepared-HarfBuzz TrueType
failures in the prior Mac source/installed checkpoint. Windows did not run the
full source/installed variable-browser acceptance matrix in this workflow.

The Linux fresh package verifies 37 shipped-file hashes, 712 Node cases,
normalization/positioning controls, 439 prior browser pixel pairs, TypeScript
5.9.3 NodeNext/Bundler consumers and zero audit findings. Its variable-font
status remains failed. These are candidate-package results, not publication.

## Selected-instance painting

Each of the three pinned Chromium 153.0.8010.12 jobs compares 564 glyph cases:
188 selected instances of eight variable fonts, with `H`, `g` and `W` at 256px.
Windows Edge 152.0.4191.66 repeats the diagnostic. All original font hashes,
nonempty/uncropped ink, offline requests and font-face cleanup checks pass.
No default/minimum/maximum control is strictly closer than the selected outline.
The four reports retain all observations; this is sampled instance-selection
evidence, not complete glyph coverage or identical rasterization.

Reviewed images show the selected thin italic shape on Windows and Linux.
Stroke edges and, for the Windows TrueType specimen, horizontal ink bounds
still differ from the selected HarfBuzz outline. The report's alpha-mask error
ratio is descriptive; it has no invented fidelity pass threshold.

## Native advance incompatibility

The report joins source-hashed instances and requires the same Chromium and
HarfBuzz versions. Each platform has 2,256 `H` measurements: 188 instances,
12/32/72px, 1/128 repetitions and kerning off/on. These are diagnostic samples,
not additional passing or failing cases in the existing browser suite.

| Native targets | Outline | Maximum native width gap | Samples incompatible with one width at <0.1px |
| --- | --- | ---: | ---: |
| Mac / Windows | CFF2 | 64.509765625px | 862 / 1,128 |
| Mac / Windows | TrueType | 4.564453125px | 256 / 1,128 |
| Mac / Linux | CFF2 | 0px | 0 / 1,128 |
| Mac / Linux | TrueType | 4.568359375px | 254 / 1,128 |
| Windows / Linux | CFF2 | 64.509765625px | 862 / 1,128 |
| Windows / Linux | TrueType | 0.011718750px | 0 / 1,128 |

For any two measured widths separated by `d`, a common prediction has error
at least `d / 2` on one target. The report retains every joined sample and
that lower bound. It neither averages the widths nor modifies a shaped run.

All 282 Windows CFF2 single-glyph paint advances are whole pixels and equal
rounded HarfBuzz advances. Of 1,128 CFF2 metric samples, 1,116 equal simple
per-glyph pixel rounding; all 1,128 fit rounding first to 26.6 precision and
then to whole pixels. The twelve exceptions to simple rounding are retained.
This numeric model is diagnostic, not a replacement measurement policy.
Edge produces the same observations as pinned Chromium in these probes.

Pinned Chromium source
[routes CFF2 to Fontations](https://chromium.googlesource.com/chromium/src/+/153.0.8010.12/third_party/blink/renderer/platform/fonts/web_font_typeface_factory.cc#183).
Its Windows
[SkFont configuration](https://chromium.googlesource.com/chromium/src/+/153.0.8010.12/third_party/blink/renderer/platform/fonts/win/font_platform_data_win.cc#44)
does not use the `FontDescription` argument to select geometric-precision
hinting. Chromium's pinned Skia revision has a Fontations
[hinted advance rounding path](https://skia.googlesource.com/skia/+/9d07e5bad9e3e21da2426946e589daa647218271/src/ports/SkTypeface_fontations.cpp#579).
That source path is consistent with the observed Windows behavior. This is a
source-based explanation, not a captured native call trace.

## Reproduction and next implementation boundary

With each downloaded artifact rooted at its `font-shaping` directory:

```sh
npm run report:variation-portability -- report.json mac-artifacts windows-artifacts linux-artifacts
```

The command verifies fixture hashes, selected coordinates, glyph IDs, sample
coverage and matching native versions before comparing. Four retained negative
controls reject a wrong source hash, missing paint case, different Chromium
version and duplicate platform. Syntax checks pass on Node 24. No product code
changed, so the full corpus is supported by the completed `41311de` run rather
than an unnecessary local rerun of unchanged runtime files.

The next rendering experiment must paint the accepted glyph IDs and per-glyph
positions from the same run used for layout. It must preserve selectable and
accessible logical text, original UTF-16 source ranges, rich formatting,
preview editing/undo and editable PPTX semantics. Verify complete lines,
combining marks, ligatures and full-slide ink; uniform final-width adjustment
is not a substitute for the accepted positions. Existing native-text gates
remain visible and unchanged. Wider axis mapping, bidi/itemization, fallback,
resource lifetime/performance and native Office/font/export gates remain open.

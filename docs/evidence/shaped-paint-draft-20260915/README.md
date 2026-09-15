# Prepared glyph painting — draft checkpoint

Implementation `e46a85008cac72ff8f93a155a24b6e29a8d062cf` paints the selected
HarfBuzz glyph paths at their measured positions while retaining transparent
logical SVG text. It remains behind the prepared shaping option. Fontkit's
default rendering and the accepted layout are unchanged.

The local Node 24.21.0 suite passes, including 650 supported glyph runs,
13 explicit coverage rejections, five unchanged-layout/logical-text slides and
the existing 805-slide/126-deck raster regression. The new browser command
**fails**; this checkpoint preserves that result rather than accepting or
relaxing its pixel comparison.

## Browser result

`fnm exec --using=24 npm run test:painting-browser` reproduces the retained
Chromium 153.0.8010.12 Mac test. It checks 33 bundled/Office faces and 188
variable instances with three source strings, for 663 attempted cases.

- All 650 supported cases keep source text, glyph IDs, exact advances and
  nonempty ink. Thirteen unsupported-character cases reject explicitly.
- Five full slides produce identical SVG in Node and the browser. Selecting
  logical text returns the original selected text. Replacing its native font
  family leaves visible slide PNGs unchanged. These are focused controls, not
  full editor selection, undo or accessibility acceptance.
- SVG painting and a separately constructed Canvas Path2D reference differ
  in 54 supported cases. The largest alpha difference is 4/255; the comparison
  requires zero. The first failure is Caladea Bold, with two differing pixels
  at alpha difference 1. The cause remains unverified.
- The browser makes only the three routed local requests, reports no page
  errors and disposes the registered font faces. Original font hashes and all
  case observations are retained in `browser.json.gz`.

`summary.json` lists every pixel mismatch. The raw report is written before the
test's final assertions, so use the retained failing process log and summary
for its status. The five PNGs are retained for subsequent visual review; their
presence does not establish complete visual acceptance.

## Remaining acceptance

Investigate SVG/Canvas pixel differences without changing the zero-difference
comparison. Verify caret and selection geometry against the visible glyphs,
preview editing/undo, browser platforms, fresh installed packages and native
export. Logical SVG text still relies on native DOM Range geometry, whose
agreement with the painted glyphs is not established. Color and bitmap font
painting rejects explicitly; paragraph bidi, fallback and broader font
coverage retain their existing open requirements.

The new browser test is available as an explicit command and is not yet wired
into the installed-package or CI matrices. Existing native variable-font gates
remain unchanged. The preceding `74f0b8b` CI completed: Mac/Windows shaping jobs
passed; Linux source and fresh installed variable-font gates failed. Its
failure log is retained separately and does not describe this new painter.

No package was published, no draft was merged and no website adopted this
candidate. `manifest.json` records source and artifact hashes for this
checkpoint, including the comment-only difference after the browser run.

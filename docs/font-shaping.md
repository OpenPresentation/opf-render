# Prepared font shaping

This unpublished candidate adds `loadHarfBuzzShaper` and a `fontShaper` registry
option: the first runtime step of the
[source-preserving shaping plan](https://github.com/OpenPresentation/opf/blob/2ca9e7b/docs/plans/font-shaping.md).
Fontkit stays the default until the format, layout and compatibility checks
below are accepted.

## Use one service and one registry

```js
import {loadHarfBuzzShaper} from '@openpresentation/opf-render/font-shaping';
import {prepareNodeFonts} from '@openpresentation/opf-render/fonts-node';

const fontShaper = await loadHarfBuzzShaper();
const {registry, options} = await prepareNodeFonts({
  pack: 'office', substitutionPolicy: 'visual', fontShaper,
});
// Pass these same options to layout, SVG, editing, and PPTX export.
const run = registry.shapeText('Original o\u0302\u0301 source', {
  fontFamily: 'Arimo', fontWeight: 400,
});
registry.dispose(); // When this registry's final owner is finished.
```

The initializer loads pinned `harfbuzzjs` 1.6.1 / HarfBuzz 14.4.0 asynchronously.
One service can be shared by multiple registries. The synchronous
`createFontRegistry(entries, {fontShaper})` also accepts that prepared service;
measurement/layout never initialize WASM or return promises.
`loadBrowserFontRegistry(entries, {fontShaper})` registers host-selected font
bytes. A selected TTC face is extracted to a standalone SFNT for both browser
painting and embedding, including when using the default measurement backend.
Family/weight/style selection, aliases, theme resolution,
substitution records, coverage errors, embedding and licenses retain existing
registry policy. Missing glyphs do not cause an implicit font fallback.

`shapeText` exists only when a shaper is configured. Its copied result retains
the original `text`. Each glyph has UTF-16 `cluster`, `sourceStart` and
`sourceEnd` offsets; multiple glyphs may share a source range. Glyph positions
use font units, while `width` and `outline` use ems. `textMeasurement` scales
the latter to the font size. Advances and outlines come from the same shaped
run. A null outline means no vector ink, not successful missing-glyph coverage
or raster containment. Mutating returned glyphs/outlines cannot corrupt caches.

Initializer settings are `language` (default `und`), four-letter `script`,
horizontal `direction` (`ltr` or `rtl`), and OpenType `features` such as
`['liga=0']`. They are captured for the service's lifetime. Caches are isolated
by physical face, engine and settings, with per-face limits of 512 entries and
8,192 glyph objects. Strings above 2,048 UTF-16 units are not cached.
Idempotent registry disposal drops its reusable font/buffer references;
upstream uses garbage-collection finalizers, so this does not promise immediate
WASM memory reclamation. Other registries remain usable.

## Experimental SVG glyph painting

A prepared HarfBuzz registry now exposes `textPainting`. Its `shape(text,
style)` returns a copied measured run with a vector `path` on each glyph and
underline/strikethrough metrics from the selected physical font and instance.
It does not add paths to the measurement cache or change source text, glyph
positions, advances, or layout. Color and bitmap font painting is unsupported
and rejects explicitly instead of substituting monochrome outlines.

`prepareNodeFonts({fontShaper})` includes this provider in its returned options.
For browser registries, supply both providers from the same registry:

```js
const options = {
  textMeasurement: registry.textMeasurement,
  textPainting: registry.textPainting,
  embeddedFonts: registry.embeddedFonts,
  trace: true,
};
```

SVG rejects a painter paired with a different measurement provider. Visible
paths use the selected glyphs and their complete per-glyph positions, without
stretching ink to a final width. Logical SVG text remains transparent and
selectable, preserving whitespace, links, formatting and traced source ranges.
Fontkit remains the default; callers can omit `textPainting` to retain native
SVG text painting with the prepared measurement provider.

This is a **draft implementation**, not accepted editor or export integration.
The Node check covers 650 glyph runs, 13 explicit coverage failures and five
slides with unchanged accepted geometry and logical text. The default
805-slide raster regression remains unchanged. Browser pixel acceptance,
precise caret/selection geometry, preview editing/undo, fresh installed painting
checks and native export acceptance remain open. In particular, preserving
logical text does not prove native DOM Range geometry matches the visible
glyph paths. No package release or production-site adoption is implied.

The first [browser painting checkpoint](evidence/shaped-paint-draft-20260915/README.md)
preserves all 663 attempted cases and its failing pixel gate: 54 of the 650
supported cases differ from the independent Canvas reference, with maximum
alpha difference 4/255. The required difference remains zero. Run
`npm run test:painting-browser` to reproduce this separate draft check; it is
not yet part of the installed-package or CI matrices.

## Font containers and source preservation

The prepared service decodes WOFF and WOFF2 synchronously before Fontkit parses
the selected face and HarfBuzz shapes it. Standalone compressed inputs retain
their complete original bytes in `embeddedFonts`, including wrapper metadata
and private data. Usually these bytes are also used for painting. WOFF2 with
transformed horizontal metrics and literal glyph/location tables needs a
reconstructed standalone face for browser compatibility. In that case,
`dataUrl` contains the reconstructed face and `sourceDataUrl` retains the
original wrapper; `fontPreparations[].embeddingReason` reports
`woff2-hmtx-compatibility`. SVG uses the compatible face in CSS and preserves
the original source and license in `metadata[data-opf-font-sources="1"]`.
This increases the exported size for that combination. Reconstructed measurement bytes preserve OpenType tables,
with required checksum repair. WOFF2's glyf/loca/hmtx reconstruction may change
table packing; byte identity of reconstructed SFNT is not promised. Transformed
glyph-table `origLength` is an advisory value, not an allocation bound. Output
buffers grow with actual reconstructed data up to the configured byte limit.

For TTC and WOFF2 collections, supply `postscriptName`. Measurement, browser
FontFace loading and embedded CSS use that same selected standalone face.
Extraction preserves its tables without subsetting or renumbering glyphs.
WOFF2 collections validate shared glyph/location pairs. Reused glyph data
supplies its reconstructed bounds to each face while horizontal metric counts
remain specific to that face. Shared metric tables must reconstruct consistently;
partial glyph/location sharing and inconsistent dependencies reject explicitly.
DSIG signatures invalidated by reconstruction are removed, never represented
as still valid. `registry.fontPreparations` returns copied records containing
the selected PostScript name, source/measurement/embedded formats, whether a
collection face was selected, and `removedSignature`. A preserved original
standalone wrapper is distinct from reconstructed measurement bytes.

For a DFont, supply raw data-fork/resource-fork bytes and a unique
`postscriptName`, even when the container has one face. Both registry backends
extract the selected `sfnt` resource for measurement, browser loading and CSS.
The complete resource container, including other resources, names and trailing
bytes, remains in `sourceDataUrl` and SVG metadata alongside the license.
Preparation reports `sourceFormat: 'dfont'`, `embeddingReason: 'dfont-resource'`,
the original signed `selectedResourceId` and zero-based `selectedResourceIndex`.
Map/data boundaries, resource references, names, type/ID uniqueness and selected
font-table bounds are checked. Duplicate PostScript names require a different
input with an unambiguous selection. No OS resource lookup or font installation
occurs; MacBinary/AppleDouble wrappers and Type 1 suitcase conversion are not
implemented by this raw-resource reader.

Fixed variable instances are available in this draft through a font entry's
`variations` value: an axis map such as `{wght: 700, opsz: 20}` or a unique named
instance from that font. Omitted axes use the font's defaults; the logical CSS
weight does not choose an axis value. Unknown axes, ambiguous names and
out-of-range values reject instead of silently changing the caller's selection.
The registry records copied coordinates and the selected instance name and
passes the same coordinates to Fontkit, HarfBuzz, browser FontFace and SVG CSS.
The bounded `fvar` metadata adapter handles standard subfamily name IDs that
Fontkit 2.0.4 otherwise cannot resolve. Source font bytes remain unchanged.

Fontkit's selected instance now uses the OpenType fixed-point normalization
sequence before glyph, blend-vector and feature-variation caches are populated.
This includes the zero coordinate when an axis default equals its maximum,
validated `avar` 1.0 maps, and exact four-character axis tags. Original user
coordinates and font bytes remain intact. Unsupported mapping versions and
malformed mapping records fail explicitly; `avar` 2 is not implemented in this
adapter. For CFF2 horizontal advances, the registry then applies HarfBuzz's
integer HVAR-delta policy before Fontkit performs glyph positioning. Only that
advance contribution is rounded; interpolation, outlines, kerning and mark
positioning keep their own precision. TrueType advances and the prepared
HarfBuzz engine's metric policy remain unchanged. This is a deterministic
measurement policy, not a claim that every native rasterizer paints alike.

This variable-instance work is **not accepted for release**. After the CFF2
advance fix, source and fresh installed Mac matrices pass all 356 default
Fontkit cases; five prepared HarfBuzz TrueType cases remain above the unchanged
0.1px gate (maximum 0.132061px). The completed Linux run at `41311de` passes
all CFF2 cases and all 356 HarfBuzz cases, but fails five Fontkit TrueType cases
(maximum 0.134625px). All 712 source and installed pixel comparisons match
their original selected fonts. Matching those pixels verifies source-wrapper
and instance consistency; it does not establish agreement with measured glyph
positions. The fresh package still verifies 37 shipped-file hashes, the Node
matrix, public TypeScript consumers, 439 earlier browser pixel comparisons and
a zero-finding dependency audit before retaining the variable-font failure.

The [native portability evidence](evidence/native-metric-portability-20260915/README.md)
compares identical source fonts and instances in Chromium 153 on Mac, Windows
and Linux. Selected-outline controls support instance selection for the sampled
`H`, `g` and `W` glyphs; their rasterization is not identical. Native CFF2
advances agree between Mac and Linux but are rounded to pixels on Windows.
Repeated TrueType advances also differ between Mac and the other targets.
Some native widths differ by more than twice the precision target, so no one
common width can agree with both. This diagnostic does not relax a gate or
change product metrics. The experimental painter above supplies accepted
shaped positions and logical text; browser/editor acceptance and native
instance export still require a verified contract.

Metadata controls cover relocated and optional records, named PostScript
selection and explicit malformed inputs. The pinned HarfBuzz backend still
rejects hypothetical extended records. Earlier failures remain in the
[initial checkpoint](evidence/variable-instances-draft-20260914/README.md) and
[normalization/portability evidence](evidence/variable-metrics-portability-20260914/README.md).

`maxPreparedFontBytes` in registry options defaults to 64 MiB. It bounds source,
decoded data and selected-face output during prepared-service decoding, and
WOFF/WOFF2 decoding and TTC/DFont extraction with either backend. Compressed
fonts now use the bounded decoder in the default backend as well, because
Fontkit instance processing requires standalone bytes. This adds the codec to
the default browser dependency graph. Controlled minified bundle measurements
show +74,415 gzip bytes for the font-loader entry and +413 for SVG compared with
the preceding verified DFont package. This is not a production page-load result.
The byte limit is not a general memory budget for Fontkit. Invalid bounds, checksum failures and
over-expanding streams reject explicitly. Brotli output is limited before
reconstruction; zlib is streamed with declared-length checks. Essential font
preparation makes no network request.

WOFF2 reconstruction uses the pinned `woff-lib` 0.0.3 source, adapted at build
time to the synchronous bounded `brotli-lib` 0.0.7 decoder. The adapter verifies
the exact upstream SHA-256, adds stream/reconstruction bounds and excludes
native decompression and dynamic JavaScript evaluation. All upstream license
notices are included. WOFF1 uses pinned `fflate` 0.8.3. The Google WOFF2 encoder
used to generate fixtures is a development dependency only.

## Browser packaging

The browser export (or explicit `/font-shaping-browser`) loads a separate
runtime. Bundle as ESM and serve the exported
`@openpresentation/opf-render/harfbuzz.wasm` asset beside the resulting module
as `harfbuzz.wasm`. Keep those locations together when renaming deployment
assets. Hosts control these local files; no CDN, model call, account, system
font lookup or implicit remote font fetch is required.

The build fixes upstream's environment flag to the browser target, removing
Node filesystem/module branches for downstream bundlers. It does not change
the WASM. Both harfbuzzjs and
[HarfBuzz 14.4.0 license notices](https://github.com/harfbuzz/harfbuzz/blob/14.4.0/COPYING)
ship with the package. Verification uses actual local modules/WASM and
`script-src 'self' 'wasm-unsafe-eval'`, without JavaScript `unsafe-eval`.
Missing/rejected runtime assets produce `font-shaper-unavailable` with their
cause and a hosting/CSP explanation.

## Verification and remaining work

- `npm run test:shaping`: 264 face/text cases (231 shaped and 33 coverage
  rejections), UTF-16 ranges, features/direction, same-run metrics, bounded
  caches, physical selection, policy and disposal. Container checks cover 66
  WOFF/WOFF2 instances of all 33 bundled faces, four TTC/WOFF2 collection
  selections, source and table preservation, checksum repair, signature-removal
  reporting and malformed/decompression-limit controls.
- `npm run test:shaping-browser`: 198 cases over 33 exact faces, including
  those 33 coverage rejections. Node/browser glyph runs agree; unadjusted SVG
  advances differ by at most 0.01525px within the existing 0.1px gate. This
  also compares 439 actual canvas renders against the original selected faces,
  including both collection faces, compressed instances of all 33 fonts, and
  DFont selection through both backends. The 33 default-backend DFont cases
  compare Fontkit metrics/outlines; prepared cases compare shaped glyph runs.
  These checks use geometric precision, matching SVG configuration, and do not
  establish full-slide containment. The test bundle includes Fontkit and the
  actual SVG renderer; consult its
  recorded size rather than treating it as marginal application download cost.
- `test/font-woff2-reconstruction.mjs`: tiny and oversized transformed glyph
  length hints accepted by the independent Google decoder retain the original
  glyph runs with bounded output growth. Browser and fresh-package tests include
  both controls; actual decoded-size limits continue to reject.
- `test/font-woff2-hmtx.mjs`: all three horizontal-metrics transform flags
  across 33 faces with literal glyph/location tables. Every reconstructed
  advance and bearing equals the original font, including empty glyphs and
  shared advances in monospaced fonts. Seventeen malformed dependency/count/
  stream controls reject. Browser tests verify original wrapper/license
  retention through actual SVG metadata and identical nonempty pixels.
  The independent test-only FontTools check and the known Google decoder
  limitation are recorded in [metrics evidence](evidence/woff2-hmtx-20260914/README.md).
- `test/font-woff2-collections.mjs`: 198 selected-face cases across all 33
  source faces with shared glyphs and distinct advances/metric counts; four
  shared-metric/literal-glyph controls and seven malformed collection checks.
  The browser retains one page and prepared shaper across bounded fixture
  transfers. The independent check decodes each face's metrics, glyph geometry
  and instructions through FontTools, with its collection/compilation limits
  recorded in [collection evidence](evidence/woff2-collections-20260914/README.md).
- `test/font-dfont.mjs`: 66 selected-face/backend cases across all 33 bundled
  faces, first/single-resource controls and 19 malformed/selection checks.
  All selected tables, source runs, entire original containers and licenses
  survive; both backends load the same selected face in offline Chromium.
  Optional `test/font-dfont-fonttools.py` independently reads all 66 `sfnt`
  resources from the 33 raw resource containers and verifies their exact bytes,
  identities and order. See [resource evidence](evidence/dfont-resources-20260914/README.md).
- `npm run test:shaping-packed`: fresh core/renderer tarballs, byte-identical
  shipped modules/WASM/notices, Node/offline-browser checks, public TypeScript
  NodeNext/Bundler consumers and dependency audit.
- `test/font-shaping-akasia.mjs` takes an explicitly supplied open Akasia
  directory, the core study directory and a new output directory. It checks
  all 8,568 prior glyph runs/metrics plus three `fitText` fixtures through the
  registry, preserving source ranges and the fixed 32px floor.

Before default promotion: resolve the retained CFF2/variable advance failures and
complete installed variable-face/instance acceptance, language/script itemization,
paragraph bidi, supplementary characters, fallback, broader shaping settings,
memory/performance, complete slide/ink review, and shared editing/undo/PPTX
installed workflows with this backend. TTF, WOFF/WOFF2 and selected TTC/DFont
measurement/painting are exercised; accepting an OTF/SFNT signature alone is
not proof that the additional draft CFF/variable matrix is accepted.
Guessed buffer properties are not paragraph itemization or bidi. Unsupported
inputs must not silently switch shapers. Native Office recovery, tab/image
failures and physical-font identity retain their separate gates. No restricted
Aptos reference is used and no package/default promotion is claimed.

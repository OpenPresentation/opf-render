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
  fontFamily: 'Roboto', fontWeight: 400,
});
registry.dispose(); // When this registry's final owner is finished.
```

The initializer loads pinned `harfbuzzjs` 1.6.1 / HarfBuzz 14.4.0 asynchronously.
One service can be shared by multiple registries. The synchronous
`createFontRegistry(entries, {fontShaper})` also accepts that prepared service;
measurement/layout never initialize WASM or return promises.
`loadBrowserFontRegistry(entries, {fontShaper})` registers host-selected font
bytes as before. Family/weight/style selection, aliases, theme resolution,
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
  caches, physical selection, policy and disposal. A two-face TTC checks
  selection against each original font. A real WOFF checks that the default
  backend still supports it and the candidate rejects it explicitly.
- `npm run test:shaping-browser`: 198 cases over 33 exact faces, including
  those 33 coverage rejections. Node/browser glyph runs agree; unadjusted SVG
  advances differ by at most 0.01525px within the existing 0.1px gate. This
  does not inspect raster ink. The test bundle includes Fontkit; consult its
  recorded size rather than treating it as marginal application download cost.
- `npm run test:shaping-packed`: fresh core/renderer tarballs, byte-identical
  shipped modules/WASM/notices, Node/offline-browser checks, public TypeScript
  NodeNext/Bundler consumers and dependency audit.
- `test/font-shaping-akasia.mjs` takes an explicitly supplied open Akasia
  directory, the core study directory and a new output directory. It checks
  all 8,568 prior glyph runs/metrics plus three `fitText` fixtures through the
  registry, preserving source ranges and the fixed 32px floor.

Before default promotion: implement WOFF/WOFF2 preparation; verify browser
collection painting, variable faces/instances, language/script itemization,
paragraph bidi, supplementary characters, fallback, broader shaping settings,
memory/performance, complete slide/ink review, and shared editing/undo/PPTX
installed workflows with this backend. TTF and selected TTC measurement are
exercised; accepting an OTF/SFNT signature alone is not a CFF fixture matrix.
Guessed buffer properties are not paragraph itemization or bidi. Unsupported
inputs must not silently switch shapers. Native Office recovery, tab/image
failures and physical-font identity retain their separate gates. No restricted
Aptos reference is used and no package/default promotion is claimed.

# Prepared shaping service checkpoint

Node 24.21.0, harfbuzzjs 1.6.1, HarfBuzz 14.4.0; Chromium 153.0.8010.12.
This checkpoint exercises the actual candidate registry and public package
exports. It does not promote the backend or release a package.

- `node.json`: 264 cases across all 33 pinned base/Office-substitute faces;
  231 shape successfully and 33 preserve explicit missing-glyph errors.
  Sixteen accepted cases differ in advance from the current Fontkit backend.
- `browser.json`: 165 shaped cases and 33 matching coverage errors. Every
  glyph ID, UTF-16 cluster/range, advance and offset agrees with Node. Actual
  unadjusted SVG advances differ by at most 0.01525px (unchanged 0.1px gate).
  Requests are intercepted to local module/WASM bytes; every other URL rejects.
  CSP permits WASM but not JavaScript `unsafe-eval`; registry cleanup removes
  its 33 registered FontFaces.
- `initialization-failure.json`: a fresh page with missing WASM returns the
  actionable initialization error. It cannot reuse the successful page's module.
- `installed.json`: fresh renderer/core tarballs, shipped-file hashes, the Node
  and offline-browser tests, TypeScript 5.9.3 NodeNext/Bundler, zero dependency
  audit findings. This records the tested tarball, not npm publication.
- `akasia-registry.json`: the real registry matches all 8,568 prior probe
  glyph runs/metrics and three core `fitText` fixtures, including corrected
  omega/iota wrapping and source ranges at the fixed 32px floor. Input font
  hashes and prior study report hashes are recorded. Fonts are not copied here.
- `renderer-final.log`: the full existing suite passes, including all 805
  furniture-baseline golden slides using the unchanged default Fontkit backend.
- The initial packed TypeScript fixture omitted required `fontWeight`; its
  failure log is retained. Correcting the example passes both module modes.

The test browser bundle includes Fontkit and the service: approximately 794KB
JS plus 427KB WASM, or 211KB plus 174KB gzipped. It is not a marginal cost
measurement for an existing application. `getBBox` observations are retained
but do not establish hinted/antialiased ink containment.

Reproduce with `npm run test:shaping`, `npm run test:shaping-browser`, and
`npm run test:shaping-packed` after the documented coordinated Node 24 setup.
The Akasia check additionally takes the explicitly supplied open font directory,
the core study directory, and a new output directory. See
[the runtime plan and remaining gates](../../font-shaping.md).

`manifest.json` hashes the source/runtime checkpoint and retained reports.
Runtime source changes require new verification. Later prose changes do not
rewrite the earlier tarball's file hashes. Native Office, WOFF/WOFF2, browser
collections, variable fonts, itemization/bidi, full-slide review, and shared
editing/export acceptance remain open.

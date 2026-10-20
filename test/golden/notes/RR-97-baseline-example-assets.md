# RR-97: example baseline for core's embedded example assets

Core [opf#752](https://github.com/OpenPresentation/opf/pull/752) makes every example convert, as the new core check `check:examples-convert` verifies:
- **Gallery decks.** Each now embeds a generated supporting photo, an abstract MIT artwork from `scripts/gallery-artwork.mjs` v2, instead of naming a `./assets/<org>-field-photo.jpg` file that never existed.
- **Font schemes.** Twelve compact English decks no longer pick a complex-script or East Asian font scheme.
- **Technical examples.** Six technical examples now name image files that exist under `examples/technical/assets/`.

So slides that used to draw the "Image unavailable" placeholder now draw the image. The ordinary selection (`exampleBaseline(...)` in `scripts/example-baseline.mjs`) picks `opf-examples-png.rr97-example-assets/` for the variants contract, and the core 0.24.0 baseline keeps its bytes as `VARIANTS_EXAMPLE_BASELINE_CORE_0240`.

The directory started as a copy of the core 0.24.0 baseline. The `regenerate-goldens` workflow rewrites it in the pinned Playwright image, never from a local run.

## Review

(Filled in after the workflow's commit lands.)

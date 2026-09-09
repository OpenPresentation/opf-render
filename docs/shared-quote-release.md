# Prepared renderer 0.6.0

Branch `codex/shared-quote-release-20260909` prepares renderer 0.6.0 with core `^0.8.0`. It is unpublished. The original tested integration remains at `7f08cf9e6db1f5da58b96ca1625d9ae2614ea59b` on `codex/shared-quote-integration-20260909`; core PR #47 and the installed-browser CI PR #48 are merged. Core/CLI release PR [#49](https://github.com/OpenPresentation/opf/pull/49) is the predecessor publication gate.

The lockfile intentionally remains on the previous published dependency set until core 0.8.0 is available. Refresh it from npm, run a clean install, full Node 20/24 package/corpus/loaded-font browser tests, and verify a fresh packed consumer before opening the final release PR. Do not treat the prepared manifest or linked-source evidence as a complete installable release.

Linux CI/publication use the exact Playwright 1.63.0 image already verified by coordinated CI `34399051732`, pin its digest and check the installed test-package version. Full per-repository CI/review must pass before merge/tag/publication. No check is waived. Publish only a fresh `opf-render-v0.6.0` tag on the reviewed merge and verify npm/provenance before refreshing converter/editor locks.

The reviewed 41 quote-footer raster changes retain outer content boxes. Advance-based geometry, browser glyph containment and native raster equivalence remain distinct. Keep the earlier report bound to its exact source/font hashes.

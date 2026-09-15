# WOFF2 reconstructed glyph sizes

The format review after `955aaf8` found that the decoder allocated from the
original glyph-table size. WOFF2 explicitly allows reconstruction to produce a
different size: `origLength` for transformed glyph data is advisory. See
[WOFF2 table-directory and reconstruction requirements](https://www.w3.org/TR/WOFF2/#table_dir_format).

The retained regression changes only the transformed glyph-table length hint
in a Google-encoded Roboto fixture. Hints of 1 and 1,000,000 bytes both decode
to the same 160,324-byte font in the independent Google decoder. The prior
fresh-installed `955aaf8` registry rejects both under a 256 KiB limit; its exact
errors are in `initial-product-failure.log`. The first fixture edit omitted
required final alignment after changing the variable-length directory; that
Google rejection is preserved separately and corrected before the product
failure was established.

The adapter now grows output buffers from actual reconstructed bytes within
the configured limit. It does not require resizable ArrayBuffer support, use
the glyph hint as a hard bound, change glyphs, or relax resource limits. Tests
preserve original glyph IDs, source ranges, advances and outlines. Oversized
actual decoded data still rejects explicitly.

`reconstruction.json` records both fixtures. `installed.json.gz` retains fresh
core/renderer tarball hashes, all 34 installed-file checks, public TypeScript
consumers, the full Node/container matrix and the offline browser's 72 exact
nonempty canvas comparisons (including these two inputs). Browser advances
stay inside the unchanged 0.1px gate and the existing CSP. Audit findings: zero.
The full renderer suite again passes all 805 reviewed-baseline slides.

Reproduce with `npm run test:shaping` and `npm run test:shaping-packed` on the
documented coordinated Node 24 setup. `manifest.json` hashes the changed
runtime, tests and reports; gzip is deterministic and lossless. This supersedes
the original container checkpoint only for the corrected reconstruction path.
The original checkpoint and its cross-platform CI remain historical evidence.

The backend remains opt-in and unpublished. Remaining font-format work includes
DFont, CFF/CFF2/variable instances, and applicable null-glyf/transformed-hmtx
combinations. Paragraph handling, full-slide/ink/editor/export acceptance and
native compatibility retain their separate gates. No source normalization,
restricted font inputs, Office calls, release or site deployment occurred.

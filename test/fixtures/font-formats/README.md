# Open font fixtures for CFF and fixed variable instances

These 16 files are unmodified Adobe Source Sans and Source Serif fonts under
SIL Open Font License 1.1. Each family includes its upstream license. They are
test fixtures and are excluded from the published package's `files` list.

`manifest.json` pins repository revision, upstream path, Git blob identity,
SHA-256 and byte length for every font and license. The fixture loader verifies
those hashes before running either matrix. `reference.json` records independent
FontTools metadata for all 16 fonts and 148 named instances.

Regenerate the reference from the renderer root with Python and FontTools 4.60.2:

```sh
python test/font-variations-reference.py
```

The JavaScript harness generates WOFF, WOFF2, TTC and DFont wrappers in memory.
It preserves the original font tables and does not distribute renamed or
modified font designs. The instance coordinates are runtime selections; the
original upstream binaries and licenses remain intact.

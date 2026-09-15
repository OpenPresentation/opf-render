# Joint source-run painting

Compatible rich source runs now share accepted shaping geometry. The renderer
consumes core shaping groups and preserves their run-relative source spans in
tracing. Fontkit/native SVG and optional prepared glyph paths keep kerning and
ligatures across paint-only changes. Equivalent paint spans share decorations;
different colors inside a ligature use the same glyph with same-run caret cuts.
Whole glyphs retain their ink overhangs. A style boundary inside one grapheme
assigns its paint to the first source span without rewriting the document.

The [core contract](https://github.com/OpenPresentation/opf/blob/07cfa58da2c50649e7b7dc58f82418df1fc12b4e/docs/plans/rich-source-shaping.md)
describes the coordinated geometry API and remaining fidelity boundaries.
`test/font-source-groups.mjs` verifies actual shapes, source spans and wrapping;
`test/font-source-groups-browser.mjs` compares eight native/prepared pixel-and-copy
pairs, identical decorations and a colored linked ligature. Both participate in
fresh-package verification. The existing complete painting and golden suites
remain required. Native variable-font and Office gates are unchanged.

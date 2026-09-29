# FF-22: finite chart axes and bounded overflow rejection

This isolated repair starts at renderer #42 head `2f32414d2e0ad10679fe6fae4614e4fd8c6e4ebd`. It does not rebase or resolve that draft's conflicts with main. The original branch is unchanged.

The draft's `niceScale` search cannot progress after an underflowed tick step produces `-Infinity`, or overflowed headroom produces `Infinity`. The retained negative control runs the new public-renderer test against the exact original dist and fails after its 2-second worker deadline. Original independent 500 ms controls are in the preceding chart review. All fixtures remain schema-valid.

## Change and contract

- The exponent search is bounded. When its intermediate arithmetic cannot represent a scale, calculate bounds/ticks in normalized units, restore finite endpoints, and deduplicate ticks merged by subnormal precision. Extra headroom stops at the finite numeric endpoints; authored values are not clamped or rewritten.
- Category/scatter/radar coordinate fractions divide before subtraction only where a finite range would otherwise overflow. Ordinary arithmetic stays unchanged.
- Unrepresentable stacked, percentage or pie/doughnut totals throw an actionable `RangeError` naming `slides.0.chart` and asking the caller to rescale. No empty-chart substitution, invalid SVG, silently removed input or private stack behavior. **Such overflowing aggregates remain an unsupported fidelity case.**
- README documents precision/headroom and rejection limits. No font, export/parser, package version, tolerance, golden manifest or native code change.

## Verification

Node 24.21.0 on macOS, fresh frozen `npm ci`: 45 packages, audit zero vulnerabilities. npm reported an unapproved esbuild postinstall script; the recorded copy build and these tests do not invoke esbuild. No script-policy change was made.

| Check | Result |
|---|---|
| New `test/chart-scale.mjs` against original draft dist | Expected failure: public `renderSvg` does not return by 2-second post-import deadline |
| Same new test against candidate dist | 36 geometry cases pass across column, bar, line-with-markers, area, radar-with-markers, scatter; 8 overflow cases reject explicitly |
| Existing chart types | 93 checks pass |
| Existing chart colors | 40 checks pass |
| Exact ordinary before/after public SVG comparison | 468/468 byte-identical; 26 kept +50 aliases +donut +unknown ×6 data sets |
| Build, typecheck, package validation | Pass |
| Source/dist identity, tracked diff whitespace | Pass |

The 36 cases include ordinary, minimum-subnormal, subnormal, maximum, mixed positive/negative extremes and negative extremes. They require finite SVG geometry, all authored marks, proportional bar magnitudes, bounded bars, distinct points, scatter numeric ordering, non-collapsed area geometry, real axes and no placeholder output. Rendering and rejection leave input JSON unchanged. Worker deadlines contain hangs; they do not relax a product acceptance timeout.

`ordinary-comparison.json` records both hashes for every unchanged SVG. The baseline uses exact committed dist with the candidate's same installed dependencies. This establishes ordinary **SVG** equality on that matrix, not all raster/browser/native output.

Four synthetic PNG/SVG pairs use bundled fonts with system fonts disabled and estimated layout. This agent viewed all four; root independently viewed all four and reran the 36+8 test. Bars preserve magnitude/sign and scatter preserves positions. Subnormal axis labels are readable. **Limits remain visible:** the mixed-extremes title is clipped at its left edge, and extreme scatter axis labels overlap at the bottom-left / reach the edge. No complete readability, loaded-font browser, pixel-parity or native acceptance claim.

## Remaining gates

Renderer #42 / PPTX #76 still require current-main conflict resolution, fresh combined acceptance and reviewed golden changes. Cross-export numeric parsing (`"1e3"`→1000 preview /13 PPTX), missing-value semantics and scatter label reimport loss are separate blockers, not fixed here. Seven retained extended chart types still use fallbacks. Native work belongs solely to the remote Windows owner. Existing app canonical34/39 and Windows38/39 historical gates remain separate and open.

This is a stacked repair PR only. No merge, release, deployment, workflow rerun, tolerance change or Office action is authorized by this proof.

## Reproduction and evidence

From candidate checkout: `fnm exec --using=24 npm ci`; `npm run build`; `node test/chart-scale.mjs`; `node test/chart-types.mjs`; `node test/chart-colors.mjs`; `npm run typecheck`; `npm run validate`, all through the same Node24 runtime. Exact logs are retained. `compare-ordinary.mjs` and `render-review.mjs` are evidence scripts whose sibling paths refer to the isolated workspace; archived copies have `.txt` suffixes. Source snapshots also end `.txt`.

The preceding frozen review is `/private/tmp/opf-resume-20260929/chart-pr-review/REPORT.md`, compact manifest SHA256 `6a29592511a6ced16318967de07d083ad42df92308778713562b9412fbf4977d`. It binds original PR checks, conflicts, source semantics, synthetic SVG/PPTX controls and strict separation of installed/source/native evidence.

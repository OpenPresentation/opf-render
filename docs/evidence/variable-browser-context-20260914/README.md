# Variable browser context checkpoint

The native diagnostic now records both `none` and `normal` kerning. CI uses
the pinned Playwright Chromium on Mac and Windows, and additionally measures
the system Edge browser on Windows. This separates browser version and text
configuration from operating-system differences. Product metrics, original
font bytes and the unchanged 0.1px acceptance tolerance are unaffected.

The local Mac run uses Chromium 153.0.8010.12 and covers 188 instance selections
with 2,256 measurements. Switching kerning mode does not change the measured
widths of the repeated `H` specimens. The largest CFF2 discrepancy remains
4.57px for Fontkit and 0.01px for HarfBuzz; the largest TrueType discrepancy is
0.023px for Fontkit and 4.57px for HarfBuzz. These are diagnostic observations,
not a passing fidelity gate.

The preceding Windows CI probe used system Edge 152.0.4191.66 and only disabled
kerning. Its repeated CFF2 runs differ by up to 66.45px from Fontkit and 64.52px
from HarfBuzz. Those observations cannot yet be generalized to pinned Chromium,
normal kerning, or the separate full variable-font browser acceptance matrix.
The raw report is preserved; new Windows results remain pending at this
checkpoint. The diagnostic requires finite positive measurements and cleanup,
but deliberately does not assert agreement with either metric calculation.

[Run 34934597594](https://github.com/OpenPresentation/opf-render/actions/runs/34934597594)
at `a5f3ec6d8acbccaae3ade462621349070d5244f7` is complete. Mac and Windows Node
shaping and diagnostics pass. Linux passes the existing corpus, browser,
coordinated installed-package and audit checks, then fails both the fresh
installed and source variable browser advance gates. Both reports are saved
before failure. The first failure is Source Serif Roman CFF2, SmText Bold,
Fontkit: 334.06300884955755px measured versus 334.193115234375px in the browser.
The raw logs from all three jobs are retained without rewriting prior evidence.

Run `npm run test:variation-metrics-probe` with Node 24 and the pinned browser.
To compare Edge, set `OPF_FONT_PROBE_BROWSER_CHANNEL=msedge` and supply a separate
output path. The manifest records source hashes plus compressed and decoded
evidence hashes. No package release or site deployment is part of this change.

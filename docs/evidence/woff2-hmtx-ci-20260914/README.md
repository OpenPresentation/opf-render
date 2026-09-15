# Coordinated core dependency for shaping CI

The first optional-metrics CI run at `f5a0275` failed in the Mac and Windows
jobs before those new cases executed. Both jobs loaded published core 0.9.0;
the new test imports the actual SVG renderer, which uses candidate composition
exports such as `chartColorForFill`. The existing shaping/container cases
passed first. Both raw failure logs are retained as lossless gzip files.

The jobs now check out and build the same exact core candidate used by Linux:
`8a322c13884f2f1634fd3a207d1e0a662e3ad460`. They install that local package
without changing the committed package manifest or lockfile, then run the
unchanged renderer build and complete shaping/metrics tests. Node remains 24;
no test, source-preservation assertion or tolerance is removed.

This corrects the CI dependency graph. Consult the current PR21 checks for the
subsequent run; the local/fresh-installed acceptance at `f5a0275` and these
cross-platform failures are separate evidence. No runtime or published-package
dependency changed. The manifest retains original log and workflow hashes.

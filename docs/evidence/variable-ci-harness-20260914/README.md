# Variable checkpoint CI harness corrections

[Run 34932416004](https://github.com/OpenPresentation/opf-render/actions/runs/34932416004)
at `28bd820` exposed two harness failures before Linux could reach the new
browser acceptance gate. Mac Node shaping, including the new matrix, passed.

- Windows checked out the pinned Source Sans license with transformed line
  endings, invalidating its upstream byte hash. A narrow `.gitattributes` rule
  now disables text conversion for both pinned upstream license files. A
  checkout with `core.autocrlf=true` preserves both manifest hashes. Validation
  still compares exact bytes; it does not normalize or relax license hashes.
- The disposable font-integrity consumer manually linked Fontkit but omitted
  the `fflate` dependency now reached by the default compressed-font decoder.
  Its dependency setup now links both. The local Node 24 preparation suite
  passes with all original font/license/version corruption and recovery guards.

Raw failures and the successful local preparation log are retained with hashes.
This correction changes test setup only. New-head CI must be checked separately.
The ten retained variable-instance browser advance failures remain unresolved;
no tolerance, product font data, or comparison behavior changed.

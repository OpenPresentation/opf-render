"""Independent, optional test-only check of the generated WOFF2 fixtures."""
import hashlib
import json
import sys
from importlib.metadata import version
from pathlib import Path
from fontTools.ttLib import TTFont

manifest = Path(sys.argv[1])
report = json.loads(manifest.read_text())
root = manifest.parent / report['inputDirectory']
cases = []
for item in report['cases']:
    source, encoded = root / item['sourceFile'], root / item['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sourceSha256']
    assert hashlib.sha256(encoded.read_bytes()).hexdigest() == item['sha256']
    with TTFont(source, recalcBBoxes=False, recalcTimestamp=False) as original:
        with TTFont(encoded, recalcBBoxes=False, recalcTimestamp=False) as decoded:
            expected_order, actual_order = original.getGlyphOrder(), decoded.getGlyphOrder()
            assert actual_order == expected_order
            expected = [original['hmtx'].metrics[glyph] for glyph in expected_order]
            actual = [decoded['hmtx'].metrics[glyph] for glyph in actual_order]
            assert actual == expected
            assert len(actual) == item['numGlyphs']
            assert b'opf-hmtx-fixture' in decoded.flavorData.metaData
            assert decoded.flavorData.privData == b'OPF private wrapper sentinel'
            cases.append({'file': item['file'], 'sha256': item['sha256'], 'glyphs': len(actual), 'exactMetrics': True, 'wrapperMetadata': True})
result = {'python': sys.version, 'fonttools': version('fonttools'), 'brotli': version('brotli'),
          'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(), 'cases': cases}
Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n')
print(f"FontTools independently accepts {len(cases)} WOFF2 fixtures with exact original per-glyph metrics.")

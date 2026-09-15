"""Independent font-data check; FontTools does not decode whole WOFF2 collections.

Parse the collection directory, rewrap each face's unchanged transformed tables
as a standalone WOFF2, then let FontTools reconstruct its metrics and outlines.
The Google-accepted baseline separately checks the original collection.
"""
import hashlib
import json
import struct
import sys
from copy import copy
from io import BytesIO
from pathlib import Path
from importlib.metadata import version
import brotli
from fontTools.misc import sstruct
from fontTools.ttLib import TTFont, TTCollection
from fontTools.ttLib.woff2 import (
    WOFF2DirectoryEntry, WOFF2HmtxTable, woff2DirectoryFormat, woff2DirectorySize,
)


def ushort(stream):
    code = stream.read(1)[0]
    if code < 253:
        return code
    if code == 253:
        return struct.unpack('>H', stream.read(2))[0]
    return (506 if code == 254 else 253) + stream.read(1)[0]


def face_views(data):
    stream = BytesIO(data)
    header = sstruct.unpack(woff2DirectoryFormat, stream.read(woff2DirectorySize))
    assert header['signature'] == 'wOF2' and header['sfntVersion'] == 'ttcf'
    assert header['length'] == len(data)
    entries = []
    for _ in range(header['numTables']):
        entry = WOFF2DirectoryEntry()
        entry.fromFile(stream)
        entries.append(entry)
    assert struct.unpack('>I', stream.read(4))[0] in (0x10000, 0x20000)
    faces = []
    for _ in range(ushort(stream)):
        count = ushort(stream)
        flavor = stream.read(4)
        indices = [ushort(stream) for _ in range(count)]
        tags = {entries[index].tag: index for index in indices}
        assert len(tags) == count
        assert tags['loca'] == tags['glyf'] + 1
        faces.append((flavor, indices))
    payload = brotli.decompress(stream.read(header['totalCompressedSize']))
    offset = 0
    table_data = []
    for entry in entries:
        table_data.append(payload[offset:offset + entry.length])
        offset += entry.length
    assert offset == len(payload)
    result = []
    for flavor, indices in faces:
        indices = sorted(indices)
        selected = [entries[index] for index in indices]
        directory = b''.join(entry.toString() for entry in selected)
        compressed = brotli.compress(b''.join(table_data[index] for index in indices), quality=4)
        output = copy(header)
        size = woff2DirectorySize + len(directory) + len(compressed)
        output.update(sfntVersion=flavor, numTables=len(indices), length=(size + 3) & ~3,
                      totalCompressedSize=len(compressed),
                      totalSfntSize=12 + 16 * len(indices) + sum((entry.origLength + 3) & ~3 for entry in selected),
                      metaOffset=0, metaLength=0, metaOrigLength=0, privOffset=0, privLength=0)
        result.append(sstruct.pack(woff2DirectoryFormat, output) + directory + compressed + b'\0' * (output['length'] - size))
    return result


def geometry(font, glyph_name):
    glyph = font['glyf'][glyph_name]
    coordinates, ends, flags = glyph.getCoordinates(font['glyf'])
    instructions = glyph.program.getBytecode() if hasattr(glyph, 'program') else b''
    return list(coordinates), list(ends), [flag & 1 for flag in flags], instructions


manifest = Path(sys.argv[1])
report = json.loads(manifest.read_text())
root = manifest.parent / report['inputDirectory']
views = {}
cases = []
for item in report['cases']:
    source, encoded = root / item['sourceFile'], root / item['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sourceSha256']
    assert hashlib.sha256(encoded.read_bytes()).hexdigest() == item['sha256']
    if item['file'] not in views:
        views[item['file']] = face_views(encoded.read_bytes())
    with TTFont(source, recalcBBoxes=False, recalcTimestamp=False) as original:
        with TTCollection(root / (item['file'].split('-')[0] + '.ttc')) as collection:
            assert collection.fonts[item['fontIndex']]['name'].getDebugName(6) == item['postscriptName']
            assert collection.fonts[item['fontIndex']]['hmtx'].metrics == original['hmtx'].metrics
        with TTFont(BytesIO(views[item['file']][item['fontIndex']]), recalcBBoxes=False, recalcTimestamp=False) as decoded:
            glyph_order = original.getGlyphOrder()
            assert decoded.getGlyphOrder() == glyph_order
            reader = decoded.reader
            if reader.tables['hmtx'].transformed:
                # Compare the independent decoder's table object before its
                # compiler collapses trailing advances and mutates only its
                # internal hhea. The resulting outer-reader size mismatch is
                # retained separately; do not change the valid input fixtures.
                for tag in ('maxp', 'hhea', 'glyf'):
                    reader._decompileTable(tag)
                entry = reader.tables['hmtx']
                reader.transformBuffer.seek(entry.offset)
                metrics = WOFF2HmtxTable()
                metrics.reconstruct(reader.transformBuffer.read(entry.length), reader.ttFont)
                reference = reader.ttFont
                reference_order = reference['glyf'].glyphOrder
                actual_metrics = metrics.metrics
            else:
                reference, reference_order = decoded, glyph_order
                actual_metrics = decoded['hmtx'].metrics
            assert len(reference_order) == len(glyph_order)
            assert [actual_metrics[glyph] for glyph in reference_order] == [original['hmtx'].metrics[glyph] for glyph in glyph_order]
            for expected_glyph, actual_glyph in zip(glyph_order, reference_order):
                assert geometry(reference, actual_glyph) == geometry(original, expected_glyph), (item['file'], expected_glyph)
            assert decoded['name'].getDebugName(6) == item['postscriptName']
            for name_id in (0, 13, 14):
                assert decoded['name'].getDebugName(name_id) == original['name'].getDebugName(name_id)
            cases.append({'file': item['file'], 'fontIndex': item['fontIndex'], 'sha256': item['sha256'],
                          'glyphs': len(glyph_order), 'exactMetrics': True, 'exactGeometryAndInstructions': True,
                          'identityAndLicense': True})
result = {'python': sys.version, 'fonttools': version('fonttools'), 'brotli': version('brotli'),
          'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
          'scope': 'Independent collection-directory parsing and per-face WOFF2 rewrapping; FontTools reconstructs metrics before recompilation, glyph geometry and instructions. Not whole-collection or outer-reader acceptance; its metric recompilation mismatch is retained separately.',
          'cases': cases}
Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n')
print(f"FontTools independently reconstructs {len(cases)} collection face views with exact metrics, geometry and instructions.")

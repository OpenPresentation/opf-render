"""Optional independent resource-parser check; never a product dependency."""
import hashlib
import io
import json
from pathlib import Path
import fontTools
from fontTools.misc.macRes import ResourceReader
from fontTools.ttLib import TTFont
root=Path('artifacts/font-shaping/dfont')
source=json.loads(Path('artifacts/font-shaping/dfont.json').read_text())
records=[r for r in source['faces'] if r['backend']=='harfbuzz']
report={'fontTools':fontTools.__version__,'resources':[],
        'scope':'Independent FontTools ResourceReader parses supplied raw data-fork bytes; selected sfnt bytes and identity match original standalone faces. No OS font installation or native Office claim.'}
sha=lambda data:hashlib.sha256(data).hexdigest()
for record in records:
    index=record['index'];data=(root/f'{index}.dfont').read_bytes()
    assert sha(data)==record['containerSha256']
    with io.BytesIO(data) as stream:
        reader=ResourceReader(stream)
        assert reader.types==['NOTE','sfnt']
        assert reader['NOTE'][0].data==b'Keep non-font resource\0bytes'
        assert reader['NOTE'][0].name=='annotation'
        assert len(reader['sfnt'])==2
        for resource,source_index in zip(reader['sfnt'],[(index+1)%len(records),index]):
            expected=(root/f'{source_index}.ttf').read_bytes()
            assert resource.data==expected
            assert resource.id==128+len([r for r in report['resources'] if r['container']==index])
            assert resource.attr==0x20
            font=TTFont(io.BytesIO(resource.data),checkChecksums=2)
            identity=font['name'].getDebugName(6)
            assert identity==records[source_index]['postscriptName']
            report['resources'].append({'container':index,'resourceId':resource.id,'postscriptName':identity,'sha256':sha(resource.data)})
Path('artifacts/font-shaping/dfont-fonttools.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"FontTools {fontTools.__version__}: {len(report['resources'])} sfnt resources in {len(records)} containers preserve every source byte, identity and resource order.")

"""Regenerate independent fixture metadata with FontTools 4.60.2 (test only)."""
import hashlib,json
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont
root=Path('test/fixtures/font-formats')
manifest=json.loads((root/'manifest.json').read_text())
result={'fontTools':fontTools.__version__,'fonts':[]}
for record in manifest['fonts']:
 data=(root/record['file']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==record['sha256']
 font=TTFont(root/record['file'],checkChecksums=2)
 name=lambda id:font['name'].getDebugName(id)
 axes={a.axisTag:{'min':a.minValue,'default':a.defaultValue,'max':a.maxValue,'name':name(a.axisNameID)} for a in font['fvar'].axes} if 'fvar' in font else {}
 instances=[{'name':name(i.subfamilyNameID),'nameId':i.subfamilyNameID,'postscriptName':name(i.postscriptNameID) if getattr(i,'postscriptNameID',65535)!=65535 else None,'coordinates':i.coordinates} for i in font['fvar'].instances] if axes else []
 result['fonts'].append({'file':record['file'],'sha256':record['sha256'],'postscriptName':name(6),'unitsPerEm':font['head'].unitsPerEm,'italic':bool(font['OS/2'].fsSelection&1),'outline':'CFF2' if 'CFF2' in font else 'CFF' if 'CFF ' in font else 'glyf','axes':axes,'instances':instances})
(root/'reference.json').write_text(json.dumps(result,indent=2)+'\n')
print('FontTools:',len(result['fonts']),'fonts;',sum(len(f['instances']) for f in result['fonts']),'named instances; all input hashes verified.')
